type ContentSectionsProps = {
  dailyLimitAmount: number
  earnedAmount: number
  minutelyRate: number
  repeatedMonthlyAmount: number
  secondlyRate: number
}

const numberFormatter = new Intl.NumberFormat('ko-KR')
function formatWon(amount: number) {
  return `${numberFormatter.format(Math.round(amount))}원`
}

function ContentSections({
  dailyLimitAmount, earnedAmount, minutelyRate, repeatedMonthlyAmount, secondlyRate,
}: ContentSectionsProps) {
  return (
    <section className="content-sections order-4 min-w-0 lg:col-span-3" aria-label="내 계산 결과 해설">
      <div className="grid gap-6 lg:grid-cols-3">
        <article className="min-w-0 rounded-lg border border-[#ded5c8] bg-white p-5">
          <h2 className="text-lg font-bold">오늘 총 환산액</h2>
          <p className="mt-2 text-2xl font-bold">{formatWon(earnedAmount)}</p>
          <p className="mt-3 text-sm leading-6 text-[#5e564e]">
            오늘과 같은 시간을 월 근무일마다 반복한다고 가정하면 약 {formatWon(repeatedMonthlyAmount)}입니다.
            실제 월간 이력이나 추가 급여가 아닌 같은 조건의 예상치입니다.
          </p>
        </article>
        <article className="min-w-0 rounded-lg border border-[#ded5c8] bg-white p-5">
          <h2 className="text-lg font-bold">내 조건의 시간별 금액</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt>1초</dt><dd className="text-right">{secondlyRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</dd>
            <dt>1분</dt><dd className="text-right">{formatWon(minutelyRate)}</dd>
            <dt>1시간</dt><dd className="text-right">{formatWon(minutelyRate * 60)}</dd>
          </dl>
          <p className="mt-3 text-sm leading-6 text-[#5e564e]">누적 금액은 원래 비율로 계산한 뒤 원 단위로 반올림합니다.</p>
        </article>
        <article className="min-w-0 rounded-lg border border-[#ded5c8] bg-white p-5">
          <h2 className="text-lg font-bold">14시간 기준 환산액</h2>
          <p className="mt-2 text-2xl font-bold">{formatWon(dailyLimitAmount)}</p>
          <p className="mt-3 text-sm leading-6 text-[#5e564e]">
            이 서비스의 하루 기록 한도는 14시간입니다. 권장 휴식 시간이나 근로시간 기준은 아닙니다.
          </p>
        </article>
      </div>
      <p className="mt-4 text-sm text-[#5e564e]"><a className="underline underline-offset-4" href="#learn-heading">계산 원리와 조건별 예시</a> · <a className="underline underline-offset-4" href="/faq.html">기록과 저장에 관한 질문</a></p>
    </section>
  )
}
export default ContentSections
