import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'
import * as session from '../src/session.ts'

const source = transpileModule(readFileSync(new URL('../src/rankings.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ModuleKind.CommonJS },
}).outputText

function rankings(records, configured = true) {
  const calls = []
  const firestore = {
    collection: (_db, ...path) => path.join('/'),
    doc: (collection, uid) => `${collection}/${uid}`,
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, condition) => ({ collection, condition }),
    async getDocFromServer(path) {
      calls.push({ path })
      return { data: () => records.find(record => record.id === path.split('/').at(-1)) }
    },
    async getCountFromServer(query) {
      calls.push(query)
      return { data: () => ({ count: records.filter(record => record[query.condition.field] > query.condition.value).length }) }
    },
  }
  const exports = {}
  runInNewContext(source, {
    exports,
    require: name => {
      if (name === 'firebase/firestore') return firestore
      if (name === './firebase') return { db: configured ? {} : null }
      if (name === './session') return session
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return { ...exports, calls }
}

const date = '2026-10-30'
const record = (id, elapsedSeconds) => ({ id, elapsedSeconds })

test('own rank uses all participants even outside the Top 5', async () => {
  const api = rankings(Array.from({ length: 20 }, (_, index) => record(`user-${index}`, 1000 - index * 10)))
  const position = await api.getRankingPosition(830, 'user-17', date)
  assert.equal(position.rank, 18)
  assert.equal(position.participants, 20)
  assert.equal(api.calls[0].path, `dailyRankings/${date}/users/user-17`)
  assert.equal(api.calls.length, 3)
})

test('a running record overtakes the fifth place using its full daily total', async () => {
  const api = rankings([600, 500, 400, 300, 200, 190].map((seconds, i) => record(`user-${i}`, seconds)))
  const position = await api.getRankingPosition(210, 'user-5', date)
  assert.equal(position.rank, 5)
  assert.equal(position.participants, 6)
  assert.equal(position.elapsedSeconds, 210)
})

test('unsaved own record counts as one participant; zero-time nickname records are excluded', async () => {
  const api = rankings([record('first', 300), record('second', 100), record('nickname-only', 0), { id: 'missing-time' }])
  const position = await api.getRankingPosition(200, 'new-user', date)
  assert.equal(position.rank, 2)
  assert.equal(position.participants, 3)
})

test('server recovery and tied times use the same competition rank', async () => {
  const api = rankings([record('first', 300), record('peer', 200), record('me', 200), record('last', 100)])
  const position = await api.getRankingPosition(100, 'me', date)
  assert.equal(position.rank, 2)
  assert.equal(position.elapsedSeconds, 200)
  assert.equal(position.participants, 4)
  assert.equal(await api.getRankingTopPercent(100, 'me', date), 50)
})

test('empty records have no rank, while the first running participant ranks first', async () => {
  const api = rankings([])
  assert.equal(await api.getRankingPosition(0, 'me', date), null)
  assert.equal(api.calls.length, 1)
  const position = await api.getRankingPosition(1, 'me', date)
  assert.equal(position.rank, 1)
  assert.equal(position.participants, 1)
})

test('missing Firebase configuration or identity does not issue reads', async () => {
  const offline = rankings([], false)
  assert.equal(await offline.getRankingPosition(100, 'me', date), null)
  assert.equal(offline.calls.length, 0)
  const api = rankings([])
  assert.equal(await api.getRankingPosition(100, '', date), null)
  assert.equal(api.calls.length, 0)
})

test('confirmed own record is reused with only two count queries', async () => {
  const api = rankings([record('first', 300), record('peer', 200), record('me', 200), record('last', 100)])
  const position = await api.getRankingPosition(210, 'me', date, 200)
  assert.equal(position.rank, 2)
  assert.equal(position.participants, 4)
  assert.equal(position.elapsedSeconds, 210)
  assert.equal(api.calls.length, 2)
  assert.ok(api.calls.every(call => call.condition && !call.path))
  assert.ok(api.calls.every(call => call.collection === `dailyRankings/${date}/users`))
})

test('a confirmed zero is reused and an unsaved participant is counted exactly once', async () => {
  const api = rankings([record('first', 300), record('last', 100), record('nickname-only', 0)])
  const position = await api.getRankingPosition(200, 'me', date, 0)
  assert.equal(position.rank, 2)
  assert.equal(position.participants, 3)
  assert.equal(api.calls.length, 2)
  assert.ok(api.calls.every(call => !call.path))
})

test('reused server total wins over a smaller local record and preserves ties', async () => {
  const api = rankings([record('first', 300), record('peer', 200), record('me', 200)])
  const position = await api.getRankingPosition(100, 'me', date, 200)
  assert.equal(position.elapsedSeconds, 200)
  assert.equal(position.rank, 2)
  assert.equal(position.participants, 3)
  assert.equal(api.calls.length, 2)
})

test('reusing an empty record does not issue any query', async () => {
  const api = rankings([])
  assert.equal(await api.getRankingPosition(0, 'me', date, 0), null)
  assert.equal(api.calls.length, 0)
})
