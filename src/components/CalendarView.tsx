import { useMemo, useState } from 'react'
import { TYPE_META, type BandEvent, type Member, type Place } from '../types'
import { parseDate, todayStr, weekday } from '../time'
import { resolvePlace } from '../place'
import EventCard from './EventCard'
import type { ToastState } from './Toast'

const WD = ['일', '월', '화', '수', '목', '금', '토']

type Cell = { day: number; date: string } | null

/**
 * 월 달력 뷰. 넘겨받는 events 는 이미 유형 필터가 적용된 목록.
 * 날짜 셀에는 그 날 있는 유형별 색 점을 찍고, 날짜를 누르면 아래에 그 날 일정(EventCard)을 펼친다.
 */
export default function CalendarView({
  events,
  placesMap,
  members,
  toast,
  onEdit,
}: {
  events: BandEvent[]
  placesMap: Map<string, Place>
  members: Member[]
  toast: ToastState
  onEdit: (ev: BandEvent) => void
}) {
  const today = todayStr()
  const td = parseDate(today)
  const [cursor, setCursor] = useState({ y: td.getFullYear(), m: td.getMonth() }) // m: 0-based
  const [selected, setSelected] = useState(today)

  // 날짜별 일정 (각 날은 시작시간 순 정렬)
  const byDate = useMemo(() => {
    const map = new Map<string, BandEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date)
      if (arr) arr.push(e)
      else map.set(e.date, [e])
    }
    for (const arr of map.values()) arr.sort((a, b) => a.rehStart.localeCompare(b.rehStart))
    return map
  }, [events])

  const cells = useMemo<Cell[]>(() => {
    const startOffset = new Date(cursor.y, cursor.m, 1).getDay() // 0=일
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const arr: Cell[] = []
    for (let i = 0; i < startOffset; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      arr.push({ day: d, date })
    }
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [cursor])

  function shift(delta: number) {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  function goToday() {
    setCursor({ y: td.getFullYear(), m: td.getMonth() })
    setSelected(today)
  }

  const dayEvents = byDate.get(selected) ?? []
  const sd = parseDate(selected)

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shift(-1)} aria-label="이전 달">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button className="cal-title" onClick={goToday}>
          {cursor.y}년 {cursor.m + 1}월
        </button>
        <button className="cal-nav" onClick={() => shift(1)} aria-label="다음 달">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="cal-grid cal-wdrow">
        {WD.map((w, i) => (
          <div key={w} className={'cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} className="cal-cell empty" />
          const dow = i % 7
          const evs = byDate.get(c.date)
          const types = evs ? [...new Set(evs.map((e) => e.type))] : []
          const cls =
            'cal-cell' +
            (c.date === today ? ' today' : '') +
            (c.date === selected ? ' sel' : '') +
            (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')
          return (
            <button key={c.date} className={cls} onClick={() => setSelected(c.date)}>
              <span className="cal-day">{c.day}</span>
              {types.length > 0 && (
                <span className="cal-dots">
                  {types.map((t) => (
                    <span key={t} className="cal-dot" style={{ background: TYPE_META[t].color }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="cal-daylabel">
        {sd.getMonth() + 1}월 {sd.getDate()}일 ({weekday(selected)})
      </div>
      {dayEvents.length === 0 ? (
        <div className="cal-noday">이 날은 일정이 없어요.</div>
      ) : (
        <div className="list">
          {dayEvents.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              place={resolvePlace(ev, placesMap)}
              members={members}
              onEdit={() => onEdit(ev)}
              toast={toast}
            />
          ))}
        </div>
      )}
    </div>
  )
}
