import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveTracker, calendarCells, formatHistoryDuration, normalizeHistory, recordAmount, reportData, shiftMonth } from '../src/history.ts'
import { acknowledge, advanceTracker, changeSession, createSession } from '../src/session.ts'
import { priceTime, readPriceGoal } from '../src/priceTime.ts'

const settings = { salary: 3000000, workDays: 21, workHours: 8 }
const at = text => Date.parse(text)
const start = at('2026-10-29T12:00:00+09:00')
const empty = now => ({ session: createSession(now), pending: [] })
const transition = (tracker, action, now, rate = settings) => archiveTracker(tracker, changeSession(tracker, action, now, '테스트'), now, rate)

test('pause/resume/reset and server acknowledgements retain one absolute history total', () => {
  let tracker = transition(empty(start), 'start', start)
  tracker = transition(tracker, 'pause', start + 10000)
  tracker = acknowledge(tracker, tracker.pending[0], 10)
  assert.equal(tracker.history[0].seconds, 10)
  tracker = transition(tracker, 'reset', start + 10000)
  tracker = transition(tracker, 'start', start + 11000)
  tracker = transition(tracker, 'finish', start + 16000)
  assert.equal(tracker.history.length, 1)
  assert.equal(tracker.history[0].seconds, 15)
  assert.equal(recordAmount(tracker.history[0]), 74)
})

test('midnight archives the final old-day seconds using the old salary conditions', () => {
  const before = at('2026-10-29T23:59:50+09:00')
  let tracker = transition(empty(before), 'start', before)
  const nextSettings = { ...settings, salary: 6000000 }
  tracker = archiveTracker(tracker, advanceTracker(tracker, before + 20000, '테스트'), before + 20000, nextSettings)
  assert.deepEqual(tracker.history.map(record => [record.date, record.seconds]), [['2026-10-29', 10], ['2026-10-30', 10]])
  assert.equal(recordAmount(tracker.history[0]), 50)
  assert.equal(recordAmount(tracker.history[1]), 99)
})

test('old pending records retain time without inventing a historical salary', () => {
  const previous = { ...empty(start), pending: [{ sessionDate: '2026-10-20', totalSeconds: 120, nickname: '이전 기록' }] }
  const tracker = archiveTracker(previous, previous, start, settings)
  assert.equal(tracker.history[0].seconds, 120)
  assert.equal(recordAmount(tracker.history[0]), null)
  const report = reportData(tracker.history, '2026-10-29', 'month')
  assert.equal(report.summary.unknownAmountDays, 1)
  assert.equal(report.summary.amount, 0)
})

test('a suspended timer archives every crossed day with the last known conditions', () => {
  const before = at('2026-10-27T23:59:50+09:00')
  const previous = transition(empty(before), 'start', before)
  const after = at('2026-10-29T12:00:00+09:00')
  const tracker = archiveTracker(previous, advanceTracker(previous, after, '테스트'), after, settings)
  assert.deepEqual(tracker.history.map(record => [record.date, record.seconds, recordAmount(record)]), [
    ['2026-10-27', 10, 50], ['2026-10-28', 50400, 250000],
  ])
  assert.equal(tracker.session.isSlacking, false)
})

test('changing current conditions does not reprice historical days', () => {
  const previous = { ...empty(start), history: [{ date: '2026-10-28', seconds: 600, settings }], historySettings: settings }
  previous.session.accumulatedSeconds = 600
  const tracker = archiveTracker(previous, previous, start, { ...settings, salary: 6000000 })
  assert.equal(recordAmount(tracker.history[0]), 2976)
  assert.equal(recordAmount(tracker.history[1]), 5952)
})

test('corrupt, duplicate, future and over-limit history is normalized safely', () => {
  const records = normalizeHistory([
    null, { date: '2026-02-30', seconds: 1 }, { date: '2030-01-01', seconds: 1 },
    { date: '2026-10-28', seconds: 10, settings },
    { date: '2026-10-28', seconds: 20, settings: {} },
    { date: '2026-10-29', seconds: 999999, settings },
  ], '2026-10-29')
  assert.deepEqual(records.map(record => record.seconds), [20, 50400])
  assert.deepEqual(records[0].settings, settings)
})

test('calendar uses Monday columns, leap years and year-crossing navigation', () => {
  const cells = calendarCells('2024-02')
  assert.equal(cells[3], '2024-02-01')
  assert.ok(cells.includes('2024-02-29'))
  assert.equal(cells.length % 7, 0)
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
})

test('weekly comparisons use the same elapsed weekdays, not the whole previous week', () => {
  const records = [
    { date: '2026-10-19', seconds: 100, settings },
    { date: '2026-10-25', seconds: 900, settings },
    { date: '2026-10-26', seconds: 300, settings },
    { date: '2026-10-29', seconds: 600, settings },
  ]
  const report = reportData(records, '2026-10-29', 'week')
  assert.equal(report.start, '2026-10-26')
  assert.equal(report.end, '2026-11-01')
  assert.equal(report.previous.seconds, 100)
  assert.equal(report.comparisonSeconds, 800)
  assert.equal(report.dates.length, 7)
})

test('monthly reports sum daily amounts and handle a shorter prior month', () => {
  const records = [
    { date: '2026-02-28', seconds: 600, settings },
    { date: '2026-03-01', seconds: 600, settings },
    { date: '2026-03-31', seconds: 600, settings },
  ]
  const report = reportData(records, '2026-03-31', 'month')
  assert.equal(report.dates.length, 31)
  assert.equal(report.summary.amount, 5952)
  assert.equal(report.previous.seconds, 600)
  assert.equal(formatHistoryDuration(36061), '10시간 1분 1초')
})

test('target prices use the exact rate and round required time up to the next second', () => {
  assert.equal(priceTime(5000, settings, 0).requiredSeconds, 1008)
  assert.equal(priceTime(1, settings, 0).requiredSeconds, 1)
  assert.equal(priceTime(5000, settings, 1007).reached, false)
  assert.equal(priceTime(5000, settings, 1008).reached, true)
  assert.equal(priceTime(5000, settings, 1009).progress, 100)
  assert.equal(priceTime(1000000, settings, 0).requiredSeconds, 201600)
})

test('invalid prices and corrupt goal storage never produce invalid durations', () => {
  for (const price of [0, -1, 1.5, NaN, Infinity, 1000000001]) assert.equal(priceTime(price, settings, 0), null)
  assert.equal(priceTime(5000, { ...settings, workDays: 0 }, 0), null)
  assert.equal(priceTime(5000, { ...settings, salary: Number.MIN_VALUE }, 0), null)
  assert.equal(readPriceGoal('broken').price, '5000')
  assert.equal(readPriceGoal('{"name":"","price":""}').price, '')
  assert.equal(readPriceGoal(JSON.stringify({ name: 'x'.repeat(100), price: '1' })).name.length, 40)
})
