type ContentSectionsProps = {
  dailyLimitAmount: number
  earnedAmount: number
  minutelyRate: number
  repeatedMonthlyAmount: number
  secondlyRate: number
}

const numberFormatter = new Intl.NumberFormat('ko-KR')

const exampleAmounts = [
  { salary: 2500000, amount: 2480, label: '월급 250만 원' },
  { salary: 3000000, amount: 2976, label: '월급 300만 원' },
  { salary: 5000000, amount: 4960, label: '월급 500만 원' },
]

function formatWon(amount: number) {
  return `${numberFormatter.format(Math.floor(amount))}원`
}

function ContentSections({
  dailyLimitAmount,
  earnedAmount,
  minutelyRate,
  repeatedMonthlyAmount,
  secondlyRate,
}: ContentSectionsProps) {
  return (
    <>
      <section className="lg:col-span-3">
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#8b5e3c]">
              계산 결과 해설
            </p>
            <h2 className="mt-2 text-xl font-bold">
              지금까지 훔친 월급은 {formatWon(earnedAmount)}입니다
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#5e564e]">
              현재 입력한 근무 조건 기준으로 1초마다 약{' '}
              {formatWon(secondlyRate)}, 1분마다 약 {formatWon(minutelyRate)}이
              누적됩니다. 오늘과 같은 루팡이 한 달 근무일마다 반복되면 약{' '}
              {formatWon(repeatedMonthlyAmount)}에 해당합니다.
            </p>
          </article>

          <article className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#8b5e3c]">계산 공식</p>
            <h2 className="mt-2 text-xl font-bold">
              월급을 근무 시간으로 나눠 초당 수익을 계산합니다
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#5e564e]">
              초당 수익은 월급 나누기 월 근무일, 하루 근무시간, 3,600으로
              계산합니다. 루팡 금액은 초당 수익에 루팡 시간을 곱한 값이며,
              하루 최대 기록은 14시간으로 제한됩니다.
            </p>
          </article>

          <article className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#8b5e3c]">하루 최대치</p>
            <h2 className="mt-2 text-xl font-bold">
              오늘 최대로 기록할 수 있는 금액은 {formatWon(dailyLimitAmount)}입니다
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#5e564e]">
              비정상적인 장시간 기록을 막기 위해 하루 루팡 가능 시간은
              14시간으로 제한됩니다. 랭킹도 같은 기준을 사용해 매일 자정 이후
              새로 시작합니다.
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm lg:col-span-3 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#8b5e3c]">월급별 예시</p>
            <h2 className="text-2xl font-bold">10분 쉬면 얼마가 쌓일까요?</h2>
          </div>
          <a
            className="text-sm font-bold text-[#8b5e3c] underline-offset-2 hover:underline"
            href="/examples.html"
          >
            예시 더 보기
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {exampleAmounts.map((example) => (
            <div
              className="rounded-md border border-[#eadfce] bg-[#fbfaf7] p-4"
              key={example.salary}
            >
              <p className="text-sm font-bold text-[#24221f]">{example.label}</p>
              <p className="mt-2 text-2xl font-black text-[#8b5e3c]">
                약 {formatWon(example.amount)}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#7d746a]">
                월 21일, 하루 8시간 근무 기준으로 10분 동안 루팡했을 때의
                대략적인 금액입니다.
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:col-span-3 lg:grid-cols-2">
        <article className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-[#8b5e3c]">랭킹 설명</p>
          <h2 className="mt-2 text-2xl font-bold">
            랭킹은 오늘 기록만 비교합니다
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#5e564e]">
            월루미터 랭킹은 금액과 시간 기준 Top 5를 보여줍니다. 기록은 Firebase
            익명 ID와 닉네임, 누적 루팡 시간만 저장하며, 매일 자정이 지나면 새
            날짜 랭킹으로 전환됩니다.
          </p>
          <a
            className="mt-4 inline-block text-sm font-bold text-[#8b5e3c] underline-offset-2 hover:underline"
            href="/ranking.html"
          >
            랭킹 기준 보기
          </a>
        </article>

        <article className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-semibold text-[#8b5e3c]">About</p>
          <h2 className="mt-2 text-2xl font-bold">
            재미로 보는 월급 루팡 계산기
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#5e564e]">
            월루미터는 쉬는 시간의 가치를 숫자로 확인해보는 가벼운 웹
            서비스입니다. 실제 급여 정산 도구가 아니라, 입력한 조건에 따라
            계산한 참고용 결과를 제공합니다.
          </p>
          <a
            className="mt-4 inline-block text-sm font-bold text-[#8b5e3c] underline-offset-2 hover:underline"
            href="/about.html"
          >
            서비스 소개 보기
          </a>
        </article>
      </section>

      <section className="rounded-lg border border-[#ded5c8] bg-white p-5 shadow-sm lg:col-span-3 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#8b5e3c]">FAQ</p>
            <h2 className="text-2xl font-bold">자주 묻는 질문</h2>
          </div>
          <a
            className="text-sm font-bold text-[#8b5e3c] underline-offset-2 hover:underline"
            href="/faq.html"
          >
            전체 FAQ 보기
          </a>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-bold">월급 정보가 서버에 저장되나요?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#5e564e]">
              아니요. 월급, 근무일, 근무시간은 브라우저 localStorage에만
              저장됩니다. 랭킹에는 닉네임과 누적 루팡 시간만 사용합니다.
            </p>
          </div>
          <div>
            <h3 className="font-bold">계산 결과는 정확한 급여인가요?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#5e564e]">
              실제 급여, 세금, 수당, 회사별 근무 규정은 반영하지 않습니다.
              입력한 월급과 근무 시간 기준으로 환산한 재미용 결과입니다.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

export default ContentSections
