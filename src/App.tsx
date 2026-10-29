import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import ContentSections from './ContentSections'
import PrivacyTools from './PrivacyTools'
import HistoryDashboard from './HistoryDashboard'
import PriceCalculator from './PriceCalculator'
import { archiveTracker } from './history'
import './features.css'
import { markActiveSlacker, markInactiveSlacker, subscribeToActiveSlackerCount } from './activity'
import { auth, isFirebaseConfigured } from './firebase'
import { getOwnRanking, getRankingTopPercent, isNicknameAvailable, renameRankingNickname, subscribeToRankings, type RankingEntry, type RankingSort } from './rankings'
import { calculateAmount, elapsed, getTodayKey, MAX_DAILY_SECONDS, validateSettings, type Settings } from './session'
import { useDailyTracker } from './useDailyTracker'

const SETTINGS_KEY = 'slacker.settings'
const NICKNAME_KEY = 'slacker.nickname'
const MAX_NICKNAME_LENGTH = 12
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

const currencyFormatter = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
const numberFormatter = new Intl.NumberFormat('ko-KR')
function formatWon(amount: number) { return `${numberFormatter.format(Math.round(amount))}원` }

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

function App() {
  const [settings, setSettings] = useState<Settings>(() => readStorage(SETTINGS_KEY, defaultSettings))
  const [nickname, setNickname] = useState(() => {
    const saved = readStorage<string | null>(NICKNAME_KEY, null)
    return typeof saved === 'string' && saved !== '[object Object]' ? saved : createAnonymousNickname()
  })
  const [uid, setUid] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState(isFirebaseConfigured ? '익명 로그인 준비 중입니다.' : '')
  const [nicknameDraft, setNicknameDraft] = useState(nickname)
  const [nicknameMessage, setNicknameMessage] = useState('')
  const [nicknameSaveStatus, setNicknameSaveStatus] = useState<'idle' | 'checking' | 'saved' | 'error'>('idle')
  const [rankingSort, setRankingSort] = useState<RankingSort>('time')
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [rankingStatus, setRankingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(isFirebaseConfigured ? 'loading' : 'idle')
  const [rankingMessage, setRankingMessage] = useState('')
  const [recovery, setRecovery] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'copied' | 'error'>('idle')
  const [shareMessage, setShareMessage] = useState('')
  const [shareText, setShareText] = useState('')
  const [shareCardMessage, setShareCardMessage] = useState('')
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const [activeSlackerCount, setActiveSlackerCount] = useState(0)
  const [activeSlackerMessage, setActiveSlackerMessage] = useState('')
  const { tracker, now, act, restore, rename, saveStatus: rankingSaveStatus, storageMessage, retry } = useDailyTracker(nickname, uid, isFirebaseConfigured, settings)
  const session = tracker.session
  const pendingRankings = tracker.pending
  const todayKey = session.sessionDate
  const elapsedSeconds = elapsed(session, now)
  const historyRecords = archiveTracker(tracker, tracker, now, settings).history ?? []
  const displayedSeconds = Math.max(0, elapsedSeconds - session.displayOffsetSeconds)
  const hasReachedDailyLimit = elapsedSeconds >= MAX_DAILY_SECONDS
  const settingsMessage = validateSettings(settings)
  const calculateEarnedAmount = useCallback((seconds: number) => calculateAmount(seconds, settings), [settings])
  const earnedAmount = calculateEarnedAmount(elapsedSeconds)
  const displayedAmount = calculateEarnedAmount(displayedSeconds)
  const secondsPerMonth = settingsMessage ? 0 : settings.workDays * settings.workHours * 3600
  const secondlyRate = secondsPerMonth ? settings.salary / secondsPerMonth : 0
  const minutelyRate = secondlyRate * 60
  const hourlyRate = minutelyRate * 60
  const dailyLimitAmount = calculateEarnedAmount(MAX_DAILY_SECONDS)
  const repeatedMonthlyAmount = settingsMessage ? 0 : calculateEarnedAmount(elapsedSeconds * settings.workDays)
  const rankingNotice = rankingMessage
  const saveBlockedMessage = storageMessage || (isFirebaseConfigured && !uid ? authMessage : '') ||
    (recovery === 'error' ? '오늘 서버 기록을 확인하지 못했습니다. 로컬 기록은 보관되며 연결 후 다시 저장합니다.' : '')
  const isPreparing = isFirebaseConfigured && (!uid || recovery === 'loading')

  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* The calculator also works without persistent settings. */ } }, [settings])
  useEffect(() => { try { localStorage.setItem(NICKNAME_KEY, JSON.stringify(nickname)) } catch { /* Keep the nickname in memory when storage is unavailable. */ } }, [nickname])
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id === 'my-records' || id === 'price-time') {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    }
  }, [])
  useEffect(() => {
    if (!auth) return
    const firebaseAuth = auth
    return onAuthStateChanged(firebaseAuth, user => {
      if (user) { setUid(user.uid); setAuthMessage(''); return }
      void signInAnonymously(firebaseAuth).catch(() => setAuthMessage('익명 로그인에 실패했습니다. 연결을 확인해 주세요.'))
    })
  }, [])
  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return
    let active = true
    const recover = async () => {
      setRecovery('loading')
      try {
        const total = await getOwnRanking(uid, todayKey)
        if (active) { restore(todayKey, total); setRecovery('ready') }
      } catch { if (active) setRecovery('error') }
    }
    void recover()
    window.addEventListener('online', recover)
    return () => { active = false; window.removeEventListener('online', recover) }
  }, [uid, todayKey, restore])
  useEffect(() => {
    if (!isFirebaseConfigured) return
    return subscribeToRankings(todayKey,
      entries => { setRankings(entries); setRankingStatus('ready'); setRankingMessage('') },
      message => { setRankings([]); setRankingStatus('error'); setRankingMessage(message) },
    ) ?? undefined
  }, [todayKey])
  useEffect(() => {
    if (!isFirebaseConfigured) return
    return subscribeToActiveSlackerCount(
      count => { setActiveSlackerCount(count); setActiveSlackerMessage('') },
      () => setActiveSlackerMessage('현재 인원을 불러오지 못했습니다.'),
    ) ?? undefined
  }, [])
  useEffect(() => {
    if (!isFirebaseConfigured || !uid || !session.isSlacking) return
    const heartbeat = () => void markActiveSlacker({ nickname, uid }).catch(() => setActiveSlackerMessage('활동 상태를 저장하지 못했습니다.'))
    heartbeat()
    const timer = window.setInterval(heartbeat, 30_000)
    return () => {
      window.clearInterval(timer)
      void markInactiveSlacker(uid).catch(() => {})
    }
  }, [nickname, uid, session.isSlacking])
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const change = () => setSettingsOpen(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsInfoOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const visibleRankings = (() => {
    const entries = new Map(rankings.map(entry => [entry.id, { ...entry, earnedAmount: calculateEarnedAmount(entry.elapsedSeconds) }]))
    if (uid && elapsedSeconds > 0) {
      const previous = entries.get(uid)
      const total = Math.max(elapsedSeconds, previous?.elapsedSeconds ?? 0)
      entries.set(uid, { id: uid, nickname, elapsedSeconds: total, earnedAmount: calculateEarnedAmount(total) })
    }
    return [...entries.values()].sort((a, b) => b.elapsedSeconds - a.elapsedSeconds || a.id.localeCompare(b.id)).slice(0, 5)
  })()

  const updateSetting = (key: keyof Settings, value: string) => {
    setSettings(current => ({ ...current, [key]: value === '' ? 0 : Number(value) }))
  }
  const updateNicknameDraft = (value: string) => {
    setNicknameDraft(value); setNicknameSaveStatus('idle'); setNicknameMessage(validateNickname(value))
  }
  const saveNickname = async () => {
    const next = nicknameDraft.trim().replace(/\s+/g, ' ')
    const message = validateNickname(next)
    if (message || !uid) {
      setNicknameSaveStatus('error'); setNicknameMessage(message || '익명 로그인 후 저장할 수 있습니다.'); return
    }
    setNicknameSaveStatus('checking')
    try {
      if (!await isNicknameAvailable(next, nickname, uid)) {
        setNicknameSaveStatus('error'); setNicknameMessage('이미 사용 중인 닉네임입니다.'); return
      }
      await renameRankingNickname(uid, nickname, next)
      rename(next); setNickname(next); setNicknameDraft(next)
      setNicknameSaveStatus('saved'); setNicknameMessage('닉네임이 저장되었습니다.')
    } catch { setNicknameSaveStatus('error'); setNicknameMessage('닉네임 저장에 실패했습니다. 다시 시도해 주세요.') }
  }
  const startSlacking = () => { if (!settingsMessage && !isPreparing) act('start') }
  const stopSlacking = () => act('pause')
  const finishWork = () => act('finish')
  const resetSession = () => {
    act('reset'); setShareStatus('idle'); setShareText(''); setShareMessage(''); setShareCardMessage('')
  }

  const shareSlackingRecord = async () => {
    if (elapsedSeconds <= 0) return
    setShareStatus('sharing'); setShareMessage('')
    let percent: number | null = null
    if (isFirebaseConfigured && uid) {
      try { percent = await getRankingTopPercent(elapsedSeconds, uid, todayKey) } catch { /* Share the record without an unverified percentile. */ }
    }
    const text = [
      `나는 오늘 ${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`,
      ...(percent !== null ? [`현재 루팡리그 상위 ${percent}% (시간 기준)`] : []),
      `회사로부터 ${formatWon(earnedAmount)}을 훔쳤습니다.`,
      '당신의 순위는?', `너도 해보기 👉 ${SHARE_URL}`,
    ].join('\n')
    setShareText(text)
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: '월루미터', text })
          setShareStatus('shared'); setShareMessage('기록을 공유했습니다.'); return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') { setShareStatus('idle'); return }
        }
      }
      await copyTextToClipboard(text)
      setShareStatus('copied'); setShareMessage('공유 문구를 복사했습니다.')
    } catch { setShareStatus('error'); setShareMessage('아래 문구를 직접 복사해 주세요.') }
  }

  const downloadShareCard = () => {
    if (elapsedSeconds <= 0) return
    const canvas = document.createElement('canvas')
    canvas.width = 1200; canvas.height = 630
    const context = canvas.getContext('2d')
    if (!context) { setShareCardMessage('이미지를 만들지 못했습니다.'); return }
    context.fillStyle = '#f7f2ea'; context.fillRect(0, 0, 1200, 630)
    context.fillStyle = '#24221f'; context.fillRect(64, 64, 1072, 502)
    context.fillStyle = '#fff8ef'; context.fillRect(92, 92, 1016, 446)
    const line = (text: string, y: number, size: number, color: string) => {
      context.fillStyle = color
      while (size > 20) {
        context.font = `700 ${size}px system-ui, sans-serif`
        if (context.measureText(text).width <= 916) break
        size -= 2
      }
      context.fillText(text, 142, y)
    }
    line('월루미터 루팡 기록', 170, 36, '#8b5e3c')
    line(formatWon(earnedAmount), 280, 72, '#24221f')
    line(`${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`, 356, 40, '#24221f')
    line(`닉네임: ${nickname}`, 424, 30, '#5e564e')
    line('너도 해보기: slacker-nu.vercel.app', 482, 30, '#5e564e')
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png'); link.download = `wolumeter-${getTodayKey()}.png`; link.click()
    setShareCardMessage('공유 카드 이미지를 저장했습니다.')
  }

  return (
    <main className="min-h-dvh bg-[#f7f2ea] text-[#24221f]">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ded5c8] pb-4">
          <div>
            <p className="text-sm font-semibold text-[#8b5e3c]">월루미터 · Slacker</p>
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

        <nav aria-label="주요 메뉴" className="site-nav">
          <a href="/" aria-current="page">계산기</a>
          <a href="#my-records">내 기록</a>
          <a href="#price-time">가격 → 시간</a>
          <a href="/guide.html">계산 공식</a>
          <a href="/examples.html">금액 비교</a>
          <a href="/ranking.html">랭킹 기준</a>
          <a href="/faq.html">FAQ</a>
          <a href="/about.html">소개</a>
        </nav>

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

        <div className="app-grid grid grid-cols-[minmax(0,1fr)] gap-6 py-6 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
          <aside className="settings-panel order-2 min-w-0 h-fit rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm lg:order-1">
            <details open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-lg font-bold">근무 조건</summary>
            <div className="mt-5 space-y-4">
              <div>
                <span className="text-sm font-semibold text-[#5e564e]">
                  닉네임
                </span>
                <div className="mt-2 flex overflow-hidden rounded-md border border-[#d8cdbc] bg-[#fbfaf7] focus-within:border-[#8b5e3c]">
                  <input
                    aria-label="닉네임"
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
                    max="1000000000"
                    disabled={session.isSlacking}
                    aria-invalid={Boolean(settingsMessage)}
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
                    min="1"
                    max="31"
                    step="1"
                    disabled={session.isSlacking}
                    aria-invalid={Boolean(settingsMessage)}
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
                    min="0.01"
                    max="24"
                    disabled={session.isSlacking}
                    aria-invalid={Boolean(settingsMessage)}
                    step="0.01"
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
            </details>
          </aside>

          <section className="timer-panel order-1 min-w-0 flex flex-col rounded-lg border border-[#ded5c8] bg-white shadow-sm lg:order-2">
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
                  <h2 className="result-amount mt-2 text-4xl font-black tracking-normal">
                    {currencyFormatter.format(displayedAmount)}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-[#7d746a]">입력 조건으로 계산한 재미용 환산액이며, 실제 현금은 지급되지 않습니다.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5e564e]">
                    <span>월급 {formatWon(settings.salary)} · {settings.workDays}일 · {settings.workHours}시간</span>
                    <button type="button" disabled={session.isSlacking} className="min-h-8 underline underline-offset-2 disabled:opacity-50" onClick={() => { setSettingsOpen(true); document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>조건 변경</button>
                  </div>
                  {session.isOffWork ? (
                    <p className="mt-3 rounded-md bg-[#f2ebe1] px-3 py-2 text-sm font-bold text-[#6e6259]">
                      오늘 하루 월급 루팡으로{' '}
                      {currencyFormatter.format(earnedAmount)} 벌었습니다.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md bg-[#24221f] px-4 py-3 text-white">
                  <p className="text-xs font-medium text-[#d8cdbc]">누적 시간</p>
                  <p className="font-mono text-2xl font-bold">
                    {formatDuration(displayedSeconds)}
                  </p>
                  {session.displayOffsetSeconds > 0 ? <p className="mt-1 text-xs">오늘 총 {formatDuration(elapsedSeconds)}</p> : null}
                </div>
              </div>
            </div>

            <div className="timer-body grid min-w-0 gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_200px]">
              <div
                className={`desk-scene min-w-0 order-2 xl:order-1 ${session.isOffWork ? 'off-work' : ''}`}
                role="img"
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

              <div className="order-1 min-w-0 flex flex-col justify-between gap-4 xl:order-2">
                <div className="space-y-3">
                  <button
                    className="w-full rounded-md bg-[#8b5e3c] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#744c2e] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#c2b2a2]"
                    disabled={session.isSlacking || hasReachedDailyLimit || Boolean(settingsMessage) || isPreparing}
                    type="button"
                    onClick={startSlacking}
                  >
                    {isPreparing ? '기록 확인 중' : '루팡 시작'}
                  </button>
                  {settingsMessage ? <div role="alert" className="rounded-md bg-[#f2ebe1] px-3 py-2 text-sm text-[#b95738]">{settingsMessage} <button className="underline" onClick={() => { setSettingsOpen(true); document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>근무 조건 수정</button></div> : null}
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
                    disabled={elapsedSeconds <= 0 || shareStatus === 'sharing' || Boolean(settingsMessage)}
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
                      aria-label="공유 문구"
                      className="mt-3 h-32 w-full resize-none rounded-md border border-[#d8cdbc] bg-[#fbfaf7] p-3 text-xs font-semibold leading-5 text-[#5e564e] outline-none"
                      readOnly
                      value={shareText}
                    />
                  ) : null}
                  <button
                    className="mt-3 w-full rounded-md border border-[#d8cdbc] px-4 py-3 text-sm font-semibold text-[#6e6259] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-[#aaa095]"
                    disabled={elapsedSeconds <= 0 || Boolean(settingsMessage)}
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
                  화면 기록 초기화
                </button>
                <p className="text-xs leading-5 text-[#7d746a]">화면 기록을 초기화해도 오늘의 랭킹 기록과 14시간 한도는 유지됩니다.</p>
              </div>
            </div>
          </section>

          <aside className="order-3 min-w-0 h-fit rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#8b5e3c]">Top 5</p>
                <h2 className="text-lg font-bold">실시간 랭킹</h2>
              </div>
              <div role="group" aria-label="랭킹 표시 기준" className="grid shrink-0 grid-cols-2 rounded-md border border-[#d8cdbc] bg-[#fbfaf7] p-1">
                <button
                  className={`rounded px-3 py-2 text-sm font-bold transition ${
                    rankingSort === 'amount'
                      ? 'bg-[#24221f] text-white'
                      : 'text-[#6e6259] hover:bg-[#f2ebe1]'
                  }`}
                  type="button"
                  aria-pressed={rankingSort === 'amount'}
                  onClick={() => setRankingSort('amount')}
                >
                  환산액
                </button>
                <button
                  className={`rounded px-3 py-2 text-sm font-bold transition ${
                    rankingSort === 'time'
                      ? 'bg-[#24221f] text-white'
                      : 'text-[#6e6259] hover:bg-[#f2ebe1]'
                  }`}
                  type="button"
                  aria-pressed={rankingSort === 'time'}
                  onClick={() => setRankingSort('time')}
                >
                  시간
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#7d746a]">한국 시간 매일 0시 갱신 · 시간순 Top 5{rankingSort === 'amount' ? ' · 환산액은 내 시급 기준입니다.' : ''}</p>

            <div className="mt-5 space-y-3" aria-live="polite">
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

              {rankingSaveStatus === 'error' ? <p role="status" className="text-sm text-[#b95738]">저장하지 못한 기록은 이 브라우저에 보관됩니다. 자동으로 재시도하고 있습니다.</p> : null}

              {pendingRankings.length > 0 ? (
                <div className="rounded-md bg-[#f2ebe1] p-4 text-sm font-semibold text-[#6e6259]">
                  <p>
                    저장 대기 중인 일별 기록 {pendingRankings.length}건이 있습니다. 연결되면 자동으로 다시 저장합니다.
                  </p>
                  <button
                    className="mt-3 rounded-md border border-[#8b5e3c] px-3 py-2 text-xs font-bold text-[#8b5e3c] transition hover:bg-white disabled:cursor-not-allowed disabled:text-[#aaa095]"
                    disabled={rankingSaveStatus === 'saving'}
                    type="button"
                    onClick={retry}
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

          <ContentSections
            dailyLimitAmount={dailyLimitAmount}
            earnedAmount={earnedAmount}
            minutelyRate={minutelyRate}
            repeatedMonthlyAmount={repeatedMonthlyAmount}
            secondlyRate={secondlyRate}
          />
        </div>
        <HistoryDashboard records={historyRecords} today={getTodayKey(now)} nickname={nickname} />
        <PriceCalculator settings={settings} elapsedSeconds={elapsedSeconds} onEditSettings={() => {
          setSettingsOpen(true)
          document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }} />
        <PrivacyTools uid={uid} />
      </section>
    </main>
  )
}

export default App
