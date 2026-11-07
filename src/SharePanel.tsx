import { useEffect, useId, useRef, useState } from 'react'
import { Ellipsis, ImageDown, RotateCcw, Share2, X } from 'lucide-react'
import { buildShareText, copyTextToClipboard, downloadShareCard } from './share'
import { MAX_DAILY_HOURS } from './session'

type Props = {
  elapsedSeconds: number
  earnedAmount: number
  nickname: string
  disabled: boolean
  /** Looks up the time-based percentile; null when it cannot be confirmed. */
  getTopPercent: () => Promise<number | null>
  onReset: () => void
}

// Remounted by the parent when the screen record is reset, which clears every message here.
function SharePanel({ elapsedSeconds, earnedAmount, nickname, disabled, getTopPercent, onReset }: Props) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'shared' | 'copied' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [text, setText] = useState('')
  const [cardMessage, setCardMessage] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const toolsId = useId()

  useEffect(() => {
    if (!isOpen) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolsRef.current?.contains(event.target)) setIsOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [isOpen])

  const share = async () => {
    if (elapsedSeconds <= 0) return
    setStatus('sharing'); setMessage('')
    let percent: number | null = null
    try { percent = await getTopPercent() } catch { /* Share the record without an unverified percentile. */ }
    const next = buildShareText(elapsedSeconds, earnedAmount, percent)
    setText(next)
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: '월루미터', text: next })
          setStatus('shared'); setMessage('기록을 공유했습니다.'); return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') { setStatus('idle'); return }
        }
      }
      await copyTextToClipboard(next)
      setStatus('copied'); setMessage('공유 문구를 복사했습니다.')
    } catch { setStatus('error'); setMessage('아래 문구를 직접 복사해 주세요.') }
  }

  const saveCard = () => {
    if (elapsedSeconds <= 0) return
    setCardMessage(downloadShareCard(elapsedSeconds, earnedAmount, nickname) ? '공유 카드 이미지를 저장했습니다.' : '이미지를 만들지 못했습니다.')
  }

  return (
    <div ref={toolsRef} className={`timer-tools ${isOpen ? 'is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="timer-tools-trigger"
        aria-label="기록 더보기"
        aria-expanded={isOpen}
        aria-controls={toolsId}
        onClick={() => setIsOpen(open => !open)}
      >
        <Ellipsis size={22} aria-hidden="true" />
      </button>
      <div id={toolsId} className="timer-tools-options" role="group" aria-label="기록 도구">
        <div className="timer-tools-heading">
          <span>기록 도구</span>
          <button type="button" aria-label="기록 더보기 닫기" onClick={() => { setIsOpen(false); triggerRef.current?.focus() }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          className="w-full rounded-md border border-[#8b5e3c] bg-[#fbfaf7] px-4 py-3 text-sm font-bold text-[#8b5e3c] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#d8cdbc] disabled:text-[#aaa095]"
          disabled={elapsedSeconds <= 0 || status === 'sharing' || disabled}
          type="button"
          onClick={() => void share()}
        >
          <Share2 className="timer-tool-icon" size={18} aria-hidden="true" />
          {status === 'sharing'
            ? '공유 문구 생성 중'
            : '내 루팡 기록 공유하기'}
        </button>
        {message ? (
          <p
            role="status"
            className={`mt-2 text-center text-xs font-semibold ${
              status === 'error'
                ? 'text-[#b95738]'
                : 'text-[#3f6b4d]'
            }`}
          >
            {message}
          </p>
        ) : null}
        {text ? (
          <textarea
            aria-label="공유 문구"
            className="mt-3 h-32 w-full resize-none rounded-md border border-[#d8cdbc] bg-[#fbfaf7] p-3 text-xs font-semibold leading-5 text-[#5e564e] outline-none"
            readOnly
            value={text}
          />
        ) : null}
        <button
          className="mt-3 w-full rounded-md border border-[#d8cdbc] px-4 py-3 text-sm font-semibold text-[#6e6259] transition hover:bg-[#f2ebe1] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-[#aaa095]"
          disabled={elapsedSeconds <= 0 || disabled}
          type="button"
          onClick={saveCard}
        >
          <ImageDown className="timer-tool-icon" size={18} aria-hidden="true" />
          결과 카드 이미지 저장
        </button>
        {cardMessage ? (
          <p role="status" className="mt-2 text-center text-xs font-semibold text-[#3f6b4d]">
            {cardMessage}
          </p>
        ) : null}
        <div className="timer-reset-action">
          <button type="button" onClick={onReset} className="w-full rounded-md border border-[#d8cdbc] px-4 py-3 text-sm font-semibold text-[#6e6259] transition hover:bg-[#f2ebe1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e3c]">
            <RotateCcw className="timer-tool-icon" size={18} aria-hidden="true" />
            화면 기록 초기화
          </button>
          <p className="mt-3 text-xs leading-5 text-[#7d746a]">화면을 초기화해도 오늘 기록과 {MAX_DAILY_HOURS}시간 한도는 유지됩니다.</p>
        </div>
      </div>
    </div>
  )
}

export default SharePanel
