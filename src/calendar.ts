import { TYPE_META, type BandEvent } from './types'
import type { ResolvedPlace } from './place'

function eventTitle(ev: BandEvent): string {
  return `[${TYPE_META[ev.type].label}] ${ev.title}`
}

function eventLocation(place: ResolvedPlace | null): string {
  return place ? place.address || place.name : ''
}

/** Amici 일정은 한국 시각이므로 기기 시간대와 무관하게 +09:00으로 계산한다. */
function epochMillis(date: string, time: string): number {
  return new Date(`${date}T${time}:00+09:00`).getTime()
}

/**
 * 캘린더 내보내기는 어디서나 가능하다 — 표준 .ics 다운로드.
 * 애플/구글/아웃룩/타임트리/네이버 등 .ics 를 읽는 앱이면 모두 열린다.
 */
export async function calendarExportSupported(): Promise<boolean> {
  return true
}

/** KST 일정을 시간대에 상관없이 정확히 표현하려고 UTC(Z)로 변환해 넣는다. */
function icsUtc(date: string, time: string): string {
  const dt = new Date(epochMillis(date, time))
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}` +
    `T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`
  )
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * 일정을 표준 .ics 파일로 내려받는다.
 * (예전엔 안드로이드 TWA 전용 커스텀 인텐트를 썼는데, 앱에 해당 액티비티가 없어
 *  일부 갤럭시에서 로딩 후 홈으로 튕기는 문제가 있어 .ics 로 통일함)
 */
export function addToDeviceCalendar(ev: BandEvent, place: ResolvedPlace | null): void {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amici Band//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@amici-band`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsUtc(ev.date, ev.rehStart)}`,
    `DTEND:${icsUtc(ev.date, ev.rehEnd)}`,
    `SUMMARY:${icsEscape(eventTitle(ev))}`,
  ]
  const location = eventLocation(place)
  if (location) lines.push(`LOCATION:${icsEscape(location)}`)
  if (ev.note) lines.push(`DESCRIPTION:${icsEscape(ev.note)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${(ev.title || 'event').replace(/[\\/:*?"<>|]/g, '_')}.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
