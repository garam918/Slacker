import { calculateAmount, clampSeconds, dayStart, elapsed, getTodayKey, validateSettings, type Settings, type Tracker } from './session.ts'

const DAY_MS = 86_400_000
export type HistoryRecord = { date: string; seconds: number; settings: Settings | null }
export type ReportPeriod = 'week' | 'month'

export function validHistorySettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Settings
  if (validateSettings(source)) return null
  return { salary: source.salary, workDays: source.workDays, workHours: source.workHours }
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(dayStart(value)) && getTodayKey(dayStart(value)) === value
}

export function normalizeHistory(value: unknown, today = getTodayKey()): HistoryRecord[] {
  const records = new Map<string, HistoryRecord>()
  if (!Array.isArray(value)) return []
  for (const item of value) {
    if (!item || !isDateKey(item.date) || item.date > today) continue
    const seconds = clampSeconds(Number(item.seconds))
    if (!seconds) continue
    const previous = records.get(item.date)
    if (!previous || seconds >= previous.seconds) {
      records.set(item.date, { date: item.date, seconds, settings: validHistorySettings(item.settings) ?? previous?.settings ?? null })
    }
  }
  return [...records.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Persist absolute daily totals alongside the timer so retries and resets never add time twice.
export function archiveTracker(previous: Tracker, next: Tracker, now: number, settings: Settings): Tracker {
  const today = getTodayKey(now)
  const records = new Map(normalizeHistory(next.history ?? previous.history, today).map(record => [record.date, record]))
  const currentSettings = validHistorySettings(settings) ?? validHistorySettings(previous.historySettings)
  const previousSettings = validHistorySettings(previous.historySettings) ?? currentSettings
  const put = (date: string, seconds: number, rate?: Settings | null) => {
    if (!isDateKey(date) || date > today || seconds <= 0) return
    const stored = records.get(date)
    records.set(date, {
      date, seconds: clampSeconds(Math.max(seconds, stored?.seconds ?? 0)),
      settings: rate ?? stored?.settings ?? null,
    })
  }
  for (const record of previous.pending) put(record.sessionDate, record.totalSeconds)
  for (const record of next.pending) {
    const newlyClosedDay = record.sessionDate >= previous.session.sessionDate && record.sessionDate < next.session.sessionDate &&
      !previous.pending.some(item => item.sessionDate === record.sessionDate && item.uid === record.uid)
    put(record.sessionDate, record.totalSeconds, newlyClosedDay ? previousSettings : undefined)
  }
  put(previous.session.sessionDate, elapsed(previous.session, now), previous.session.sessionDate === today ? currentSettings : previousSettings)
  put(next.session.sessionDate, elapsed(next.session, now), next.session.sessionDate === today ? currentSettings : previousSettings)
  return { ...next, history: [...records.values()].sort((a, b) => a.date.localeCompare(b.date)), historySettings: currentSettings }
}

export function recordAmount(record: HistoryRecord): number | null {
  return record.settings ? calculateAmount(record.seconds, record.settings) : null
}

export function shiftDate(date: string, days: number) {
  return getTodayKey(dayStart(date) + days * DAY_MS)
}

export function monthDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number, 0)).getUTCDate()
}

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function calendarCells(month: string): Array<string | null> {
  const first = `${month}-01`
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const dates = Array.from({ length: monthDays(month) }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  const cells: Array<string | null> = [...Array<null>(weekday).fill(null), ...dates]
  while (cells.length % 7) cells.push(null)
  return cells
}

export function periodBounds(today: string, period: ReportPeriod) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  return period === 'week'
    ? { start: shiftDate(today, -weekday), end: shiftDate(today, 6 - weekday) }
    : { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-${monthDays(today.slice(0, 7))}` }
}

export function summarizePeriod(records: HistoryRecord[], start: string, end: string) {
  const selected = records.filter(record => record.date >= start && record.date <= end)
  return {
    seconds: selected.reduce((total, record) => total + record.seconds, 0),
    amount: selected.reduce((total, record) => total + (recordAmount(record) ?? 0), 0),
    days: selected.length,
    unknownAmountDays: selected.filter(record => !record.settings).length,
  }
}

export function reportData(records: HistoryRecord[], today: string, period: ReportPeriod) {
  const bounds = periodBounds(today, period)
  const previousStart = period === 'week' ? shiftDate(bounds.start, -7) : `${shiftMonth(today.slice(0, 7), -1)}-01`
  const previousEnd = period === 'week' ? shiftDate(today, -7) : `${previousStart.slice(0, 7)}-${String(Math.min(Number(today.slice(8)), monthDays(previousStart.slice(0, 7)))).padStart(2, '0')}`
  const summary = summarizePeriod(records, bounds.start, today)
  const previous = summarizePeriod(records, previousStart, previousEnd)
  const byDate = new Map(records.map(record => [record.date, record.seconds]))
  const dates: Array<{ date: string; seconds: number; future: boolean }> = []
  for (let date = bounds.start; date <= bounds.end; date = shiftDate(date, 1)) {
    dates.push({ date, seconds: byDate.get(date) ?? 0, future: date > today })
  }
  return { ...bounds, summary, previous, dates, comparisonSeconds: previous.days ? summary.seconds - previous.seconds : null }
}

export function formatHistoryDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole % 3600 / 60)
  const rest = whole % 60
  return [hours ? `${hours.toLocaleString('ko-KR')}시간` : '', minutes ? `${minutes}분` : '', rest || !whole ? `${rest}초` : ''].filter(Boolean).join(' ')
}
