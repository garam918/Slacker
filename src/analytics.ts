type AnalyticsEvent = 'timer_start' | 'timer_pause' | 'timer_finish' | 'timer_reset' | 'ranking_saved'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

// Send event names only; salary, nickname, goals and Firebase UID stay out of GA.
export function trackAnalyticsEvent(event: AnalyticsEvent) {
  try {
    window.gtag?.('event', event)
  } catch {
    // Tracking must never interrupt the timer or ranking persistence.
  }
}
