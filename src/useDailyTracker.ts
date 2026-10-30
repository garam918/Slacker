import { useCallback, useEffect, useRef, useState } from 'react'
import { saveRanking } from './rankings'
import { trackAnalyticsEvent } from './analytics'
import { archiveTracker, normalizeHistory, validHistorySettings } from './history'
import {
  acknowledge, advanceTracker, changeSession, clampSeconds, createSession,
  dayStart, elapsed, getTodayKey, restoreTotal, type PendingRecord, type Session, type Settings, type Tracker,
} from './session'

const STORAGE_KEY = 'slacker.dailyState'

function loadTracker(): Tracker {
  const now = Date.now()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Tracker | null
    const legacy = JSON.parse(localStorage.getItem('slacker.session') ?? 'null') as Partial<Session> | null
    const source = saved?.session ?? legacy
    const date = source?.sessionDate
    const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(dayStart(date)) && date <= getTodayKey(now)
    const session: Session = {
      ...createSession(now),
      ...(validDate ? source : {}),
      accumulatedSeconds: clampSeconds(Math.max(Number(source?.accumulatedSeconds ?? 0), Number(source?.submittedSeconds ?? 0))),
      submittedSeconds: clampSeconds(Number(source?.submittedSeconds ?? 0)),
      displayOffsetSeconds: clampSeconds(Number(source?.displayOffsetSeconds ?? Math.max(0, Number(source?.submittedSeconds ?? 0) - Number(source?.accumulatedSeconds ?? 0)))),
      startedAt: validDate && Number.isFinite(source?.startedAt) ? source!.startedAt! : null,
      isSlacking: Boolean(validDate && source?.isSlacking && Number.isFinite(source?.startedAt)),
      isOffWork: Boolean(source?.isOffWork),
    }
    const legacyPending = JSON.parse(localStorage.getItem('slacker.pendingRankings') ?? '[]') as Array<PendingRecord & { finalElapsedSeconds?: number; createdAt?: number }>
    const pending: PendingRecord[] = []
    for (const item of saved?.pending ?? legacyPending) {
      const recordDate = item.sessionDate ?? getTodayKey('createdAt' in item ? Number(item.createdAt) || now : now)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || !Number.isFinite(dayStart(recordDate))) continue
      const totalSeconds = clampSeconds(Number(item.totalSeconds ?? ('finalElapsedSeconds' in item ? item.finalElapsedSeconds : 0)))
      if (totalSeconds <= 0) continue
      const previous = pending.find(record => record.sessionDate === recordDate && record.uid === item.uid)
      if (previous) previous.totalSeconds = Math.max(previous.totalSeconds, totalSeconds)
      else pending.push({ sessionDate: recordDate, totalSeconds, uid: item.uid, nickname: String(item.nickname || '익명 루팡') })
    }
    return { session, pending, history: normalizeHistory(saved?.history), historySettings: validHistorySettings(saved?.historySettings) }
  } catch {
    return { session: createSession(now), pending: [] }
  }
}

export function useDailyTracker(nickname: string, uid: string | null, enabled: boolean, settings: Settings) {
  const [tracker, setTracker] = useState(loadTracker)
  const stateRef = useRef(tracker)
  const settingsRef = useRef(settings)
  const [now, setNow] = useState(Date.now)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [storageMessage, setStorageMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const savingRef = useRef(false)
  const retryDelayRef = useRef(1000)
  const retryTimerRef = useRef<number | undefined>(undefined)

  const update = useCallback((transition: (current: Tracker) => Tracker) => {
    const transitioned = transition(stateRef.current)
    if (transitioned === stateRef.current) return transitioned
    const next = archiveTracker(stateRef.current, transitioned, Date.now(), settingsRef.current)
    stateRef.current = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageMessage('')
    } catch {
      setStorageMessage('브라우저에 기록을 보관하지 못했습니다. 저장 공간과 사이트 데이터 설정을 확인해 주세요.')
    }
    setTracker(next)
    return next
  }, [])

  useEffect(() => {
    settingsRef.current = settings
    const tick = () => {
      const time = Date.now()
      setNow(time)
      update(current => {
        const next = advanceTracker(current, time, nickname, uid ?? undefined)
        const rate = validHistorySettings(settingsRef.current)
        const savedRate = current.historySettings
        const rateChanged = rate && (!savedRate || rate.salary !== savedRate.salary || rate.workDays !== savedRate.workDays || rate.workHours !== savedRate.workHours)
        const storedSeconds = current.history?.find(record => record.date === current.session.sessionDate)?.seconds ?? 0
        return next === current && (rateChanged || storedSeconds < current.session.accumulatedSeconds) ? { ...current } : next
      })
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [nickname, settings, uid, update])

  useEffect(() => {
    if (!enabled || !uid || !tracker.pending.some(item => !item.uid || item.uid === uid) || savingRef.current) return
    // One worker per hook; absolute totals make retrying the same record idempotent.
    savingRef.current = true
    window.clearTimeout(retryTimerRef.current)
    const save = async () => {
      setSaveStatus('saving')
      try {
        while (true) {
          const record = stateRef.current.pending.find(item => !item.uid || item.uid === uid)
          if (!record) break
          const saved = await saveRanking({ ...record, uid })
          update(current => {
            const next = acknowledge(current, record, saved)
            return record.sessionDate === next.session.sessionDate && saved > elapsed(next.session, Date.now())
              ? restoreTotal(next, record.sessionDate, saved, Date.now()) : next
          })
          trackAnalyticsEvent('ranking_saved')
        }
        retryDelayRef.current = 1000
        setSaveStatus('saved')
        if (stateRef.current.pending.length) setAttempt(value => value + 1)
      } catch {
        setSaveStatus('error')
        retryTimerRef.current = window.setTimeout(() => setAttempt(value => value + 1), retryDelayRef.current)
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000)
      } finally {
        savingRef.current = false
      }
    }
    void save()
  }, [attempt, enabled, tracker.pending, uid, update])

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), [])

  useEffect(() => {
    const retry = () => setAttempt(value => value + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  const act = useCallback((action: 'start' | 'pause' | 'finish' | 'reset') => {
    const time = Date.now()
    setNow(time)
    update(current => changeSession(current, action, time, nickname, uid ?? undefined))
  }, [nickname, uid, update])

  const restore = useCallback((date: string, total: number) => {
    update(current => restoreTotal(current, date, total, Date.now()))
  }, [update])

  const rename = useCallback((nextNickname: string) => {
    update(current => ({ ...current, pending: current.pending.map(record => ({ ...record, nickname: nextNickname })) }))
  }, [update])

  return { tracker, now, act, restore, rename, saveStatus, storageMessage, retry: () => setAttempt(value => value + 1) }
}
