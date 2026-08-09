import { TYPE_META, type BandEvent } from './types'
import type { ResolvedPlace } from './place'

const ANDROID_PACKAGE = 'app.web.amicicalender.twa'

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

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

/** iPhone/iPad 캘린더 내보내기는 아직 지원하지 않으므로 UI 노출 여부에 사용한다. */
type RelatedApp = { id?: string; platform?: string }
type NavigatorWithRelatedApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>
}

export async function calendarExportSupported(): Promise<boolean> {
  const isAppleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isAppleMobile) return false
  if (!isAndroid()) return true

  const getInstalledRelatedApps = (navigator as NavigatorWithRelatedApps).getInstalledRelatedApps
  if (!getInstalledRelatedApps) return false
  try {
    const apps = await getInstalledRelatedApps.call(navigator)
    return apps.some((app) => app.platform === 'play' && app.id === ANDROID_PACKAGE)
  } catch {
    return false
  }
}

/** 설치된 TWA의 CalendarInsertActivity를 여는 Android Intent URL. */
function androidCalendarIntent(ev: BandEvent, place: ResolvedPlace | null): string {
  const params = new URLSearchParams({
    title: eventTitle(ev),
    begin: String(epochMillis(ev.date, ev.rehStart)),
    end: String(epochMillis(ev.date, ev.rehEnd)),
    location: eventLocation(place),
    description: ev.note || '',
  })
  const fallback = encodeURIComponent(window.location.href)
  return `intent://calendar/add?${params.toString()}#Intent;scheme=amicicalender;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
}

function icsStamp(date: string, time: string): string {
  return date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00'
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Android 앱이 아닌 환경에서 사용하는 범용 fallback. */
function downloadIcs(ev: BandEvent, place: ResolvedPlace | null): void {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amici Band//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@amici-band`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsStamp(ev.date, ev.rehStart)}`,
    `DTEND:${icsStamp(ev.date, ev.rehEnd)}`,
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

export function addToDeviceCalendar(ev: BandEvent, place: ResolvedPlace | null): void {
  if (isAndroid()) {
    window.location.href = androidCalendarIntent(ev, place)
    return
  }
  downloadIcs(ev, place)
}
