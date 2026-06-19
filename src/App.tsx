import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import AdBanner from './AdBanner'
import ContentSections from './ContentSections'
import {
  markActiveSlacker,
  markInactiveSlacker,
  subscribeToActiveSlackerCount,
} from './activity'
import { auth, isFirebaseConfigured } from './firebase'
import {
  getRankingTopPercent,
  isNicknameAvailable,
  renameRankingNickname,
  saveRanking,
  subscribeToRankings,
  type RankingEntry,
  type RankingSort,
} from './rankings'

type Settings = {
  salary: number
  workDays: number
  workHours: number
}

type SavedSession = {
  sessionDate: string
  accumulatedSeconds: number
  submittedSeconds: number
  pendingSubmittedSeconds: number
  isSlacking: boolean
  startedAt: number | null
  isOffWork: boolean
  finishedAmount: number | null
}

type PendingRankingSubmission = {
  id: string
  uid?: string
  nickname: string
  elapsedSeconds: number
  earnedAmount: number
  salary: number
  workDays: number
  workHours: number
  finalElapsedSeconds: number
  sessionDate: string
  createdAt: number
}

const SETTINGS_KEY = 'slacker.settings'
const SESSION_KEY = 'slacker.session'
const NICKNAME_KEY = 'slacker.nickname'
const PENDING_RANKINGS_KEY = 'slacker.pendingRankings'
const MAX_NICKNAME_LENGTH = 12
const MAX_DAILY_SLACKING_SECONDS = 14 * 60 * 60
const SHARE_URL = 'https://slacker-nu.vercel.app/'
const blockedNicknameWords = [
  'admin',
  'administrator',
  'assault',
  'blood',
  'fuck',
  'kill',
  'killer',
  'murder',
  'nazi',
  'porn',
  'rape',
  'rapist',
  'sex',
  'sexy',
  'shit',
  'slut',
  'suicide',
  'terror',
  'terrorist',
  'violent',
  'whore',
  'bitch',
  '운영자',
  '관리자',
  '강간',
  '겁탈',
  '고문',
  '나치',
  '따먹',
  '살인',
  '섹스',
  '성교',
  '성폭행',
  '성희롱',
  '야동',
  '음란',
  '자살',
  '잔혹',
  '테러',
  '폭력',
  '학살',
  '협박',
  '시발',
  '씨발',
  '병신',
  '개새끼',
  '좆',
  'ㅅㅂ',
  'ㅂㅅ',
]

const defaultSettings: Settings = {
  salary: 3000000,
  workDays: 21,
  workHours: 8,
}

function getTodayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDefaultSession(): SavedSession {
  return {
    sessionDate: getTodayKey(),
    accumulatedSeconds: 0,
    submittedSeconds: 0,
    pendingSubmittedSeconds: 0,
    isSlacking: false,
    startedAt: null,
    isOffWork: false,
    finishedAmount: null,
  }
}

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ko-KR')

function formatWon(amount: number) {
  return `${numberFormatter.format(Math.floor(amount))}원`
}

function clampDailySeconds(seconds: number) {
  return Math.min(Math.max(Math.floor(seconds), 0), MAX_DAILY_SLACKING_SECONDS)
}

function getCurrentSession(session: SavedSession): SavedSession {
  if (session.sessionDate !== getTodayKey()) {
    return createDefaultSession()
  }

  return {
    ...session,
    accumulatedSeconds: clampDailySeconds(session.accumulatedSeconds),
    submittedSeconds: clampDailySeconds(session.submittedSeconds),
    pendingSubmittedSeconds: clampDailySeconds(session.pendingSubmittedSeconds),
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const value = window.localStorage.getItem(key)
    if (!value) {
      return fallback
    }

    const parsedValue = JSON.parse(value)

    if (
      fallback &&
      typeof fallback === 'object' &&
      parsedValue &&
      typeof parsedValue === 'object' &&
      !Array.isArray(parsedValue)
    ) {
      return { ...fallback, ...parsedValue } as T
    }

    return parsedValue as T
  } catch {
    return fallback
  }
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function formatShareDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = [
    hours > 0 ? `${hours}시간` : '',
    minutes > 0 ? `${minutes}분` : '',
    seconds > 0 || totalSeconds === 0 ? `${seconds}초` : '',
  ].filter(Boolean)

  return parts.join(' ')
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function createAnonymousNickname() {
  return `익명 루팡 ${Math.floor(1000 + Math.random() * 9000)}`
}

function createSubmissionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function validateNickname(value: string) {
  const nickname = value.trim()
  const normalizedNickname = nickname.toLowerCase().replace(/[\s_-]/g, '')

  if (nickname.length < 2) {
    return '닉네임은 2자 이상이어야 합니다.'
  }

  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return `닉네임은 ${MAX_NICKNAME_LENGTH}자 이하여야 합니다.`
  }

  if (!/^[가-힣a-zA-Z0-9 _-]+$/u.test(nickname)) {
    return '닉네임에는 한글, 영문, 숫자, 공백, -, _만 사용할 수 있습니다.'
  }

  if (blockedNicknameWords.some((word) => normalizedNickname.includes(word))) {
    return '사용할 수 없는 닉네임입니다.'
  }

  return ''
}

