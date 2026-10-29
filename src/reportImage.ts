import { formatHistoryDuration, reportData, type HistoryRecord, type ReportPeriod } from './history'

export async function createReportImage(records: HistoryRecord[], today: string, nickname: string, period: ReportPeriod): Promise<Blob> {
  const report = reportData(records, today, period)
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.fillStyle = '#fafbf9'
  context.fillRect(0, 0, 1200, 900)
  const text = (value: string, x: number, y: number, size: number, maxWidth: number, color = '#24221f') => {
    context.fillStyle = color
    while (size > 14) {
      context.font = `600 ${size}px system-ui, sans-serif`
      if (context.measureText(value).width <= maxWidth) break
      size -= 1
    }
    context.fillText(value, x, y)
  }
  context.fillStyle = '#4f8f81'
  context.fillRect(0, 0, 1200, 12)
  text('월루미터 · 나의 루팡 리포트', 64, 76, 26, 1072, '#397364')
  text(`${period === 'week' ? '이번 주' : '이번 달'}의 기록`, 64, 150, 48, 1072)
  text(`${report.start} ~ ${today} · ${nickname}`, 64, 200, 23, 1072, '#5e655e')
  const metrics = [
    ['누적 시간', formatHistoryDuration(report.summary.seconds)],
    ['누적 환산액', `${report.summary.amount.toLocaleString('ko-KR')}원${report.summary.unknownAmountDays ? ' (일부 미기록)' : ''}`],
    ['기록한 날', `${report.summary.days}일`],
  ]
  metrics.forEach(([label, value], index) => {
    text(label, 64 + index * 370, 280, 22, 330, '#5e655e')
    text(value, 64 + index * 370, 332, 35, 330)
  })
  const max = Math.max(1, ...report.dates.map(day => day.seconds))
  const step = 1072 / report.dates.length
  context.strokeStyle = '#d8dfd9'
  context.beginPath()
  context.moveTo(64, 700)
  context.lineTo(1136, 700)
  context.stroke()
  report.dates.forEach((day, index) => {
    const height = Math.max(day.seconds ? 4 : 0, day.seconds / max * 260)
    context.fillStyle = day.date === today ? '#bd664d' : '#4f8f81'
    context.fillRect(64 + index * step + step * 0.2, 700 - height, step * 0.6, height)
    if (period === 'week' || index % 5 === 0 || index === report.dates.length - 1) {
      text(String(Number(day.date.slice(8))), 64 + index * step + step * 0.25, 738, 20, step * (period === 'week' ? 0.7 : 1.2), '#5e655e')
    }
  })
  text('일별 루팡 시간 · 한국 시간 기준', 64, 410, 21, 1072, '#5e655e')
  text('재미용 환산액이며 실제로 지급되거나 적립되는 금액이 아닙니다.', 64, 806, 21, 1072, '#5e655e')
  text('너도 해보기 · slacker-nu.vercel.app', 64, 850, 23, 1072, '#397364')
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'))
}

export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
