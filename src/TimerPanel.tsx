import { useState } from 'react'
import DeskScene from './DeskScene'
import SharePanel from './SharePanel'
import { currencyFormatter, formatDuration, formatWon } from './format'
import { MAX_DAILY_HOURS, MAX_RUN_MINUTES, RUN_WARNING_MINUTES, type Session, type Settings } from './session'

type Props = {
  session: Session
  settings: Settings
  settingsMessage: string
  elapsedSeconds: number
  displayedSeconds: number
  earnedAmount: number
  displayedAmount: number
  hasReachedDailyLimit: boolean
  canContinue: boolean
  runRemainingMs: number
  isPreparing: boolean
  nickname: string
  getTopPercent: () => Promise<number | null>
  onStart: () => void
  onContinue: () => void
  onPause: () => void
  onFinish: () => void
  onReset: () => void
  onEditSettings: () => void
}

function TimerPanel({
  session, settings, settingsMessage, elapsedSeconds, displayedSeconds, earnedAmount, displayedAmount,
  hasReachedDailyLimit, canContinue, runRemainingMs, isPreparing, nickname, getTopPercent,
  onStart, onContinue, onPause, onFinish, onReset, onEditSettings,
}: Props) {
  const [shareKey, setShareKey] = useState(0)
  let primaryLabel = elapsedSeconds > 0 && !session.isOffWork ? '이어서 시작' : '루팡 시작'
  let primaryAction = onStart
  if (session.isSlacking) {
    primaryLabel = '다시 일하기'
    primaryAction = onPause
  }
  if (canContinue) {
    primaryLabel = `계속하기 · ${MAX_RUN_MINUTES}분`
    primaryAction = onContinue
  }
  if (hasReachedDailyLimit) primaryLabel = '오늘 기록 완료'
  else if (isPreparing && !session.isSlacking) primaryLabel = '기록 확인 중'

  const reset = () => {
    onReset()
    setShareKey(key => key + 1)
  }

  return (
    <section className="timer-panel relative order-1 min-w-0 flex flex-col rounded-lg border border-[#ded5c8] bg-white shadow-sm lg:order-2">
      <div className="timer-summary border-b border-[#ded5c8] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="timer-status text-sm font-semibold text-[#8b5e3c]">
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
              <button type="button" disabled={session.isSlacking} className="min-h-8 underline underline-offset-2 disabled:opacity-50" onClick={onEditSettings}>조건 변경</button>
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
        <DeskScene isSlacking={session.isSlacking} isOffWork={session.isOffWork} />

        <div className="order-1 min-w-0 flex flex-col justify-between gap-4 xl:order-2">
          <div className="mobile-timer-controls sm:hidden">
            {canContinue && (
              <div className="timer-renewal-notice">
                <p role="status">곧 자동으로 일시정지됩니다.</p>
                <p className="tabular-nums">남은 시간 {formatDuration(Math.ceil(runRemainingMs / 1000))}</p>
              </div>
            )}
            <button
              type="button"
              className="timer-primary w-full min-h-14 rounded-md bg-[#8b5e3c] px-4 py-4 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e3c] disabled:bg-[#c2b2a2]"
              disabled={hasReachedDailyLimit || (!session.isSlacking && (Boolean(settingsMessage) || isPreparing))}
              onClick={primaryAction}
            >
              {primaryLabel}
            </button>
            <p className="mt-3 text-center text-xs text-[#7d746a]">한 번에 {MAX_RUN_MINUTES}분 · 하루 최대 {MAX_DAILY_HOURS}시간</p>
            {session.pausedByRunLimit && !hasReachedDailyLimit && (
              <p role="status" className="mt-3 text-sm leading-6 text-[#8b5e3c]">{MAX_RUN_MINUTES}분이 지나 일시정지됐습니다. 이어서 시작하면 오늘 기록에 더해집니다.</p>
            )}
            {hasReachedDailyLimit && (
              <p role="status" className="mt-3 text-sm leading-6">오늘의 {MAX_DAILY_HOURS}시간 기록을 모두 채웠습니다.</p>
            )}
            {settingsMessage && (
              <p role="alert" className="mt-3 text-sm leading-6 text-[#b95738]">
                {settingsMessage}{' '}
                <button type="button" className="min-h-11 underline underline-offset-4" onClick={onEditSettings}>근무 조건 수정</button>
              </p>
            )}
            {!session.isOffWork && (session.isSlacking || elapsedSeconds > 0) && (
              <div className="mt-2 flex justify-center gap-6">
                {canContinue && (
                  <button type="button" onClick={onPause} className="min-h-11 text-sm text-[#5e564e] underline underline-offset-4">다시 일하기</button>
                )}
                <button type="button" onClick={onFinish} className="min-h-11 text-sm text-[#5e564e] underline underline-offset-4">퇴근하기</button>
              </div>
            )}
          </div>
          <div className="hidden space-y-3 sm:block">
            <button
              className="w-full rounded-md bg-[#8b5e3c] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#744c2e] focus:outline-none focus:ring-2 focus:ring-[#8b5e3c] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#c2b2a2]"
              disabled={session.isSlacking || hasReachedDailyLimit || Boolean(settingsMessage) || isPreparing}
              type="button"
              onClick={onStart}
            >
              {isPreparing ? '기록 확인 중' : '루팡 시작'}
            </button>
            <p className="text-xs leading-5 text-[#5e564e]">
              한 번에 최대 {MAX_RUN_MINUTES}분을 기록합니다. 종료 {RUN_WARNING_MINUTES}분 전부터 계속하기로 시간을 연장할 수 있습니다.
            </p>
            {canContinue && (
              <div className="rounded-md border border-[#8b5e3c] bg-[#f2ebe1] p-3">
                <p role="status" className="text-sm font-semibold">곧 자동으로 일시정지됩니다.</p>
                <p className="mt-1 text-sm">남은 시간 {formatDuration(Math.ceil(runRemainingMs / 1000))}</p>
                <button type="button" onClick={onContinue} className="mt-2 min-h-11 w-full rounded-md bg-[#8b5e3c] px-3 py-2 font-semibold text-white">
                  계속하기 ({MAX_RUN_MINUTES}분)
                </button>
              </div>
            )}
            {session.pausedByRunLimit && !hasReachedDailyLimit && (
              <p role="status" className="rounded-md bg-[#f2ebe1] p-3 text-sm">
                {MAX_RUN_MINUTES}분이 지나 자동으로 일시정지됐습니다. 다시 시작하면 오늘 기록에 이어서 쌓입니다.
              </p>
            )}
            {settingsMessage ? <div role="alert" className="rounded-md bg-[#f2ebe1] px-3 py-2 text-sm text-[#b95738]">{settingsMessage} <button className="underline" onClick={onEditSettings}>근무 조건 수정</button></div> : null}
            {hasReachedDailyLimit ? (
              <p className="rounded-md bg-[#f2ebe1] px-3 py-2 text-center text-xs font-bold text-[#8b5e3c]">
                오늘 루팡 가능 시간 {MAX_DAILY_HOURS}시간을 모두 사용했습니다.
              </p>
            ) : null}
            <button
              className="w-full rounded-md border border-[#24221f] bg-white px-4 py-4 text-base font-bold text-[#24221f] transition hover:bg-[#f7f2ea] focus:outline-none focus:ring-2 focus:ring-[#24221f] focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#d8cdbc] disabled:text-[#aaa095]"
              disabled={!session.isSlacking || session.isOffWork}
              type="button"
              onClick={onPause}
            >
              다시 일하기
            </button>
            <button
              className="w-full rounded-md bg-[#24221f] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#3a3731] focus:outline-none focus:ring-2 focus:ring-[#24221f] focus:ring-offset-2"
              type="button"
              onClick={onFinish}
            >
              퇴근하기
            </button>
          </div>

          <SharePanel
            key={shareKey}
            elapsedSeconds={elapsedSeconds}
            earnedAmount={earnedAmount}
            nickname={nickname}
            disabled={Boolean(settingsMessage)}
            getTopPercent={getTopPercent}
            onReset={reset}
          />
        </div>
      </div>
    </section>
  )
}

export default TimerPanel
