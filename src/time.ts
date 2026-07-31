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

export function longWhen(ev: { date: string; rehStart: string; rehEnd: string }): string {
  const d = parseDate(ev.date)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday(ev.date)}) · ${ev.rehStart}–${ev.rehEnd}`
}
