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

function buildIcs(ev: BandEvent, place: ResolvedPlace | null): string {
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
  return lines.join('\r\n')
}

function icsFilename(ev: BandEvent): string {
  return `${(ev.title || 'event').replace(/[\\/:*?"<>|]/g, '_')}.ics`
}

function downloadIcs(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isAndroid = (): boolean => /Android/i.test(navigator.userAgent)

/**
 * 일정을 캘린더로 내보낸다.
 * - 안드로이드(갤럭시 등): Web Share 로 .ics 파일을 공유 → 캘린더 앱을 바로 선택 (파일 다운로드 안 함)
 * - iOS·데스크톱: .ics 열기 (iOS 는 '캘린더에 추가' 미리보기로 뜸)
 */
export async function addToDeviceCalendar(ev: BandEvent, place: ResolvedPlace | null): Promise<void> {
  const ics = buildIcs(ev, place)
  const filename = icsFilename(ev)

  if (isAndroid() && typeof navigator.canShare === 'function') {
    const file = new File([ics], filename, { type: 'text/calendar' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: eventTitle(ev) })
        return
      } catch (e) {
        // 사용자가 공유창을 닫으면 AbortError — 다운로드로 떨어뜨리지 않고 종료
        if ((e as { name?: string })?.name === 'AbortError') return
        // 그 외 오류면 아래 다운로드로 폴백
      }
    }
  }

  downloadIcs(ics, filename)
}
