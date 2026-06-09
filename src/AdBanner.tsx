import { useEffect } from 'react'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

type AdBannerProps = {
  className?: string
  format?: 'auto' | 'horizontal'
  slot?: string
}

const adsenseClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID

function AdBanner({ className = '', format = 'horizontal', slot }: AdBannerProps) {
  const isReady = Boolean(adsenseClientId && slot)

  useEffect(() => {
    if (!isReady) {
      return
    }

    try {
      window.adsbygoogle = window.adsbygoogle ?? []
      window.adsbygoogle.push({})
    } catch {
      // AdSense may be blocked locally or unavailable before site approval.
    }
  }, [isReady])

  return (
    <aside
      className={`min-h-[112px] rounded-lg border border-[#ded5c8] bg-white p-3 shadow-sm ${className}`}
      aria-label="광고"
    >
      {isReady ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', minHeight: 90 }}
          data-ad-client={adsenseClientId}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      ) : (
        <div className="flex min-h-[88px] items-center justify-center rounded-md bg-[#f2ebe1] px-4 text-center text-sm font-semibold text-[#6e6259]">
          광고 슬롯 환경변수를 설정하면 이 영역에 광고가 표시됩니다.
        </div>
      )}
    </aside>
  )
}

export default AdBanner
