import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { isFirebaseConfigured } from './firebase'
import { getRankingPosition, type RankingPosition } from './rankings'

type Props = {
  uid: string | null
  date: string
  elapsedSeconds: number
  submittedSeconds: number
  isPreparing: boolean
  isSaving: boolean
}
type Result = {
  uid: string
  date: string
  position: RankingPosition | null
  status: 'loading' | 'ready' | 'error'
  checkedAt: number | null
}

const formatter = new Intl.NumberFormat('ko-KR')
const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

function MyRanking({ uid, date, elapsedSeconds, submittedSeconds, isPreparing, isSaving }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  const requestRef = useRef<object | null>(null)
  const hasRecord = elapsedSeconds > 0
  const current = result?.uid === uid && result.date === date ? result : null
  const isLoading = current?.status === 'loading'
  const disabled = !isFirebaseConfigured || !uid || !hasRecord || isPreparing || isSaving || isLoading

  useEffect(() => () => { requestRef.current = null }, [uid, date])

  const refresh = async () => {
    if (disabled || !uid || requestRef.current) return
    const request = {}
    requestRef.current = request
    const previous = { uid, date, position: current?.position ?? null, checkedAt: current?.checkedAt ?? null }
    setResult({ ...previous, status: 'loading' })
    try {
      const position = await getRankingPosition(elapsedSeconds, uid, date, submittedSeconds)
      if (requestRef.current === request) setResult({ uid, date, position, checkedAt: Date.now(), status: 'ready' })
    } catch {
      if (requestRef.current === request) setResult({ ...previous, status: 'error' })
    } finally {
      if (requestRef.current === request) requestRef.current = null
    }
  }

  let message = ''
  if (!isFirebaseConfigured) message = '온라인 순위를 사용할 수 없습니다.'
  else if (!uid) message = '로그인 확인 중입니다.'
  else if (!hasRecord) message = '오늘 기록이 없습니다.'
  else if (isLoading && !current?.position) message = '내 순위를 확인하는 중입니다.'
  else if (!current) message = '아직 조회한 순위가 없습니다.'
  else if (current.status === 'error' && !current.position) message = '내 순위를 불러오지 못했습니다.'
  else if (!current.position) message = '오늘 기록이 없습니다.'
  const position = message ? null : current?.position
  const checkedAt = position ? current?.checkedAt : null

  return (
    <section aria-labelledby="my-ranking-heading" className="mt-5 border-t border-[#ded5c8] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="my-ranking-heading" className="text-sm font-bold">내 순위</h3>
        <span className="text-xs text-[#7d746a]">오늘 · 시간 기준</span>
      </div>
      <div role="status" aria-live="polite" className="mt-3 flex min-h-12 flex-wrap items-baseline gap-x-2 gap-y-1">
        {position ? (
          <>
            <strong className="break-all text-2xl font-bold text-[#8b5e3c]">{formatter.format(position.rank)}위</strong>
            <span className="break-all text-sm text-[#5e564e]">전체 {formatter.format(position.participants)}명 중</span>
          </>
        ) : <p className={`text-sm leading-6 ${current?.status === 'error' ? 'text-[#b95738]' : 'text-[#7d746a]'}`}>{message}</p>}
      </div>
      {checkedAt != null ? (
        <p className="text-xs leading-5 text-[#7d746a]">마지막 조회 <time dateTime={new Date(checkedAt).toISOString()}>{timeFormatter.format(checkedAt)}</time> 기준</p>
      ) : null}
      {position && current?.status === 'error' ? <p role="status" className="mt-2 text-xs leading-5 text-[#b95738]">순위를 갱신하지 못했습니다. 마지막 조회 결과입니다.</p> : null}
      <button
        type="button"
        disabled={disabled}
        aria-busy={isLoading}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#8b5e3c] px-3 py-2 text-sm font-bold text-[#8b5e3c] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void refresh()}
      >
        <RefreshCw aria-hidden="true" size={16} className={`shrink-0 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        <span>내 순위 확인하기</span>
      </button>
    </section>
  )
}

export default MyRanking
