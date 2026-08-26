import { parseDate, weekday } from './time'
import { translateText } from './translate'
import type { Recording } from './types'
import { thumbnailUrl } from './youtube'

export type MatchTrack = { id: string; title: string; artist: string; playlistId: string; playlistName: string }

export function formatRecordingDate(date: string): string {
  const parsed = parseDate(date)
  return `${parsed.getFullYear()}. ${parsed.getMonth() + 1}. ${parsed.getDate()} (${weekday(date)})`
}

const CREDIT_PART_ORDER = ['드럼', '베이스', '기타', '키보드', '보컬']
export function creditRank(part: string): number {
  const index = CREDIT_PART_ORDER.indexOf(part)
  return index === -1 ? CREDIT_PART_ORDER.length : index
}

/** 제목 속 YYYYMMDD 또는 YYMMDD를 YYYY-MM-DD로 변환한다. */
export function dateFromRecordingTitle(title: string): string | null {
  const match = title.match(/\d{8}|\d{6}/)
  if (!match) return null
  const value = match[0]
  const year = value.length === 8 ? +value.slice(0, 4) : 2000 + +value.slice(0, 2)
  const month = +value.slice(value.length - 4, value.length - 2)
  const day = +value.slice(value.length - 2)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')

export function matchMusicFromTitle(title: string, tracks: MatchTrack[]): MatchTrack | null {
  const normalized = normalizeTitle(title.replace(/\d{8}|\d{6}/, ''))
  if (normalized.length < 2) return null
  let best: MatchTrack | null = null
  let bestLength = 0
  for (const track of tracks) {
    const trackTitle = normalizeTitle(track.title)
    if (trackTitle.length >= 2 && normalized.includes(trackTitle) && trackTitle.length > bestLength) {
      best = track
      bestLength = trackTitle.length
    }
  }
  return best
}

export async function inferMusicFromTitle(title: string, tracks: MatchTrack[]): Promise<MatchTrack | null> {
  const direct = matchMusicFromTitle(title, tracks)
  if (direct) return direct
  const base = title.replace(/\d{8}|\d{6}/, '').trim()
  if (base.length < 2 || tracks.length === 0) return null
  const translated = await Promise.all([translateText(base, 'en'), translateText(base, 'ko')])
  for (const value of translated) {
    if (!value) continue
    const match = matchMusicFromTitle(value, tracks)
    if (match) return match
  }
  return null
}

export function parseDriveId(url: string): string | null {
  const match = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
  return match ? match[1] : null
}
export const driveThumbnail = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w640`
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`

export function recordingThumbnail(recording: Recording): string | null {
  if (recording.thumbnail) return recording.thumbnail
  if (recording.videoId) return thumbnailUrl(recording.videoId)
  const driveId = parseDriveId(recording.url)
  return driveId ? driveThumbnail(driveId) : null
}
