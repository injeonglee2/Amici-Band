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

/**
 * 캘린더 내보내기는 어디서나 가능하다:
 * - 안드로이드 앱(TWA 설치): 기기 캘린더 인텐트
 * - 그 외(iOS·데스크톱·안드로이드 웹): .ics 다운로드 → 애플/구글/아웃룩 캘린더에서 열림
 */
export async function calendarExportSupported(): Promise<boolean> {
  return true
}

/** 설치된 TWA(안드로이드 앱)인지 — 그럴 때만 네이티브 캘린더 인텐트를 쓴다. */
async function twaInstalled(): Promise<boolean> {
  if (!isAndroid()) return false
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

export async function addToDeviceCalendar(ev: BandEvent, place: ResolvedPlace | null): Promise<void> {
  // 안드로이드 앱(TWA)일 때만 네이티브 캘린더 인텐트, 그 외엔 .ics 다운로드(애플/구글/아웃룩/타임트리 등)
  if (await twaInstalled()) {
    window.location.href = androidCalendarIntent(ev, place)
    return
  }
  downloadIcs(ev, place)
}
