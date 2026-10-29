import { useState } from 'react'
import { RotateCcw, ShoppingBag } from 'lucide-react'
import { formatHistoryDuration } from './history'
import { DEFAULT_GOAL, MAX_TARGET_PRICE, priceTime, readPriceGoal, type PriceGoal } from './priceTime'
import { MAX_DAILY_SECONDS, validateSettings, type Settings } from './session'

const GOAL_KEY = 'slacker.priceGoal'
const examples = [
  { name: '커피 한 잔', price: '5000' },
  { name: '점심 한 끼', price: '12000' },
  { name: '나에게 주는 선물', price: '100000' },
]

function PriceCalculator({ settings, elapsedSeconds, onEditSettings }: { settings: Settings; elapsedSeconds: number; onEditSettings: () => void }) {
  const [goal, setGoal] = useState(() => {
    try { return readPriceGoal(localStorage.getItem(GOAL_KEY)) } catch { return DEFAULT_GOAL }
  })
  const [storageMessage, setStorageMessage] = useState('')
  const price = Number(goal.price)
  const settingsError = validateSettings(settings)
  const priceError = !goal.price.trim() ? '목표 가격을 입력해 주세요.' : !Number.isSafeInteger(price) || price <= 0 || price > MAX_TARGET_PRICE ? '가격은 1원~10억 원의 정수로 입력해 주세요.' : ''
  const result = priceTime(price, settings, elapsedSeconds)
  const exampleIndex = examples.findIndex(example => example.name === goal.name && example.price === goal.price)
  const displayProgress = result ? result.reached ? 100 : Math.min(99.9, Math.round(result.progress * 10) / 10) : 0

  const updateGoal = (next: PriceGoal) => {
    setGoal(next)
    try {
      localStorage.setItem(GOAL_KEY, JSON.stringify(next))
      setStorageMessage('')
    } catch { setStorageMessage('목표를 브라우저에 저장하지 못했습니다. 현재 화면에서는 계속 계산할 수 있습니다.') }
  }

  return (
    <section id="price-time" className="personal-section" aria-labelledby="price-heading">
      <header className="personal-section-header">
        <div><p className="section-kicker">MONEY TO TIME</p><h2 id="price-heading"><ShoppingBag size={22} aria-hidden="true" />이거 사려면 몇 분?</h2></div>
        <button className="icon-command" type="button" title="목표 초기화" aria-label="목표 초기화" onClick={() => updateGoal({ ...DEFAULT_GOAL })}><RotateCcw size={18} aria-hidden="true" /></button>
      </header>
      <div className="price-layout">
        <div className="price-inputs">
          <label htmlFor="goal-example">예시 목표</label>
          <select id="goal-example" value={exampleIndex < 0 ? 'custom' : String(exampleIndex)} onChange={event => updateGoal(event.target.value === 'custom' ? { name: '', price: '' } : { ...examples[Number(event.target.value)] })}>
            <option value="custom">직접 입력</option>
            {examples.map((example, index) => <option key={example.name} value={index}>{example.name} · 예시 {Number(example.price).toLocaleString('ko-KR')}원</option>)}
          </select>
          <label htmlFor="goal-name">사고 싶은 것</label>
          <input id="goal-name" type="text" maxLength={40} placeholder="목표 이름" value={goal.name} onChange={event => updateGoal({ ...goal, name: event.target.value })} />
          <label htmlFor="goal-price">목표 가격</label>
          <div className="goal-price-field"><input id="goal-price" type="number" inputMode="numeric" min={1} max={MAX_TARGET_PRICE} step={1} value={goal.price} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? 'goal-price-error' : undefined} onChange={event => updateGoal({ ...goal, price: event.target.value })} /><span>원</span></div>
          {priceError ? <p id="goal-price-error" role="alert" className="feature-error">{priceError}</p> : null}
          <button className="text-command" type="button" onClick={onEditSettings}>내 월급·근무 조건 변경</button>
          {storageMessage ? <p className="feature-error" role="status">{storageMessage}</p> : null}
        </div>
        <div className="price-result">
          {settingsError ? <p className="feature-error">{settingsError}</p> : result ? <>
            <p className="goal-name">{goal.name.trim() || '나의 목표'} · {price.toLocaleString('ko-KR')}원</p>
            <p className="result-caption">내 근무시간으로</p>
            <p className="price-duration"><output htmlFor="goal-price" aria-label="필요한 근무시간" aria-live="polite">{formatHistoryDuration(result.requiredSeconds)}</output></p>
            <div className="goal-progress-heading"><span>오늘 기록 기준</span><strong>{displayProgress}%</strong></div>
            <progress className="goal-progress" aria-label="오늘 기록의 목표 달성률" max={100} value={result.progress} />
            <p className="goal-remaining">{result.reached ? '오늘 목표 환산액에 도달했습니다.' : <>목표까지 <strong>{formatHistoryDuration(result.remainingSeconds)}</strong> 남았습니다.</>}</p>
            {result.requiredSeconds > MAX_DAILY_SECONDS && !result.reached ? <p className="record-basis">오늘의 14시간 기록 한도보다 큰 목표입니다.</p> : null}
            <p className="record-basis">현재 근무 조건의 환산액이며 실제로 저축되거나 적립된 돈이 아닙니다.</p>
          </> : <p className="empty-record">{priceError || '입력한 가격과 근무 조건으로 시간을 계산할 수 없습니다.'}</p>}
        </div>
      </div>
    </section>
  )
}

export default PriceCalculator
