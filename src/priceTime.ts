import { validateSettings, type Settings } from './session.ts'

export const MAX_TARGET_PRICE = 1_000_000_000
export type PriceGoal = { name: string; price: string }
export const DEFAULT_GOAL: PriceGoal = { name: '커피 한 잔', price: '5000' }

export function readPriceGoal(raw: string | null): PriceGoal {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<PriceGoal> | null
    if (!value || typeof value.name !== 'string' || typeof value.price !== 'string') return DEFAULT_GOAL
    return { name: value.name.slice(0, 40), price: value.price.slice(0, 16) }
  } catch { return DEFAULT_GOAL }
}

export function priceTime(price: number, settings: Settings, elapsedSeconds: number) {
  if (validateSettings(settings)) return null
  if (!Number.isSafeInteger(price) || price <= 0 || price > MAX_TARGET_PRICE) return null
  const secondsPerMonth = settings.workDays * settings.workHours * 3600
  const requiredSeconds = Math.ceil(price * secondsPerMonth / settings.salary)
  if (!Number.isSafeInteger(requiredSeconds) || requiredSeconds < 1) return null
  const seconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const progress = Math.min(100, seconds * settings.salary / secondsPerMonth / price * 100)
  return {
    requiredSeconds,
    remainingSeconds: Math.max(0, requiredSeconds - seconds),
    progress,
    reached: seconds >= requiredSeconds,
  }
}
