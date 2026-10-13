/** 시간 유틸 — 합주 시간 창 내에서 30분 단위 슬롯 생성/검증 */

const WD = ['일', '월', '화', '수', '목', '금', '토']

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** start~end 사이 30분 간격 슬롯 (양끝 포함) */
export function slots(start: string, end: string, step = 30): string[] {
  const s = toMin(start)
  const e = toMin(end)
  if (e <= s) return [start]
  const out: string[] = []
  for (let t = s; t <= e; t += step) out.push(toHHMM(t))
  return out
}

/** 늦참 도착 옵션: 시작 직후 ~ 종료 (시작 정각은 '참석'이므로 제외) */
export function lateOptions(start: string, end: string): string[] {
  return slots(start, end).slice(1)
}

/** 조퇴 옵션: 시작 ~ 종료 직전 (종료 정각은 '참석'이므로 제외) */
export function leaveOptions(start: string, end: string): string[] {
  return slots(start, end).slice(0, -1)
}

/** 값이 [start, end] 창 안에 있는지 */
export function inWindow(t: string, start: string, end: string): boolean {
  const v = toMin(t)
  return v >= toMin(start) && v <= toMin(end)
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function dayDiff(dateStr: string): number {
  const a = parseDate(dateStr)
  a.setHours(0, 0, 0, 0)
  const b = new Date()
  b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export function ddayLabel(n: number): string {
  if (n === 0) return '오늘'
  if (n < 0) return `D+${-n}`
  return `D-${n}`
}

export function weekday(dateStr: string): string {
  return WD[parseDate(dateStr).getDay()]
}

/* ---------- 기간 일정(시작일 ~ 종료일) ----------
 * 일정은 시작일(date)과 선택적 종료일(endDate)을 가진다. 종료일이 없거나 시작일과 같으면 하루 일정.
 * 여러 날 일정의 시간은 "시작일 rehStart ~ 종료일 rehEnd"로 읽고, 캘린더에는 기간의 모든 날에 표시하며,
 * 목록에서는 종료일이 지나기 전까지 '다가오는/진행 중'으로 남긴다. */
export interface DateSpan { date: string; endDate?: string }

/** 일정의 마지막 날. 종료일이 없거나 시작일보다 앞이면 시작일(하루 일정). */
export function eventEndDate(ev: DateSpan): string {
  return ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date
}

export function isMultiDay(ev: DateSpan): boolean {
  return eventEndDate(ev) !== ev.date
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 시작일부터 종료일까지 날짜 목록(캘린더에 매일 표시). 잘못 저장된 긴 기간은 62일에서 자른다. */
export function eventDates(ev: DateSpan): string[] {
  const out = [ev.date]
  const end = eventEndDate(ev)
  const cur = parseDate(ev.date)
  while (out.length < 62) {
    cur.setDate(cur.getDate() + 1)
    const next = toDateStr(cur)
    if (next > end) break
    out.push(next)
  }
  return out
}

/** 며칠짜리 일정인지 (하루면 1) */
export function dayCount(ev: DateSpan): number {
  return Math.round((parseDate(eventEndDate(ev)).getTime() - parseDate(ev.date).getTime()) / 86400000) + 1
}

/** 마지막 날이 지났으면 true — 여러 날 일정은 종료일까지 '다가오는/진행 중'으로 둔다. */
export function isPastEvent(ev: DateSpan): boolean {
  return dayDiff(eventEndDate(ev)) < 0
}

/** "10월 20일 (화)". sameMonthAs 와 같은 달이면 "21일 (수)"로 줄인다. */
export function shortDate(dateStr: string, sameMonthAs?: string): string {
  const d = parseDate(dateStr)
  const sameMonth = !!sameMonthAs && sameMonthAs.slice(0, 7) === dateStr.slice(0, 7)
  return `${sameMonth ? '' : `${d.getMonth() + 1}월 `}${d.getDate()}일 (${weekday(dateStr)})`
}

/** 날짜(기간) 라벨: "10월 20일 (화)" / "10월 20일 (화) – 21일 (수)" */
export function dateRangeLabel(ev: DateSpan): string {
  return isMultiDay(ev) ? `${shortDate(ev.date)} – ${shortDate(eventEndDate(ev), ev.date)}` : shortDate(ev.date)
}

/** 날짜+시간 한 줄. 하루: "10월 20일 (화) · 09:00–18:00", 여러 날: "10월 20일 (화) 09:00 – 21일 (수) 18:00" */
export function longWhen(ev: DateSpan & { rehStart: string; rehEnd: string; allDay?: boolean }): string {
  if (ev.allDay) return dateRangeLabel(ev)
  if (!isMultiDay(ev)) return `${shortDate(ev.date)} · ${ev.rehStart}–${ev.rehEnd}`
  return `${shortDate(ev.date)} ${ev.rehStart} – ${shortDate(eventEndDate(ev), ev.date)} ${ev.rehEnd}`
}

/** 히어로용 일시 줄. 하루 일정은 한 줄, 여러 날 일정은 시작 일시 / 종료 일시 두 줄("– "로 시작). */
export function whenLines(ev: DateSpan & { rehStart: string; rehEnd: string; allDay?: boolean }): string[] {
  if (!isMultiDay(ev)) return [longWhen(ev)]
  const end = eventEndDate(ev)
  return ev.allDay
    ? [shortDate(ev.date), `– ${shortDate(end)}`]
    : [`${shortDate(ev.date)} ${ev.rehStart}`, `– ${shortDate(end)} ${ev.rehEnd}`]
}

/** D-day 라벨. 여러 날 일정이 이미 시작됐고 아직 안 끝났으면 '진행 중'. */
export function ddayLabelFor(ev: DateSpan): string {
  const toStart = dayDiff(ev.date)
  if (isMultiDay(ev) && toStart < 0 && !isPastEvent(ev)) return '진행 중'
  return ddayLabel(toStart)
}
