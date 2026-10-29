import test from 'node:test'
import assert from 'node:assert/strict'
import { acknowledge, advanceTracker, calculateAmount, changeSession, createSession, elapsed, getTodayKey, MAX_DAILY_SECONDS, nextRankingTotal, restoreTotal, validateSettings } from '../src/session.ts'

const at = text => Date.parse(text)
const start = at('2026-10-29T12:00:00+09:00')
const empty = now => ({ session: createSession(now), pending: [] })
const settings = { salary: 3000000, workDays: 21, workHours: 8 }

test('KST midnight is shared across device timezones', () => {
  assert.equal(getTodayKey(at('2026-10-29T14:59:59Z')), '2026-10-29')
  assert.equal(getTodayKey(at('2026-10-29T15:00:00Z')), '2026-10-30')
})
test('invalid work conditions never create huge calculated amounts', () => {
  for (const bad of [{ ...settings, workDays: 0 }, { ...settings, workDays: 32 }, { ...settings, workDays: 1.5 }, { ...settings, workHours: 0 }, { ...settings, salary: Infinity }]) {
    assert.ok(validateSettings(bad)); assert.equal(calculateAmount(600, bad), 0)
  }
  assert.equal(calculateAmount(600, settings), 2976)
  assert.equal(calculateAmount(600 * 21, settings), 62500)
  assert.equal(calculateAmount(1, settings), 5)
})
test('start is idempotent and rapid stop does not queue the same time twice', () => {
  let tracker = changeSession(empty(start), 'start', start, '테스트', 'uid')
  tracker = changeSession(tracker, 'start', start + 1000, '테스트', 'uid')
  assert.equal(tracker.session.startedAt, start)
  tracker = changeSession(tracker, 'pause', start + 10000, '테스트', 'uid')
  tracker = changeSession(tracker, 'pause', start + 11000, '테스트', 'uid')
  assert.equal(tracker.pending.length, 1)
  assert.equal(tracker.pending[0].totalSeconds, 10)
})
test('absolute totals make duplicate or out-of-order saves harmless', () => {
  let total = nextRankingTotal(0, 10)
  total = nextRankingTotal(total, 10)
  total = nextRankingTotal(total, 20)
  assert.equal(nextRankingTotal(total, 10), 20)
  assert.equal(nextRankingTotal(total, 100000), MAX_DAILY_SECONDS)
})
test('reset clears only the displayed portion and new time remains saveable', () => {
  let tracker = changeSession(empty(start), 'start', start, '테스트', 'uid')
  tracker = changeSession(tracker, 'pause', start + 10000, '테스트', 'uid')
  tracker = acknowledge(tracker, tracker.pending[0], 10)
  tracker = changeSession(tracker, 'reset', start + 10000, '테스트', 'uid')
  assert.equal(tracker.session.displayOffsetSeconds, 10)
  tracker = changeSession(tracker, 'start', start + 11000, '테스트', 'uid')
  tracker = changeSession(tracker, 'pause', start + 16000, '테스트', 'uid')
  assert.equal(tracker.pending[0].totalSeconds, 15)
  assert.equal(tracker.session.accumulatedSeconds - tracker.session.displayOffsetSeconds, 5)
})
test('midnight splits time and retains yesterday offline queue', () => {
  const before = at('2026-10-29T23:59:50+09:00')
  let tracker = changeSession(empty(before), 'start', before, '테스트', 'uid')
  tracker = advanceTracker(tracker, before + 20000, '테스트', 'uid')
  assert.equal(tracker.session.sessionDate, '2026-10-30')
  assert.equal(elapsed(tracker.session, before + 20000), 10)
  assert.equal(tracker.pending[0].sessionDate, '2026-10-29')
  assert.equal(tracker.pending[0].totalSeconds, 10)
  const today = tracker.session
  tracker = acknowledge(tracker, tracker.pending[0], 10)
  assert.deepEqual(tracker.session, today)
})
test('14h auto-stops and queues even after background suspension', () => {
  const morning = at('2026-10-29T01:00:00+09:00')
  let tracker = changeSession(empty(morning), 'start', morning, '테스트', 'uid')
  tracker = advanceTracker(tracker, morning + 16 * 3600 * 1000, '테스트', 'uid')
  assert.equal(tracker.session.isSlacking, false)
  assert.equal(tracker.pending[0].totalSeconds, MAX_DAILY_SECONDS)
  tracker = changeSession(tracker, 'reset', morning + 16 * 3600 * 1000, '테스트', 'uid')
  tracker = changeSession(tracker, 'start', morning + 17 * 3600 * 1000, '테스트', 'uid')
  assert.equal(tracker.session.isSlacking, false)
})
test('sleeping through midnight after reaching limit never starts a new session', () => {
  const morning = at('2026-10-29T01:00:00+09:00')
  let tracker = changeSession(empty(morning), 'start', morning, '테스트', 'uid')
  tracker = advanceTracker(tracker, at('2026-10-31T12:00:00+09:00'), '테스트', 'uid')
  assert.equal(tracker.session.sessionDate, '2026-10-31')
  assert.equal(tracker.session.isSlacking, false)
  assert.equal(tracker.pending.length, 1)
})
test('acknowledging older snapshot preserves newer queued total', () => {
  const record = { sessionDate: getTodayKey(start), totalSeconds: 10, nickname: '테스트', uid: 'uid' }
  let tracker = { session: createSession(start), pending: [{ ...record, totalSeconds: 20 }] }
  tracker = acknowledge(tracker, record, 10)
  assert.equal(tracker.pending[0].totalSeconds, 20)
})
test('restoring server limit prevents another start after local reset', () => {
  let tracker = restoreTotal(empty(start), getTodayKey(start), MAX_DAILY_SECONDS, start)
  tracker = changeSession(tracker, 'start', start, '테스트', 'uid')
  assert.equal(tracker.session.isSlacking, false)
})
