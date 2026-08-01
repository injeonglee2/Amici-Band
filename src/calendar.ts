// 일정을 구글 캘린더 링크 / ICS 파일로 내보내기 (Android·iPhone 공용)
import { TYPE_META, type BandEvent } from './types'
import type { ResolvedPlace } from './place'

const TZ = 'Asia/Seoul'

/** 'YYYY-MM-DD' + 'HH:MM' → 'YYYYMMDDTHHMMSS' (플로팅 로컬 시각) */
function stamp(date: string, time: string): string {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00'
}

function title(ev: BandEvent): string {
  return `[${TYPE_META[ev.type].label}] ${ev.title}`
}

function locationOf(place: ResolvedPlace | null): string {
  return place ? place.address || place.name : ''
}

/** 구글 캘린더 '일정 추가' 템플릿 URL — 열면 제목·시간·장소·메모가 채워진다. */
export function googleCalendarUrl(ev: BandEvent, place: ResolvedPlace | null): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(ev),
    dates: `${stamp(ev.date, ev.rehStart)}/${stamp(ev.date, ev.rehEnd)}`,
    ctz: TZ,
  })
  if (ev.note) params.set('details', ev.note)
  const loc = locationOf(place)
  if (loc) params.set('location', loc)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 표준 .ics 텍스트 — 애플 캘린더 등 기기 기본 캘린더에 추가할 수 있다. */
export function icsContent(ev: BandEvent, place: ResolvedPlace | null): string {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amici Band//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@amici-band`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${stamp(ev.date, ev.rehStart)}`,
    `DTEND:${stamp(ev.date, ev.rehEnd)}`,
    `SUMMARY:${icsEscape(title(ev))}`,
  ]
  const loc = locationOf(place)
  if (loc) lines.push(`LOCATION:${icsEscape(loc)}`)
  if (ev.note) lines.push(`DESCRIPTION:${icsEscape(ev.note)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/** .ics 파일 다운로드 트리거 */
export function downloadIcs(ev: BandEvent, place: ResolvedPlace | null): void {
  const blob = new Blob([icsContent(ev, place)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(ev.title || 'event').replace(/[\\/:*?"<>|]/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