function mergeRankingEntry(
  entries: Record<string, RankingEntry>,
  nickname: string,
  elapsedSeconds: number,
  earnedAmount: number,
) {
  const currentEntry = entries[nickname] ?? {
    id: nickname,
    nickname,
    elapsedSeconds: 0,
    earnedAmount: 0,
  }

  entries[nickname] = {
    ...currentEntry,
    elapsedSeconds: currentEntry.elapsedSeconds + elapsedSeconds,
    earnedAmount: currentEntry.earnedAmount + earnedAmount,
  }
}

function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    readStorage(SETTINGS_KEY, defaultSettings),
  )
  const [session, setSession] = useState<SavedSession>(() =>
    getCurrentSession(readStorage(SESSION_KEY, createDefaultSession())),
  )
  const [nickname, setNickname] = useState(() => {
    const savedNickname = readStorage<string | null>(NICKNAME_KEY, null)

    return typeof savedNickname === 'string' && savedNickname !== '[object Object]'
      ? savedNickname
      : createAnonymousNickname()
  })
  const [uid, setUid] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState(
    isFirebaseConfigured ? '익명 로그인 준비 중입니다.' : '',
  )
  const [nicknameDraft, setNicknameDraft] = useState(nickname)
  const [nicknameMessage, setNicknameMessage] = useState('')
  const [nicknameSaveStatus, setNicknameSaveStatus] = useState<
    'idle' | 'checking' | 'saved' | 'error'
  >('idle')
  const [now, setNow] = useState(() => Date.now())
  const [todayKey, setTodayKey] = useState(() => getTodayKey())
  const [rankingSort, setRankingSort] = useState<RankingSort>('amount')
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [rankingStatus, setRankingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    isFirebaseConfigured ? 'loading' : 'idle',
  )
  const [rankingSaveStatus, setRankingSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [shareStatus, setShareStatus] = useState<
    'idle' | 'sharing' | 'shared' | 'copied' | 'error'
  >('idle')
  const [shareMessage, setShareMessage] = useState('')
  const [shareText, setShareText] = useState('')
  const [shareCardMessage, setShareCardMessage] = useState('')
  const [rankingMessage, setRankingMessage] = useState('')
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [activeSlackerCount, setActiveSlackerCount] = useState(0)
  const [activeSlackerMessage, setActiveSlackerMessage] = useState('')
  const [pendingRankings, setPendingRankings] = useState<
    PendingRankingSubmission[]
  >(() =>
    readStorage<PendingRankingSubmission[]>(PENDING_RANKINGS_KEY, []).filter(
      (submission) => submission.sessionDate === getTodayKey(),
    ),
  )

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }, [session])

  useEffect(() => {
    window.localStorage.setItem(NICKNAME_KEY, JSON.stringify(nickname))
  }, [nickname])

  useEffect(() => {
    window.localStorage.setItem(
      PENDING_RANKINGS_KEY,
      JSON.stringify(pendingRankings),
    )
  }, [pendingRankings])

  useEffect(() => {
    const checkDateRollover = () => {
      const nextTodayKey = getTodayKey()

      setTodayKey((currentTodayKey) => {
        if (currentTodayKey === nextTodayKey) {
          return currentTodayKey
        }

        setSession(createDefaultSession())
        setPendingRankings([])
        setRankings([])
        setRankingStatus(isFirebaseConfigured ? 'loading' : 'idle')
        setRankingSaveStatus('idle')
        setRankingMessage('')
        setShareStatus('idle')
        setShareMessage('')
        setShareText('')
        setShareCardMessage('')

        return nextTodayKey
      })
    }
    const rolloverTimerId = window.setInterval(checkDateRollover, 30_000)

    checkDateRollover()

    return () => window.clearInterval(rolloverTimerId)
  }, [])

  useEffect(() => {
    if (!auth) {
      return
    }

    const firebaseAuth = auth
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        setUid(user.uid)
        setAuthMessage('')
        return
      }

      setAuthMessage('익명 로그인 중입니다.')
      void signInAnonymously(firebaseAuth).catch(() => {
        setUid(null)
        setAuthMessage('익명 로그인에 실패했습니다. Firebase Auth 설정을 확인해 주세요.')
      })
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return
    }

    const unsubscribe = subscribeToRankings(
      rankingSort,
      (entries) => {
        setRankings(entries)
        setRankingStatus('ready')
        setRankingMessage('')
      },
      (message) => {
        setRankings([])
        setRankingStatus('error')
        setRankingMessage(message)
      },
    )

    return () => unsubscribe?.()
  }, [rankingSort, todayKey])

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return
    }

    const unsubscribe = subscribeToActiveSlackerCount(
      (count) => {
        setActiveSlackerCount(count)
        setActiveSlackerMessage('')
      },
      () => {
        setActiveSlackerCount(0)
        setActiveSlackerMessage('루팡 중 인원을 불러오지 못했습니다.')
      },
    )

    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!session.isSlacking) {
      return
    }

    const timerId = window.setInterval(() => setNow(Date.now()), 250)

    return () => window.clearInterval(timerId)
  }, [session.isSlacking])

  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !session.isSlacking) {
      return
    }

    void markActiveSlacker({ nickname, uid }).catch(() => {
      setActiveSlackerMessage('루팡 중 상태 저장에 실패했습니다.')
    })
    const heartbeatId = window.setInterval(() => {
      void markActiveSlacker({ nickname, uid }).catch(() => {
        setActiveSlackerMessage('루팡 중 상태 저장에 실패했습니다.')
      })
    }, 30_000)

    return () => {
      window.clearInterval(heartbeatId)
      void markInactiveSlacker(uid)
    }
  }, [nickname, session.isSlacking, uid])

  const elapsedSeconds = useMemo(() => {
    const liveSeconds =
      session.isSlacking && session.startedAt
        ? Math.floor((now - session.startedAt) / 1000)
        : 0

    return clampDailySeconds(session.accumulatedSeconds + Math.max(liveSeconds, 0))
  }, [now, session])

  const dailyUsedSeconds = Math.max(
    elapsedSeconds,
    session.submittedSeconds,
    session.pendingSubmittedSeconds,
  )
  const hasReachedDailyLimit = dailyUsedSeconds >= MAX_DAILY_SLACKING_SECONDS

  const secondsPerMonth = Math.max(
    settings.workDays * settings.workHours * 3600,
    1,
  )
  const secondlyRate = settings.salary / secondsPerMonth
  const minutelyRate = secondlyRate * 60
  const earnedAmount = (settings.salary / secondsPerMonth) * elapsedSeconds
  const hourlyRate =
    settings.salary / Math.max(settings.workDays * settings.workHours, 1)
  const dailyLimitAmount = (settings.salary / secondsPerMonth) * MAX_DAILY_SLACKING_SECONDS
  const repeatedMonthlyAmount = earnedAmount * settings.workDays

  const calculateEarnedAmount = useCallback(
    (seconds: number) => (settings.salary / secondsPerMonth) * seconds,
    [secondsPerMonth, settings.salary],
  )
  const rankingNotice = isFirebaseConfigured
    ? rankingMessage
    : 'Firebase 환경변수를 설정하면 실시간 랭킹이 활성화됩니다.'
  const saveBlockedMessage =
    isFirebaseConfigured && !uid
      ? authMessage || '익명 로그인 준비 중입니다.'
      : ''
  const visibleRankings = useMemo(() => {
    const rankingsByNickname = rankings.reduce<Record<string, RankingEntry>>(
      (entries, entry) => {
        mergeRankingEntry(
          entries,
          entry.nickname,
          entry.elapsedSeconds,
          calculateEarnedAmount(entry.elapsedSeconds),
        )

        return entries
      },
      {},
    )

    pendingRankings.forEach((submission) => {
      mergeRankingEntry(
        rankingsByNickname,
        submission.nickname,
        submission.elapsedSeconds,
        calculateEarnedAmount(submission.elapsedSeconds),
      )
    })

    const alreadyQueuedSeconds = Math.max(
      session.submittedSeconds,
      session.pendingSubmittedSeconds,
    )
    const liveRankingSeconds = Math.max(elapsedSeconds - alreadyQueuedSeconds, 0)

    if (session.isSlacking && liveRankingSeconds > 0) {
      mergeRankingEntry(
        rankingsByNickname,
        nickname,
        liveRankingSeconds,
        calculateEarnedAmount(liveRankingSeconds),
      )
    }

    return Object.values(rankingsByNickname)
      .sort((a, b) =>
        rankingSort === 'amount'
          ? b.earnedAmount - a.earnedAmount
          : b.elapsedSeconds - a.elapsedSeconds,
      )
      .slice(0, 5)
  }, [
    elapsedSeconds,
    nickname,
    pendingRankings,
    rankingSort,
    rankings,
    calculateEarnedAmount,
    session.isSlacking,
    session.pendingSubmittedSeconds,
    session.submittedSeconds,
  ])

  const updateSetting = (key: keyof Settings, value: string) => {
    const numericValue = Number(value)

    setSettings((current) => ({
      ...current,
      [key]: Number.isFinite(numericValue) ? Math.max(numericValue, 0) : 0,
    }))
  }

  const updateNicknameDraft = (value: string) => {
    setNicknameDraft(value)
    setNicknameSaveStatus('idle')
    setNicknameMessage(validateNickname(value))
  }

  const saveNickname = () => {
    const nextNickname = nicknameDraft.trim().replace(/\s+/g, ' ')
    const validationMessage = validateNickname(nextNickname)

    if (validationMessage) {
      setNicknameSaveStatus('error')
      setNicknameMessage(validationMessage)
      return
    }

    setNicknameSaveStatus('checking')
    setNicknameMessage('닉네임 중복을 확인하는 중입니다.')

    if (!uid) {
      setNicknameSaveStatus('error')
      setNicknameMessage('익명 로그인이 완료된 뒤 닉네임을 저장할 수 있습니다.')
      return
    }

    void isNicknameAvailable(nextNickname, nickname, uid)
      .then((available) => {
        if (!available) {
          setNicknameSaveStatus('error')
          setNicknameMessage('이미 사용 중인 닉네임입니다.')
          return
        }

        return renameRankingNickname(uid, nickname, nextNickname).then(() => {
          setNickname(nextNickname)
          setNicknameDraft(nextNickname)
          setPendingRankings((current) =>
            current.map((submission) => ({
              ...submission,
              nickname:
                submission.nickname === nickname ? nextNickname : submission.nickname,
            })),
          )
          setNicknameSaveStatus('saved')
          setNicknameMessage('닉네임이 저장되었습니다.')
        })
      })
      .catch(() => {
        setNicknameSaveStatus('error')
        setNicknameMessage('닉네임 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      })
  }

  const startSlacking = () => {
    const currentSession = getCurrentSession(session)
    const currentDailyUsedSeconds = Math.max(
      currentSession.accumulatedSeconds,
      currentSession.submittedSeconds,
      currentSession.pendingSubmittedSeconds,
    )

    if (currentDailyUsedSeconds >= MAX_DAILY_SLACKING_SECONDS) {
      setSession({
        ...currentSession,
        isSlacking: false,
        startedAt: null,
        isOffWork: true,
        finishedAmount: calculateEarnedAmount(MAX_DAILY_SLACKING_SECONDS),
      })
      return
    }

    setNow(Date.now())
    setRankingSaveStatus('idle')
    setSession({
      ...currentSession,
      isSlacking: true,
      startedAt: Date.now(),
      isOffWork: false,
      finishedAmount: null,
    })
  }

  const removePendingRanking = (
    current: PendingRankingSubmission[],
    submissionId: string,
  ) => current.filter((submission) => submission.id !== submissionId)

  const flushPendingRankings = useCallback(async (
    submissions: PendingRankingSubmission[],
  ) => {
    if (!isFirebaseConfigured || !uid || submissions.length === 0) {
      return
    }

    setRankingSaveStatus('saving')

    try {
      for (const submission of submissions) {
        await saveRanking({
          ...submission,
          uid,
        })
        setPendingRankings((current) =>
          removePendingRanking(current, submission.id),
        )
        setSession((current) => ({
          ...current,
          submittedSeconds: Math.max(
            current.submittedSeconds,
            submission.finalElapsedSeconds,
          ),
          pendingSubmittedSeconds:
            current.pendingSubmittedSeconds > submission.finalElapsedSeconds
              ? current.pendingSubmittedSeconds
              : Math.max(current.submittedSeconds, submission.finalElapsedSeconds),
        }))
      }

      setRankingSaveStatus('saved')
      setRankingMessage('')
    } catch {
      setRankingSaveStatus('error')
      setRankingStatus('error')
      setRankingMessage(
        '랭킹 저장에 실패했습니다. 기록은 이 브라우저에 보관되어 자동으로 다시 시도됩니다.',
      )
    }
  }, [uid])

  useEffect(() => {
    if (!isFirebaseConfigured || pendingRankings.length === 0) {
      return
    }

    const retryTimerId = window.setTimeout(() => {
      void flushPendingRankings(pendingRankings)
    }, 500)

    return () => window.clearTimeout(retryTimerId)
  }, [flushPendingRankings, pendingRankings, uid])

  const submitRankingDelta = (
    rankingSeconds: number,
    finalElapsedSeconds: number,
  ) => {
    if (!isFirebaseConfigured || rankingSeconds <= 0) {
      return
    }

    const rankingEarnedAmount = calculateEarnedAmount(rankingSeconds)
    const submission: PendingRankingSubmission = {
      id: createSubmissionId(),
      uid: uid ?? undefined,
      nickname,
      elapsedSeconds: rankingSeconds,
      earnedAmount: rankingEarnedAmount,
      salary: settings.salary,
      workDays: settings.workDays,
      workHours: settings.workHours,
      finalElapsedSeconds,
      sessionDate: session.sessionDate,
      createdAt: Date.now(),
    }

    setRankingSaveStatus('saving')
    setSession((current) => ({
      ...current,
      pendingSubmittedSeconds: Math.max(
        current.pendingSubmittedSeconds,
        finalElapsedSeconds,
      ),
    }))
    setPendingRankings((current) => [...current, submission])

    void flushPendingRankings([...pendingRankings, submission])
  }

  const stopSlacking = () => {
    const additionalSeconds =
      session.isSlacking && session.startedAt
        ? Math.floor((Date.now() - session.startedAt) / 1000)
        : 0
    const finalElapsedSeconds = clampDailySeconds(
      session.accumulatedSeconds + Math.max(additionalSeconds, 0),
    )
    const alreadyQueuedSeconds = Math.max(
      session.submittedSeconds,
      session.pendingSubmittedSeconds,
    )
    const rankingSeconds = Math.max(
      finalElapsedSeconds - alreadyQueuedSeconds,
      0,
    )

    setSession({
      sessionDate: getTodayKey(),
      accumulatedSeconds: finalElapsedSeconds,
      submittedSeconds: session.submittedSeconds,
      pendingSubmittedSeconds: session.pendingSubmittedSeconds,
      isSlacking: false,
      startedAt: null,
      isOffWork: false,
      finishedAmount: null,
    })

    submitRankingDelta(rankingSeconds, finalElapsedSeconds)
  }

  const resetSession = () => {
    setSession((current) => ({
      ...createDefaultSession(),
      submittedSeconds: current.submittedSeconds,
      pendingSubmittedSeconds: current.pendingSubmittedSeconds,
    }))
    setNow(Date.now())
    setShareStatus('idle')
    setShareMessage('')
    setShareText('')
    setShareCardMessage('')
  }

  const finishWork = () => {
    const additionalSeconds =
      session.isSlacking && session.startedAt
        ? Math.floor((Date.now() - session.startedAt) / 1000)
        : 0
    const finalElapsedSeconds = clampDailySeconds(
      session.accumulatedSeconds + Math.max(additionalSeconds, 0),
    )
    const finalEarnedAmount = calculateEarnedAmount(finalElapsedSeconds)
    const alreadyQueuedSeconds = Math.max(
      session.submittedSeconds,
      session.pendingSubmittedSeconds,
    )
    const rankingSeconds = Math.max(
      finalElapsedSeconds - alreadyQueuedSeconds,
      0,
    )

    setSession({
      sessionDate: getTodayKey(),
      accumulatedSeconds: finalElapsedSeconds,
      submittedSeconds: session.submittedSeconds,
      pendingSubmittedSeconds: session.pendingSubmittedSeconds,
      isSlacking: false,
      startedAt: null,
      isOffWork: true,
      finishedAmount: finalEarnedAmount,
    })

    submitRankingDelta(rankingSeconds, finalElapsedSeconds)
  }

  const getFallbackTopPercent = () => {
    if (visibleRankings.length === 0 || elapsedSeconds <= 0) {
      return 100
    }

    const higherCount = visibleRankings.filter(
      (entry) =>
        entry.nickname !== nickname && entry.elapsedSeconds > elapsedSeconds,
    ).length
    const estimatedRank = higherCount + 1
    const totalCount = Math.max(visibleRankings.length, estimatedRank, 1)

    return Math.max(
      1,
      Math.min(100, Math.ceil((estimatedRank / totalCount) * 100)),
    )
  }

  const createShareText = (topPercent: number) => [
    `나는 오늘 ${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`,
    `현재 루팡리그 상위 ${topPercent}%`,
    `회사로부터 ${formatWon(earnedAmount)}을 훔쳤습니다.`,
    '당신의 순위는?',
    `너도 해보기 👉 ${SHARE_URL}`,
  ].join('\n')

  const shareSlackingRecord = async () => {
    if (elapsedSeconds <= 0) {
      setShareStatus('error')
      setShareMessage('공유할 루팡 기록이 아직 없습니다.')
      return
    }

    setShareStatus('sharing')
    setShareMessage('')

    try {
      let topPercent = getFallbackTopPercent()

      if (isFirebaseConfigured) {
        try {
          topPercent =
            (await getRankingTopPercent(elapsedSeconds)) ?? topPercent
        } catch {
          topPercent = getFallbackTopPercent()
        }
      }

      const nextShareText = createShareText(topPercent)
      setShareText(nextShareText)

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: '월루미터 - 온라인 월급 루팡 시뮬레이터',
            text: nextShareText,
          })
          setShareStatus('shared')
          setShareMessage('공유창을 열었습니다.')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setShareStatus('idle')
            return
          }
        }
      }

      await copyTextToClipboard(nextShareText)
      setShareStatus('copied')
      setShareMessage('공유 문구를 클립보드에 복사했습니다.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareStatus('idle')
        return
      }

      setShareStatus('error')
      setShareMessage('아래 공유 문구를 직접 복사해 주세요.')
    }
  }

  const downloadShareCard = () => {
    if (elapsedSeconds <= 0) {
      setShareCardMessage('공유 카드로 만들 루팡 기록이 아직 없습니다.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const context = canvas.getContext('2d')

    if (!context) {
      setShareCardMessage('공유 카드를 만들지 못했습니다.')
      return
    }

    context.fillStyle = '#f7f2ea'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#24221f'
    context.fillRect(64, 64, 1072, 502)
    context.fillStyle = '#fff8ef'
    context.fillRect(92, 92, 1016, 446)
    context.fillStyle = '#8b5e3c'
    context.font = '700 36px system-ui, sans-serif'
    context.fillText('월루미터 루팡 기록', 142, 170)
    context.fillStyle = '#24221f'
    context.font = '900 72px system-ui, sans-serif'
    context.fillText(formatWon(earnedAmount), 142, 280)
    context.font = '700 40px system-ui, sans-serif'
    context.fillText(`${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`, 142, 356)
    context.fillStyle = '#5e564e'
    context.font = '600 30px system-ui, sans-serif'
    context.fillText(`닉네임: ${nickname}`, 142, 424)
    context.fillText('너도 해보기: slacker-nu.vercel.app', 142, 482)

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `wolumeter-${getTodayKey()}.png`
    link.click()
    setShareCardMessage('공유 카드 이미지를 저장했습니다.')
  }

  return (
    <main className="min-h-dvh bg-[#f7f2ea] text-[#24221f]">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#ded5c8] pb-4">
          <div>
            <p className="text-sm font-semibold text-[#8b5e3c]">Slacker</p>
            <div className="relative mt-1 flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-normal sm:text-3xl">
                월급 루팡 계산기
              </h1>
              <button
                aria-expanded={isInfoOpen}
                aria-label="사용 방법 보기"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d7c8b7] bg-white text-sm font-black text-[#8b5e3c] shadow-sm transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2"
                type="button"
                onClick={() => setIsInfoOpen((current) => !current)}
              >
                i
              </button>
              {isInfoOpen ? (
                <div className="absolute left-0 top-full z-10 mt-3 w-[min(320px,calc(100vw-40px))] rounded-lg border border-[#ded5c8] bg-white p-4 text-sm font-semibold leading-6 text-[#5e564e] shadow-lg">
                  월급, 근무일, 하루 근무시간을 입력한 뒤 루팡 시작을 누르면
                  시간이 카운트됩니다. 다시 일하기나 퇴근하기를 누르면 누적
                  시간이 랭킹에 반영됩니다.
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-[#d7c8b7] bg-white px-3 py-2 text-right shadow-sm">
            <p className="text-xs font-medium text-[#7d746a]">시급 환산</p>
            <p className="text-sm font-bold">{currencyFormatter.format(hourlyRate)}</p>
          </div>
        </header>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ded5c8] bg-white px-4 py-3 text-sm font-bold shadow-sm">
          <span className="text-[#5e564e]">지금 루팡 중</span>
          <span className="text-[#8b5e3c]">
            {numberFormatter.format(activeSlackerCount)}명
          </span>
          {activeSlackerMessage ? (
            <span className="w-full text-xs font-semibold text-[#b95738]">
              {activeSlackerMessage}
            </span>
          ) : null}
        </div>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <aside className="h-fit rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">근무 조건</h2>
            <div className="mt-5 space-y-4">
              <div>
                <span className="text-sm font-semibold text-[#5e564e]">
                  닉네임
                </span>
                <div className="mt-2 flex overflow-hidden rounded-md border border-[#d8cdbc] bg-[#fbfaf7] focus-within:border-[#8b5e3c]">
                  <input
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base font-semibold outline-none"
                    disabled={session.isSlacking}
                    maxLength={MAX_NICKNAME_LENGTH}
                    type="text"
                    value={nicknameDraft}
                    onChange={(event) => updateNicknameDraft(event.target.value)}
                  />
                  <button
                    className="border-l border-[#d8cdbc] px-3 text-sm font-bold text-[#8b5e3c] transition hover:bg-[#f2ebe1] disabled:cursor-not-allowed disabled:text-[#aaa095]"
                    disabled={
                      session.isSlacking ||
                      nicknameSaveStatus === 'checking' ||
                      nicknameDraft.trim() === nickname
                    }
                    type="button"
                    onClick={saveNickname}
                  >
                    저장
                  </button>
                </div>
                <p
                  className={`mt-2 text-xs font-semibold ${
                    nicknameSaveStatus === 'error'
                      ? 'text-[#b95738]'
                      : nicknameSaveStatus === 'saved'
                        ? 'text-[#3f6b4d]'
                        : 'text-[#7d746a]'
                  }`}
                >
                  {session.isSlacking
                    ? '루팡 중에는 닉네임을 변경할 수 없습니다.'
                    : nicknameMessage || `최대 ${MAX_NICKNAME_LENGTH}자`}
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-[#5e564e]">월급</span>
                <div className="mt-2 flex items-center rounded-md border border-[#d8cdbc] bg-[#fbfaf7] px-3 focus-within:border-[#8b5e3c]">
                  <input
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold outline-none"
                    inputMode="numeric"
                    min="0"
                    type="number"
                    value={settings.salary}
                    onChange={(event) => updateSetting('salary', event.target.value)}
                  />
                  <span className="text-sm text-[#7d746a]">원</span>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-[#5e564e]">
                  월 근무일
                </span>
                <div className="mt-2 flex items-center rounded-md border border-[#d8cdbc] bg-[#fbfaf7] px-3 focus-within:border-[#8b5e3c]">
                  <input
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold outline-none"
                    inputMode="numeric"
                    min="0"
                    type="number"
                    value={settings.workDays}
                    onChange={(event) => updateSetting('workDays', event.target.value)}
                  />
                  <span className="text-sm text-[#7d746a]">일</span>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-[#5e564e]">
                  하루 근무시간
                </span>
                <div className="mt-2 flex items-center rounded-md border border-[#d8cdbc] bg-[#fbfaf7] px-3 focus-within:border-[#8b5e3c]">
                  <input
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold outline-none"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    type="number"
                    value={settings.workHours}
                    onChange={(event) => updateSetting('workHours', event.target.value)}
                  />
                  <span className="text-sm text-[#7d746a]">시간</span>
                </div>
              </label>
            </div>

            <div className="mt-5 rounded-md bg-[#f2ebe1] p-4 text-sm text-[#5e564e]">
              월 {numberFormatter.format(settings.workDays)}일, 하루{' '}
              {numberFormatter.format(settings.workHours)}시간 기준으로 초당 수익을
              계산합니다.
            </div>
          </aside>

          <section className="flex flex-col rounded-lg border border-[#ded5c8] bg-white shadow-sm">
            <div className="border-b border-[#ded5c8] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#8b5e3c]">
                    {session.isOffWork
                      ? '퇴근 완료'
                      : session.isSlacking
                        ? '루팡 중'
                        : '업무 복귀'}
                  </p>
                  <h2 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">
                    {currencyFormatter.format(earnedAmount)}
                  </h2>
                  {session.isOffWork && session.finishedAmount !== null ? (
                    <p className="mt-3 rounded-md bg-[#f2ebe1] px-3 py-2 text-sm font-bold text-[#6e6259]">
                      오늘 하루 월급 루팡으로{' '}
                      {currencyFormatter.format(session.finishedAmount)} 벌었습니다.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md bg-[#24221f] px-4 py-3 text-white">
                  <p className="text-xs font-medium text-[#d8cdbc]">누적 시간</p>
                  <p className="font-mono text-2xl font-bold">
                    {formatDuration(elapsedSeconds)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid flex-1 gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_220px]">
              <div
                className={`desk-scene ${session.isOffWork ? 'off-work' : ''}`}
                aria-label={
                  session.isOffWork
                    ? '사용자가 떠나고 노트북과 책상만 남아있는 그림'
                    : '책상에 앉아 졸고 있는 사람 그림'
                }
              >
                <div
                  className={session.isSlacking ? 'sleep-bubble active' : 'sleep-bubble'}
                >
                  Zzz
                </div>
                <div className="wall-clock">
                  <span></span>
                </div>
                <div className="person">
                  <div className="head">
                    <span className="hair"></span>
                    <span className="eye left"></span>
                    <span className="eye right"></span>
                    <span className="mouth"></span>
                  </div>
                  <div className="body"></div>
                  <div className="arm"></div>
                </div>
                <div className="monitor">
                  <span></span>
                </div>
                <div className="mug"></div>
                <div className="desk"></div>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <button
                    className="w-full rounded-md bg-[#8b5e3c] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#744c2e] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#c2b2a2]"
                    disabled={session.isSlacking || hasReachedDailyLimit}
                    type="button"
                    onClick={startSlacking}
                  >
                    루팡 시작
                  </button>
                  {hasReachedDailyLimit ? (
                    <p className="rounded-md bg-[#f2ebe1] px-3 py-2 text-center text-xs font-bold text-[#8b5e3c]">
                      오늘 루팡 가능 시간 14시간을 모두 사용했습니다.
                    </p>
                  ) : null}
                  <button
                    className="w-full rounded-md border border-[#24221f] bg-white px-4 py-4 text-base font-bold text-[#24221f] transition hover:bg-[#f7f2ea] focus:outline-none focus:ring-2 focus:ring-[#24221f] focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#d8cdbc] disabled:text-[#aaa095]"
                    disabled={!session.isSlacking || session.isOffWork}
                    type="button"
                    onClick={stopSlacking}
                  >
                    다시 일하기
                  </button>
                  <button
                    className="w-full rounded-md bg-[#24221f] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#3a3731] focus:outline-none focus:ring-2 focus:ring-[#24221f] focus:ring-offset-2"
                    type="button"
                    onClick={finishWork}
                  >
                    퇴근하기
                  </button>
                </div>

                <div>
                  <button
                    className="w-full rounded-md border border-[#8b5e3c] bg-[#fbfaf7] px-4 py-3 text-sm font-bold text-[#8b5e3c] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#d8cdbc] disabled:text-[#aaa095]"
                    disabled={elapsedSeconds <= 0 || shareStatus === 'sharing'}
                    type="button"
                    onClick={() => void shareSlackingRecord()}
                  >
                    {shareStatus === 'sharing'
                      ? '공유 문구 생성 중'
                      : '내 루팡 기록 공유하기'}
                  </button>
                  {shareMessage ? (
                    <p
                      className={`mt-2 text-center text-xs font-semibold ${
                        shareStatus === 'error'
                          ? 'text-[#b95738]'
                          : 'text-[#3f6b4d]'
                      }`}
                    >
                      {shareMessage}
                    </p>
                  ) : null}
                  {shareText ? (
                    <textarea
                      className="mt-3 h-32 w-full resize-none rounded-md border border-[#d8cdbc] bg-[#fbfaf7] p-3 text-xs font-semibold leading-5 text-[#5e564e] outline-none"
                      readOnly
                      value={shareText}
                    />
                  ) : null}
                  <button
                    className="mt-3 w-full rounded-md border border-[#d8cdbc] px-4 py-3 text-sm font-semibold text-[#6e6259] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-[#aaa095]"
                    disabled={elapsedSeconds <= 0}
                    type="button"
                    onClick={downloadShareCard}
                  >
                    결과 카드 이미지 저장
                  </button>
                  {shareCardMessage ? (
                    <p className="mt-2 text-center text-xs font-semibold text-[#3f6b4d]">
                      {shareCardMessage}
                    </p>
                  ) : null}
                </div>

                <button
                  className="w-full rounded-md border border-[#d8cdbc] px-4 py-3 text-sm font-semibold text-[#6e6259] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2"
                  type="button"
                  onClick={resetSession}
                >
                  기록 초기화
                </button>
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#8b5e3c]">Top 5</p>
                <h2 className="text-lg font-bold">실시간 랭킹</h2>
              </div>
              <div className="grid grid-cols-2 rounded-md border border-[#d8cdbc] bg-[#fbfaf7] p-1">
                <button
                  className={`rounded px-3 py-2 text-sm font-bold transition ${
                    rankingSort === 'amount'
                      ? 'bg-[#24221f] text-white'
                      : 'text-[#6e6259] hover:bg-[#f2ebe1]'
                  }`}
                  type="button"
                  onClick={() => setRankingSort('amount')}
                >
                  금액
                </button>
                <button
                  className={`rounded px-3 py-2 text-sm font-bold transition ${
                    rankingSort === 'time'
                      ? 'bg-[#24221f] text-white'
                      : 'text-[#6e6259] hover:bg-[#f2ebe1]'
                  }`}
                  type="button"
                  onClick={() => setRankingSort('time')}
                >
                  시간
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {rankingStatus === 'loading' ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  랭킹을 불러오는 중입니다.
                </div>
              ) : null}

              {rankingNotice ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  {rankingNotice}
                </div>
              ) : null}

              {saveBlockedMessage ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  {saveBlockedMessage}
                </div>
              ) : null}

              {rankingSaveStatus === 'saving' ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  랭킹에 반영하는 중입니다.
                </div>
              ) : null}

              {rankingSaveStatus === 'saved' ? (
                <div className="rounded-md bg-[#e7f0ea] p-4 text-sm font-semibold text-[#3f6b4d]">
                  랭킹에 반영되었습니다.
                </div>
              ) : null}

              {pendingRankings.length > 0 ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  <p>
                    저장 대기 중인 기록 {pendingRankings.length}건을 랭킹에 먼저
                    반영했습니다.
                  </p>
                  <button
                    className="mt-3 rounded-md border border-[#8b5e3c] px-3 py-2 text-xs font-bold text-[#8b5e3c] transition hover:bg-white disabled:cursor-not-allowed disabled:text-[#aaa095]"
                    disabled={rankingSaveStatus === 'saving'}
                    type="button"
                    onClick={() => void flushPendingRankings(pendingRankings)}
                  >
                    지금 다시 저장
                  </button>
                </div>
              ) : null}

              {rankingStatus === 'ready' && visibleRankings.length === 0 ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  아직 등록된 랭킹이 없습니다.
                </div>
              ) : null}

              {visibleRankings.map((entry, index) => (
                <div
                  className="flex items-center gap-3 rounded-md border border-[#eadfce] bg-[#fbfaf7] p-3"
                  key={entry.id}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#8b5e3c] text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{entry.nickname}</p>
                    <p className="mt-1 text-xs font-semibold text-[#7d746a]">
                      {rankingSort === 'amount'
                        ? currencyFormatter.format(entry.earnedAmount)
                        : formatDuration(entry.elapsedSeconds)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <AdBanner
            className="lg:col-span-3"
            format="horizontal"
            slot={import.meta.env.VITE_ADSENSE_RANKING_SLOT}
          />

          <ContentSections
            dailyLimitAmount={dailyLimitAmount}
            earnedAmount={earnedAmount}
            minutelyRate={minutelyRate}
            repeatedMonthlyAmount={repeatedMonthlyAmount}
            secondlyRate={secondlyRate}
          />
        </div>
        <footer className="border-t border-[#ded5c8] py-5 text-center text-xs font-semibold leading-5 text-[#7d746a]">
          <p>재미로 보는 월급 루팡 계산기입니다.</p>
          <p>
            피드백은 언제든 환영합니다:{' '}
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="mailto:dev.garam918@gmail.com"
            >
              dev.garam918@gmail.com
            </a>
          </p>
          <p className="mt-2">
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/guide.html"
            >
              계산 공식
            </a>
            <span className="mx-2 text-[#c2b2a2]">|</span>
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/examples.html"
            >
              예시
            </a>
            <span className="mx-2 text-[#c2b2a2]">|</span>
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/ranking.html"
            >
              랭킹 기준
            </a>
            <span className="mx-2 text-[#c2b2a2]">|</span>
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/faq.html"
            >
              FAQ
            </a>
            <span className="mx-2 text-[#c2b2a2]">|</span>
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/about.html"
            >
              About
            </a>
          </p>
          <p className="mt-2">
            <a
              className="text-[#8b5e3c] underline-offset-2 hover:underline"
              href="/privacy.html"
            >
              개인정보처리방침
            </a>
          </p>
        </footer>
      </section>
    </main>
  )
}

export default App
