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

/** 이벤트 → .ics 문자열 */
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
const icsBase = (ev: BandEvent): string => (ev.title || 'event').replace(/[\\/:*?"<>|]/g, '_')

function saveIcsFile(ics: string, filename: string): void {
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

export const isAndroidDevice = (): boolean => isAndroid()
const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent)

/**
 * 캘린더 내보내기 방식 (설정에서 선택, 기기별 저장)
 * - 'auto'  : 안드로이드 앱이면 네이티브 인텐트(삼성·구글, 바로 추가 폼). 그 외엔 .ics
 * - 'ics'   : 항상 .ics 파일 (TimeTree 등 모든 캘린더 앱에서 열림)
 * 기본값: iOS=파일(.ics, 매끄러운 미리보기), 안드로이드=앱 바로 추가.
 */
export type CalendarExportMode = 'auto' | 'ics'
const CAL_MODE_KEY = 'amici.calendarExportMode'
export function getCalendarExportMode(): CalendarExportMode {
  try {
    const v = localStorage.getItem(CAL_MODE_KEY)
    if (v === 'ics' || v === 'auto') return v
  } catch {
    /* localStorage 불가 */
  }
  return isIOS() ? 'ics' : 'auto'
}
export function setCalendarExportMode(mode: CalendarExportMode): void {
  try {
    localStorage.setItem(CAL_MODE_KEY, mode)
  } catch {
    /* localStorage 불가 환경이면 무시 */
  }
}

/**
 * 안드로이드 .ics 내보내기 — TimeTree 등 모든 캘린더 앱 지원.
 * 1) Web Share(파일): 공유 시트에서 캘린더 앱(TimeTree 포함) 선택 — 다운로드 단계 없음.
 * 2) 안 되면 매번 다른 파일명으로 다운로드('다시 다운로드?' 확인창 방지) → 알림에서 열어 앱 선택.
 */
async function shareOrDownloadIcs(ev: BandEvent, place: ResolvedPlace | null): Promise<void> {
  const ics = buildIcs(ev, place)
  const file = new File([ics], `${icsBase(ev)}.ics`, { type: 'text/calendar' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: eventTitle(ev) })
      return
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
      // 그 외 오류면 아래 다운로드로 폴백
    }
  }
  saveIcsFile(ics, `${icsBase(ev)}-${Date.now().toString(36)}.ics`)
}

export async function addToDeviceCalendar(ev: BandEvent, place: ResolvedPlace | null): Promise<void> {
  // 'auto' + 안드로이드 앱(TWA) → 네이티브 인텐트(앱 바로 추가 폼, 삼성·구글)
  if (getCalendarExportMode() === 'auto' && (await twaInstalled())) {
    window.location.href = androidCalendarIntent(ev, place)
    return
  }
  // 안드로이드 .ics → 공유 시트/고유 파일명 다운로드 (TimeTree 등 모든 앱)
  if (isAndroid()) {
    await shareOrDownloadIcs(ev, place)
    return
  }
  // iOS·데스크톱 → .ics 열기 (iOS 는 '캘린더에 추가' 미리보기라 매끄러움)
  saveIcsFile(buildIcs(ev, place), `${icsBase(ev)}.ics`)
}
