import { useEffect, useState } from 'react'

const CONTACT = 'dev.garam918@gmail.com'

function PrivacyTools({ uid }: { uid: string | null }) {
  const [isOpen, setIsOpen] = useState(() => window.location.hash === '#privacy-tools')
  const [message, setMessage] = useState('')
  const draft = [
    '요청 유형: 열람 / 정정 / 삭제 중 선택',
    `내 기록 식별자: ${uid ?? '확인하지 못함'}`,
    '대상 날짜 또는 기간:',
    '요청 내용:',
    '',
    '월급 원본, 비밀번호, 인증 토큰은 보내지 마세요.',
  ].join('\n')
  const mail = `mailto:${CONTACT}?subject=${encodeURIComponent('월루미터 개인정보 문의')}&body=${encodeURIComponent(draft)}`

  useEffect(() => {
    const reveal = () => {
      if (window.location.hash !== '#privacy-tools') return
      setIsOpen(true)
      requestAnimationFrame(() => document.getElementById('privacy-tools')?.scrollIntoView({ block: 'start' }))
    }
    if (window.location.hash === '#privacy-tools') {
      requestAnimationFrame(() => document.getElementById('privacy-tools')?.scrollIntoView({ block: 'start' }))
    }
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [])

  const copy = async () => {
    if (!uid) return
    try {
      await navigator.clipboard.writeText(uid)
      setMessage('기록 식별자를 복사했습니다.')
    } catch {
      setMessage('자동 복사를 사용할 수 없습니다. 위 식별자를 직접 선택해 복사해 주세요.')
    }
  }

  return (
    <section className="border-t border-[#ded5c8] py-5 text-sm text-[#5e564e]">
      <details id="privacy-tools" className="scroll-mt-6" open={isOpen} onToggle={event => setIsOpen(event.currentTarget.open)}>
        <summary className="min-h-9 cursor-pointer font-bold text-[#24221f]">내 기록과 개인정보</summary>
        <div className="mt-3 max-w-2xl space-y-3 leading-6">
          <p>서버 기록의 열람·정정·삭제를 문의할 때 사용할 식별자입니다. 닉네임과 별도로 기록을 구분하며, 공개 공유 문구에는 포함하지 않습니다.</p>
          <label className="block" htmlFor="record-id">내 기록 식별자</label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input id="record-id" className="min-w-0 flex-1 rounded-md border border-[#d8cdbc] bg-white px-3 py-2 font-mono text-sm" readOnly value={uid ?? ''} placeholder="온라인 기록 식별자를 확인하지 못했습니다." />
            <button type="button" className="min-h-11 self-start rounded-md border border-[#d8cdbc] px-3 font-semibold disabled:opacity-50 sm:self-stretch" disabled={!uid} onClick={() => void copy()}>식별자 복사</button>
          </div>
          <p role="status" aria-live="polite">{message}</p>
          <p>서버 기록 삭제를 원한다면 이 식별자를 확인한 뒤 문의해 주세요. 화면 기록 초기화나 브라우저 데이터 삭제만으로 서버 기록이 삭제되지는 않습니다.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="underline underline-offset-4" href={mail}>열람·삭제 문의메일 작성</a>
            <a className="underline underline-offset-4" href="/privacy.html">개인정보처리방침</a>
          </div>
          <p className="text-xs">이메일 작성 화면만 열며 자동으로 발송하지 않습니다. 월급, 비밀번호, 인증 토큰은 문의에 필요하지 않습니다.</p>
        </div>
      </details>
    </section>
  )
}

export default PrivacyTools
