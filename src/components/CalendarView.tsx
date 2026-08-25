import { Fragment, useMemo, type ReactNode } from 'react'
import { TYPE_META, type BandEvent, type EventType, type Member, type Place } from '../types'
import { parseDate, todayStr, weekday } from '../time'
import { resolvePlace } from '../place'
import EventCard from './EventCard'
import type { ToastState } from './Toast'

const WD = ['일', '월', '화', '수', '목', '금', '토']

type Cell = { day: number; date: string } | null

/**
 * 월 달력 뷰. 넘겨받는 events 는 이미 유형 필터가 적용된 목록.
 * 월 이동(cursor)은 상단 바에서 제어하므로 props 로 받고, 날짜 선택만 내부에서 처리.
 * 날짜 셀에는 그 날 일정을 유형 색 칩으로 보여주고, 날짜를 누르면 아래에 그 날 일정(EventCard)을 펼친다.
 */
export default function CalendarView({
  events,
  placesMap,
  members,
  toast,
  onEdit,
  cursor,
  selected,
  onSelect,
  resolveType = (t) => ({ color: TYPE_META[t as EventType]?.color ?? 'var(--ink-faint)' }),
  renderEvent,
  emptyLabel = '이 날은 일정이 없어요.',
}: {
  events: BandEvent[]
  placesMap: Map<string, Place>
  members: Member[]
  toast: ToastState
  onEdit: (ev: BandEvent) => void
  cursor: { y: number; m: number } // m: 0-based
  selected: string
  onSelect: (date: string) => void
  resolveType?: (type: string) => { color: string } // 유형 색상 주입(개인 채널 커스텀 유형 지원)
  renderEvent?: (ev: BandEvent) => ReactNode // 날짜 상세 카드 커스텀(기본=밴드 EventCard)
  emptyLabel?: string
}) {
  const today = todayStr()

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

  const dayEvents = byDate.get(selected) ?? []
  const sd = parseDate(selected)

  return (
    <div className="cal">
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
          const cls =
            'cal-cell' +
            (evs?.length ? ' has' : '') +
            (c.date === today ? ' today' : '') +
            (c.date === selected ? ' sel' : '') +
            (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')
          return (
            <button key={c.date} className={cls} onClick={() => onSelect(c.date)}>
              <span className="cal-day">{c.day}</span>
              {evs && evs.length > 0 && (
                <span className="cal-evs">
                  {evs.slice(0, 3).map((e) => (
                    <span key={e.id} className="cal-ev" style={{ ['--k' as string]: resolveType(e.type).color }}>
                      {e.title}
                    </span>
                  ))}
                  {evs.length > 3 && <span className="cal-more">+{evs.length - 3}</span>}
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
        <div className="cal-noday">{emptyLabel}</div>
      ) : (
        <div className="list">
          {dayEvents.map((ev) =>
            renderEvent ? (
              <Fragment key={ev.id}>{renderEvent(ev)}</Fragment>
            ) : (
              <EventCard
                key={ev.id}
                ev={ev}
                place={resolvePlace(ev, placesMap)}
                members={members}
                onEdit={() => onEdit(ev)}
                toast={toast}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}
