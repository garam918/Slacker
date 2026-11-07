import { formatShareDuration, formatWon } from './format'
import { getTodayKey } from './session'

export const SHARE_URL = 'https://slacker-nu.vercel.app/'

export function buildShareText(elapsedSeconds: number, earnedAmount: number, topPercent: number | null) {
  return [
    `나는 오늘 ${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`,
    ...(topPercent !== null ? [`현재 루팡리그 상위 ${topPercent}% (시간 기준)`] : []),
    `회사로부터 ${formatWon(earnedAmount)}을 훔쳤습니다.`,
    '당신의 순위는?', `너도 해보기 👉 ${SHARE_URL}`,
  ].join('\n')
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

/** Draws the 1200x630 result card and starts the download. Returns false without a canvas. */
export function downloadShareCard(elapsedSeconds: number, earnedAmount: number, nickname: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200; canvas.height = 630
  const context = canvas.getContext('2d')
  if (!context) return false
  context.fillStyle = '#f7f2ea'; context.fillRect(0, 0, 1200, 630)
  context.fillStyle = '#24221f'; context.fillRect(64, 64, 1072, 502)
  context.fillStyle = '#fff8ef'; context.fillRect(92, 92, 1016, 446)
  const line = (text: string, y: number, size: number, color: string) => {
    context.fillStyle = color
    while (size > 20) {
      context.font = `700 ${size}px system-ui, sans-serif`
      if (context.measureText(text).width <= 916) break
      size -= 2
    }
    context.fillText(text, 142, y)
  }
  line('월루미터 루팡 기록', 170, 36, '#8b5e3c')
  line(formatWon(earnedAmount), 280, 72, '#24221f')
  line(`${formatShareDuration(elapsedSeconds)} 월급 루팡 성공`, 356, 40, '#24221f')
  line(`닉네임: ${nickname}`, 424, 30, '#5e564e')
  line('너도 해보기: slacker-nu.vercel.app', 482, 30, '#5e564e')
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png'); link.download = `wolumeter-${getTodayKey()}.png`; link.click()
  return true
}
