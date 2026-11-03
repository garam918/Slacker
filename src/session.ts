export const MAX_DAILY_HOURS = 12
export const MAX_DAILY_SECONDS = MAX_DAILY_HOURS * 3600
export const MAX_RUN_MINUTES = 120
export const RUN_WARNING_MINUTES = 5
const RUN_MS = MAX_RUN_MINUTES * 60_000
const DAY_MS = 24 * 3600 * 1000
const KST_OFFSET_MS = 9 * 3600 * 1000

export type Settings = { salary: number; workDays: number; workHours: number }
export type Session = {
  sessionDate: string
  accumulatedSeconds: number
  submittedSeconds: number
  displayOffsetSeconds: number
  isSlacking: boolean
  startedAt: number | null
  runDeadlineAt?: number
  pausedByRunLimit?: boolean
  isOffWork: boolean
}
export type PendingRecord = {
  sessionDate: string
  totalSeconds: number
  nickname: string
  uid?: string
}
export type Tracker = {
  session: Session
  pending: PendingRecord[]
  history?: HistoryRecord[]
  historySettings?: Settings | null
}

export function getTodayKey(now = Date.now()) {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function dayStart(date: string) {
  return Date.parse(`${date}T00:00:00+09:00`)
}

export function clampSeconds(value: number) {
  // Preserve finalized records from when the daily limit was 14 hours.
  return Number.isFinite(value) ? Math.min(14 * 3600, Math.max(0, Math.floor(value))) : 0
}

export function clampDailySeconds(value: number) {
  return Math.min(MAX_DAILY_SECONDS, clampSeconds(value))
}

export function createSession(now = Date.now()): Session {
  return {
    sessionDate: getTodayKey(now), accumulatedSeconds: 0, submittedSeconds: 0,
    displayOffsetSeconds: 0, isSlacking: false, startedAt: null, isOffWork: false,
  }
}

export function validateSettings({ salary, workDays, workHours }: Settings) {
  if (!Number.isFinite(salary) || salary <= 0 || salary > 1_000_000_000) return '월급은 0원 초과, 10억 원 이하로 입력해 주세요.'
  if (!Number.isInteger(workDays) || workDays < 1 || workDays > 31) return '월 근무일은 1~31일의 정수로 입력해 주세요.'
  if (!Number.isFinite(workHours) || workHours <= 0 || workHours > 24) return '하루 근무시간은 0시간 초과, 24시간 이하로 입력해 주세요.'
  return ''
}

export function calculateAmount(seconds: number, settings: Settings) {
  if (validateSettings(settings)) return 0
  return Math.round(settings.salary * seconds / (settings.workDays * settings.workHours * 3600))
}

export function getRunDeadline(session: Session) {
  if (!session.isSlacking || session.startedAt === null) return null
  const fallback = session.startedAt + RUN_MS
  const deadline = session.runDeadlineAt
  return typeof deadline === 'number' && deadline >= session.startedAt && deadline <= fallback ? deadline : fallback
}

export function elapsed(session: Session, now: number) {
  const end = Math.min(now, dayStart(session.sessionDate) + DAY_MS, getRunDeadline(session) ?? Infinity)
  return clampDailySeconds(session.accumulatedSeconds + (
    session.isSlacking && session.startedAt !== null
      ? Math.max(0, Math.floor((end - session.startedAt) / 1000)) : 0
  ))
}

function enqueue(tracker: Tracker, nickname: string, uid?: string): Tracker {
  const session = tracker.session
  if (session.accumulatedSeconds <= session.submittedSeconds) return tracker
  const previous = tracker.pending.find(record => record.sessionDate === session.sessionDate && record.uid === uid)
  const record = {
    sessionDate: session.sessionDate,
    totalSeconds: Math.max(session.accumulatedSeconds, previous?.totalSeconds ?? 0),
    nickname, uid,
  }
  return {
    ...tracker,
    pending: [...tracker.pending.filter(item => item !== previous), record],
  }
}

// Split at KST midnight while preserving the original confirmation deadline.
export function advanceTracker(tracker: Tracker, now: number, nickname: string, uid?: string): Tracker {
  let result = tracker
  let session = result.session
  if (dayStart(session.sessionDate) > now) return tracker
  while (session.sessionDate !== getTodayKey(now)) {
    const midnight = dayStart(session.sessionDate) + DAY_MS
    const total = elapsed(session, midnight)
    const deadline = getRunDeadline(session)
    const keepRunning = deadline !== null && midnight < deadline && total < MAX_DAILY_SECONDS
    result = enqueue({ ...result, session: { ...session, accumulatedSeconds: total } }, nickname, uid)
    // An inactive day has no record to split, even after a long absence.
    const next = createSession(keepRunning ? midnight : now)
    session = {
      ...next, isSlacking: keepRunning, startedAt: keepRunning ? midnight : null,
      runDeadlineAt: keepRunning ? deadline : undefined,
      pausedByRunLimit: session.pausedByRunLimit || (deadline !== null && deadline <= midnight && total < MAX_DAILY_SECONDS),
    }
    result = { ...result, session }
  }
  const deadline = getRunDeadline(session)
  const total = elapsed(session, now)
  if (deadline !== null && (now >= deadline || total >= MAX_DAILY_SECONDS)) {
    const dailyLimitReached = total >= MAX_DAILY_SECONDS
    result = enqueue({ ...result, session: {
      ...session, accumulatedSeconds: total, isSlacking: false,
      startedAt: null, runDeadlineAt: undefined, isOffWork: dailyLimitReached,
      pausedByRunLimit: !dailyLimitReached,
    } }, nickname, uid)
  }
  return result
}

export function changeSession(tracker: Tracker, action: 'start' | 'continue' | 'pause' | 'finish' | 'reset', now: number, nickname: string, uid?: string): Tracker {
  let result = advanceTracker(tracker, now, nickname, uid)
  const session = result.session
  const total = elapsed(session, now)
  if (action === 'continue') {
    const deadline = getRunDeadline(session)
    if (deadline === null || deadline - now > RUN_WARNING_MINUTES * 60_000) return result
    return { ...result, session: {
      ...session, accumulatedSeconds: total, startedAt: now, runDeadlineAt: now + RUN_MS,
    } }
  }
  if (action === 'start') {
    if (session.isSlacking || total >= MAX_DAILY_SECONDS) return result
    return { ...result, session: {
      ...session, isSlacking: true, startedAt: now, runDeadlineAt: now + RUN_MS,
      isOffWork: false, pausedByRunLimit: false,
    } }
  }
  result = enqueue({ ...result, session: {
    ...session, accumulatedSeconds: total, isSlacking: false, startedAt: null,
    runDeadlineAt: undefined, pausedByRunLimit: false,
    isOffWork: action === 'finish' || total === MAX_DAILY_SECONDS,
    displayOffsetSeconds: action === 'reset' ? total : session.displayOffsetSeconds,
  } }, nickname, uid)
  return result
}

export function acknowledge(tracker: Tracker, record: PendingRecord, savedSeconds: number): Tracker {
  return {
    ...tracker,
    session: tracker.session.sessionDate === record.sessionDate ? {
      ...tracker.session, submittedSeconds: Math.max(tracker.session.submittedSeconds, savedSeconds),
    } : tracker.session,
    pending: tracker.pending.filter(item => !(
      item.sessionDate === record.sessionDate && item.uid === record.uid && item.totalSeconds <= savedSeconds
    )),
  }
}

export function restoreTotal(tracker: Tracker, date: string, total: number, now: number): Tracker {
  if (tracker.session.sessionDate !== date) return tracker
  const session = tracker.session
  const current = elapsed(session, now)
  const restored = clampDailySeconds(Math.max(current, total))
  const deadline = getRunDeadline(session)
  const keepRunning = deadline !== null && restored < MAX_DAILY_SECONDS
  return {
    ...tracker,
    session: {
      ...session, accumulatedSeconds: restored,
      submittedSeconds: Math.max(session.submittedSeconds, clampSeconds(total)),
      startedAt: keepRunning ? Math.min(now, deadline, dayStart(date) + DAY_MS) : null,
      runDeadlineAt: keepRunning ? deadline : undefined,
      isSlacking: keepRunning,
      isOffWork: session.isOffWork || restored === MAX_DAILY_SECONDS,
    },
  }
}

export function nextRankingTotal(stored: number, incoming: number) {
  return Math.max(clampSeconds(stored), clampDailySeconds(incoming))
}
import type { HistoryRecord } from './history'

