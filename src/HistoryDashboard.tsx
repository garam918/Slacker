import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, Share2 } from 'lucide-react'
import { calendarCells, formatHistoryDuration, recordAmount, reportData, shiftMonth, type HistoryRecord, type ReportPeriod } from './history'
import { createReportImage, downloadReport } from './reportImage'

const weekdays = ['월', '화', '수', '목', '금', '토', '일']
const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`
const dateLabel = (date: string) => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`

function HistoryDashboard({ records, today, nickname }: { records: HistoryRecord[]; today: string; nickname: string }) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today)
  const [period, setPeriod] = useState<ReportPeriod>('week')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const byDate = new Map(records.map(record => [record.date, record]))
  const selected = byDate.get(selectedDate)
  const selectedAmount = selected ? recordAmount(selected) : null
  const report = reportData(records, today, period)
  const maxSeconds = Math.max(1, ...report.dates.map(day => day.seconds))
  const firstMonth = records[0]?.date.slice(0, 7) ?? today.slice(0, 7)
  const periodLabel = period === 'week' ? '이번 주' : '이번 달'
  const comparisonLabel = period === 'week' ? '지난주 같은 요일까지' : '지난달 같은 날짜까지'

  const exportReport = async (share: boolean) => {
    setBusy(true)
    setMessage('')
    try {
      const blob = await createReportImage(records, today, nickname, period)
      const filename = `wolumeter-${period}-${today}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `월루미터 ${periodLabel} 리포트`, files: [file] })
        setMessage('리포트를 공유했습니다.')
      } else {
        downloadReport(blob, filename)
        setMessage(share ? '이 브라우저에서는 이미지 공유 대신 파일로 저장합니다.' : '리포트 이미지를 저장했습니다.')
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('리포트를 저장하거나 공유하지 못했습니다. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  return (
    <section id="my-records" className="personal-section" aria-labelledby="records-heading">
      <header className="personal-section-header">
        <div><p className="section-kicker">MY RECORD</p><h2 id="records-heading"><CalendarDays aria-hidden="true" size={22} />내 루팡 기록</h2></div>
        <p className="section-meta">한국 시간 기준 · 이 브라우저에 저장</p>
      </header>
      <div className="records-layout">
        <div className="record-calendar">
          <div className="calendar-toolbar">
            <h3 aria-live="polite">{monthLabel(month)}</h3>
            <div className="calendar-actions">
              <button className="small-command" type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today) }}>오늘</button>
              <button className="icon-command" type="button" title="이전 달" aria-label="이전 달" disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
              <button className="icon-command" type="button" title="다음 달" aria-label="다음 달" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-dates" role="group" aria-label={`${monthLabel(month)} 일별 기록`}>
            {calendarCells(month).map((date, index) => {
              if (!date) return <span className="calendar-blank" key={`blank-${index}`} />
              const record = byDate.get(date)
              return <button type="button" key={date} className={`calendar-date${date === today ? ' is-today' : ''}${record ? ' has-record' : ''}`} aria-pressed={date === selectedDate} disabled={date > today} aria-label={`${dateLabel(date)}${date === today ? ' 오늘' : ''}, ${record ? formatHistoryDuration(record.seconds) : '기록 없음'}`} onClick={() => setSelectedDate(date)}>
                <span>{Number(date.slice(8))}</span>
                <span className="calendar-marker" aria-hidden="true">{record ? <i /> : null}</span>
              </button>
            })}
          </div>
          <div className="selected-record">
            <h4>{dateLabel(selectedDate)}{selectedDate === today ? ' · 오늘' : ''}</h4>
            {selected ? <><p><strong>{formatHistoryDuration(selected.seconds)}</strong><span>{selectedAmount === null ? '금액 미기록' : won(selectedAmount)}</span></p><p className="record-basis">{selected.settings ? selectedDate === today ? '현재 근무 조건 기준' : '당일 저장한 근무 조건 기준' : '근무 조건이 남아 있지 않아 시간만 복원한 기록입니다.'}</p></> : <p className="empty-record">이 날짜에 저장된 기록이 없습니다.</p>}
          </div>
        </div>

        <div className="record-report">
          <div className="report-toolbar">
            <div className="mode-switch" role="group" aria-label="리포트 기간">
              <button type="button" aria-pressed={period === 'week'} onClick={() => { setPeriod('week'); setMessage('') }}>이번 주</button>
              <button type="button" aria-pressed={period === 'month'} onClick={() => { setPeriod('month'); setMessage('') }}>이번 달</button>
            </div>
            <div className="report-actions">
              <button type="button" className="icon-command" title={`${periodLabel} 리포트 이미지 저장`} aria-label={`${periodLabel} 리포트 이미지 저장`} disabled={busy || !report.summary.days} onClick={() => void exportReport(false)}><Download size={18} aria-hidden="true" /></button>
              <button type="button" className="icon-command" title={`${periodLabel} 리포트 공유`} aria-label={`${periodLabel} 리포트 공유`} disabled={busy || !report.summary.days} onClick={() => void exportReport(true)}><Share2 size={18} aria-hidden="true" /></button>
            </div>
          </div>
          <p className="report-range">{report.start.replaceAll('-', '.')} ~ {today.replaceAll('-', '.')}</p>
          <dl className="report-metrics">
            <div><dt>누적 시간</dt><dd>{formatHistoryDuration(report.summary.seconds).split(' ').map(part => <span className="metric-unit" key={part}>{part}</span>)}</dd></div>
            <div><dt>누적 환산액</dt><dd>{won(report.summary.amount)}</dd></div>
            <div><dt>기록한 날</dt><dd>{report.summary.days}일</dd></div>
          </dl>
          {report.summary.unknownAmountDays ? <p className="record-basis">근무 조건이 없는 {report.summary.unknownAmountDays}일은 금액 합계에서 제외했습니다.</p> : null}
          <p className="report-comparison">{report.comparisonSeconds === null ? '비교할 이전 기간의 기록이 없습니다.' : `${comparisonLabel} 대비 ${report.comparisonSeconds >= 0 ? '+' : '-'}${formatHistoryDuration(Math.abs(report.comparisonSeconds))}`}</p>
          <div className="report-chart-scroll" tabIndex={0} role="region" aria-label={`${periodLabel} 날짜별 시간 그래프`}>
            <div className={`report-chart ${period === 'month' ? 'monthly-chart' : ''}`} style={{ gridTemplateColumns: `repeat(${report.dates.length}, minmax(0, 1fr))` }}>
              {report.dates.map((day, index) => <div role="img" aria-label={`${dateLabel(day.date)} · ${day.future ? '아직 오지 않은 날짜' : formatHistoryDuration(day.seconds)}`} className={`chart-day${day.date === today ? ' chart-today' : ''}${day.future ? ' chart-future' : ''}`} key={day.date} title={`${dateLabel(day.date)} · ${day.future ? '아직 오지 않은 날짜' : formatHistoryDuration(day.seconds)}`}>
                <div className="chart-track"><span style={{ height: `${day.seconds / maxSeconds * 100}%`, minHeight: day.seconds ? 3 : 0 }} /></div>
                <span className="chart-label">{period === 'week' ? weekdays[index] : Number(day.date.slice(8))}</span>
              </div>)}
            </div>
          </div>
          <p className="record-basis">{report.summary.days ? '일별 환산액을 합산한 기록입니다. 실제 지급액이 아닙니다.' : '기록이 쌓이면 이곳에 주간·월간 리포트가 표시됩니다.'}</p>
          <p className="record-basis">다른 기기와 자동 동기화되지 않으며, 브라우저 사이트 데이터를 지우면 사라질 수 있습니다.</p>
          <p className="feature-status" role="status" aria-live="polite">{busy ? '리포트를 만드는 중입니다.' : message}</p>
        </div>
      </div>
    </section>
  )
}

export default HistoryDashboard
