import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { trackAnalyticsEvent } from '../src/analytics.ts'

const loader = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8')

function browser(hostname) {
  const scripts = []
  return {
    scripts,
    window: { location: { hostname } },
    document: {
      createElement: () => ({}),
      head: { appendChild: element => scripts.push(element) },
    },
  }
}

test('production initializes one page-view configuration with advertising features disabled', () => {
  const context = browser('slacker-nu.vercel.app')
  runInNewContext(loader, context)
  runInNewContext(loader, context)

  assert.equal(context.scripts.length, 1)
  assert.equal(context.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-E0ZB5379NR')
  assert.equal(context.scripts[0].async, true)
  const commands = context.window.dataLayer.map(command => Array.from(command))
  assert.equal(commands.length, 2)
  assert.equal(commands[0][0], 'js')
  assert.equal(commands[1][0], 'config')
  assert.equal(commands[1][1], 'G-E0ZB5379NR')
  assert.equal(commands[1][2].allow_google_signals, false)
  assert.equal(commands[1][2].allow_ad_personalization_signals, false)
  assert.equal('user_id' in commands[1][2], false)
})

test('development and preview pages do not load Google or queue events', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'slacker-preview.vercel.app']) {
    const context = browser(hostname)
    runInNewContext(loader, context)
    assert.equal(context.scripts.length, 0)
    assert.equal(context.window.gtag, undefined)
    assert.equal(context.window.dataLayer, undefined)
  }
})

test('all public landing pages include the common loader exactly once', () => {
  const pages = [new URL('../index.html', import.meta.url),
    ...readdirSync(new URL('../public/', import.meta.url))
      .filter(file => file.endsWith('.html'))
      .map(file => new URL(`../public/${file}`, import.meta.url))]
  for (const page of pages) {
    const html = readFileSync(page, 'utf8')
    assert.equal(html.match(/src="\/analytics\.js"/g)?.length, 1, page.pathname)
  }
})

test('custom events send only their names and tracking failure cannot interrupt the app', () => {
  const previousWindow = globalThis.window
  try {
    const calls = []
    globalThis.window = { gtag: (...args) => calls.push(args) }
    trackAnalyticsEvent('timer_start')
    trackAnalyticsEvent('ranking_saved')
    assert.deepEqual(calls, [['event', 'timer_start'], ['event', 'ranking_saved']])

    globalThis.window = {}
    assert.doesNotThrow(() => trackAnalyticsEvent('timer_pause'))
    globalThis.window.gtag = () => { throw new Error('Tracking blocked') }
    assert.doesNotThrow(() => trackAnalyticsEvent('timer_finish'))
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
