export const currencyFormatter = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
export const numberFormatter = new Intl.NumberFormat('ko-KR')

export function formatWon(amount: number) {
  return `${numberFormatter.format(Math.round(amount))}원`
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

export function formatShareDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [
    hours > 0 ? `${hours}시간` : '',
    minutes > 0 ? `${minutes}분` : '',
    seconds > 0 || totalSeconds === 0 ? `${seconds}초` : '',
  ].filter(Boolean).join(' ')
}
