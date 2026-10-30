(() => {
  // Keep local development and Vercel preview visits out of production reports.
  if (window.location.hostname !== 'slacker-nu.vercel.app' || window.slackerAnalyticsInitialized) return
  window.slackerAnalyticsInitialized = true

  // Public measurement ID from this project's existing Firebase-linked GA4 stream.
  const measurementId = 'G-E0ZB5379NR'
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)
})()
