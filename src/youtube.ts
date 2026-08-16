/**
 * 유튜브 링크 유틸 — 영상 ID 추출 + 제목/가수 자동 조회.
 *
 * oEmbed(공개 엔드포인트, API 키 불필요)로 제목·채널명을 가져온다.
 * youtube.com/oembed 가 CORS 로 막히는 경우를 대비해 noembed.com 으로 폴백한다.
 */

/** 유튜브(및 유튜브 뮤직) URL 에서 재생목록 ID(list=) 를 추출. 실패 시 null */
export function parsePlaylistId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const list = url.searchParams.get('list')
    if (list && /^[\w-]+$/.test(list)) return list
  } catch {
    /* URL 아님 */
  }
  // 순수 재생목록 ID 를 붙여넣은 경우 (PL... 등)
  if (/^[A-Za-z0-9_-]{12,}$/.test(raw)) return raw
  return null
}

/** 다양한 형태의 유튜브 URL 에서 영상 ID(11자)를 추출. 실패 시 null */
export function parseVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // 순수 ID 를 그대로 붙여넣은 경우
  if (/^[\w-]{11}$/.test(raw)) return raw

  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && /^[\w-]{11}$/.test(id) ? id : null
  }

  // youtube.com / music.youtube.com / m.youtube.com
  if (host.endsWith('youtube.com')) {
    // watch?v=<id>
    const v = url.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return v
    // /shorts/<id>, /embed/<id>, /live/<id>
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
      const id = parts[1]
      if (/^[\w-]{11}$/.test(id)) return id
    }
  }

  return null
}

export function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export interface YouTubeMeta {
  title: string
  artist: string
  thumbnail: string
}

// YouTube Data API 는 제목을 HTML 엔티티로 인코딩해 줌(&#39; &amp; &quot; 등) → 사람이 읽는 문자로 복원
function decodeEntities(s: string): string {
  if (!s || typeof document === 'undefined') return s
  const el = document.createElement('textarea')
  el.innerHTML = s
  return el.value
}

// 제목 속 흔한 홍보성 꼬리표 제거: (Official Video), [MV], (Lyrics) 등.
// 위치와 무관하게(끝이 아니어도) 지우되, 키워드가 들어간 괄호만 대상으로 한다.
const TAG_PATTERN =
  /\s*[([【][^)\]】]*(official|m\/?v|lyrics?|audio|video|가사|뮤직비디오|visualizer|공식|feat\.?|ft\.?)[^)\]】]*[)\]】]/gi

function stripTags(s: string): string {
  return s.replace(TAG_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** oEmbed 응답의 제목·채널명을 "가수 / 곡 제목" 으로 최대한 분리 */
function splitTitle(rawTitle: string, author: string): { title: string; artist: string } {
  const title = decodeEntities(rawTitle).trim()

  // 채널명 접미사 " - Topic" 은 유튜브 뮤직 자동 생성 채널 표기 → 가수명으로 사용
  const artistFromAuthor = decodeEntities(author).replace(/\s*-\s*Topic$/i, '').trim()

  // "가수 - 곡" 형태면 분리 후 곡 제목의 꼬리표만 정리.
  // 구분자는 앞뒤 공백이 있는 하이픈만 인정 → "a-ha" 처럼 이름 속 하이픈은 쪼개지 않음
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const [, left, right] = dash
    return { artist: left.trim(), title: stripTags(right) }
  }

  // 분리 실패 시: 제목 꼬리표만 정리하고 가수는 채널명에서 유추
  return { title: stripTags(title), artist: artistFromAuthor }
}

/** 유튜브 링크에서 제목·가수·썸네일을 조회. 실패해도 videoId 로 기본값을 반환 */
export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const thumbnail = thumbnailUrl(videoId)
  const target = watchUrl(videoId)

  const sources = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(target)}`,
  ]

  for (const src of sources) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      const data = (await res.json()) as { title?: string; author_name?: string }
      if (!data.title) continue
      const { title, artist } = splitTitle(data.title, data.author_name ?? '')
      return { title, artist, thumbnail }
    } catch {
      // 다음 소스로 폴백
    }
  }

  // 모두 실패: 최소한 썸네일만 반환 (제목·가수는 사용자가 직접 입력)
  return { title: '', artist: '', thumbnail }
}

/* ---------------- IFrame Player API (앱 내 재생·연속재생용) ---------------- */
let apiPromise: Promise<void> | null = null

/** 유튜브 IFrame Player API 스크립트를 한 번만 로드. 준비되면 resolve */
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.setAttribute('data-yt-iframe-api', '')
      document.head.appendChild(tag)
    }
  })
  return apiPromise
}

/* ---------------- 재생목록(플레이리스트) 곡 일괄 추출 (YouTube Data API v3) ---------------- */
// 전용 키(VITE_YOUTUBE_API_KEY)가 있으면 우선, 없으면 같은 구글 프로젝트의 Firebase 키로 폴백
const YT_API_KEY =
  (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ||
  (import.meta.env.VITE_FB_API_KEY as string | undefined) ||
  ''

export function youtubeApiAvailable(): boolean {
  return !!YT_API_KEY
}

export interface ImportedSong {
  videoId: string
  title: string
  artist: string
  thumbnail: string
  url: string
  publishedAt: string // 재생목록 추가 일자 (YYYY-MM-DD), 없으면 빈 문자열
  description: string // 영상 설명(보컬·세션 크레딧 해석용), 없으면 빈 문자열
}

export interface YouTubeSearchResult {
  videoId: string
  title: string
  artist: string
  thumbnail: string
}

/**
 * 유튜브에서 키워드로 영상 검색. (YouTube Data API search.list — 호출당 할당량 100단위)
 * 실패 시 PlaylistImportError(code) 를 던진다.
 */
export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  if (!YT_API_KEY) throw new PlaylistImportError('NO_KEY')
  const u = new URL('https://www.googleapis.com/youtube/v3/search')
  u.searchParams.set('part', 'snippet')
  u.searchParams.set('type', 'video')
  u.searchParams.set('videoCategoryId', '10') // 음악 카테고리로 한정 (결과를 음악 위주로)
  u.searchParams.set('maxResults', '12')
  u.searchParams.set('q', q)
  u.searchParams.set('key', YT_API_KEY)

  const res = await fetch(u.toString())
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { errors?: { reason?: string }[] } }
      | null
    const reason = body?.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded') throw new PlaylistImportError('QUOTA')
    if (res.status === 403) throw new PlaylistImportError('FORBIDDEN')
    throw new PlaylistImportError(reason || `HTTP_${res.status}`)
  }
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[]
  }
  const out: YouTubeSearchResult[] = []
  for (const it of data.items ?? []) {
    const vid = it.id?.videoId
    if (!vid) continue
    const { title, artist } = splitTitle(it.snippet?.title ?? '', it.snippet?.channelTitle ?? '')
    out.push({ videoId: vid, title, artist, thumbnail: thumbnailUrl(vid) })
  }
  return out
}

export class PlaylistImportError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'PlaylistImportError'
  }
}

/**
 * 공개/일부공개 재생목록의 곡을 모두 추출. (비공개 재생목록은 API 키로 읽을 수 없음)
 * 삭제·비공개 항목은 건너뛴다. 최대 1000곡(안전장치).
 */
/** 단일 영상의 설명글(크레딧 해석용 백필). 키 없음·오류 시 '' */
export async function fetchVideoDescription(videoId: string): Promise<string> {
  if (!YT_API_KEY || !videoId) return ''
  try {
    const u = new URL('https://www.googleapis.com/youtube/v3/videos')
    u.searchParams.set('part', 'snippet')
    u.searchParams.set('id', videoId)
    u.searchParams.set('key', YT_API_KEY)
    const res = await fetch(u)
    if (!res.ok) return ''
    const data = (await res.json()) as { items?: { snippet?: { description?: string } }[] }
    return data.items?.[0]?.snippet?.description ?? ''
  } catch {
    return ''
  }
}

export async function fetchPlaylistItems(playlistId: string): Promise<ImportedSong[]> {
  if (!YT_API_KEY) throw new PlaylistImportError('NO_KEY')
  const out: ImportedSong[] = []
  let pageToken = ''
  for (let page = 0; page < 20; page++) {
    const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    u.searchParams.set('part', 'snippet')
    u.searchParams.set('maxResults', '50')
    u.searchParams.set('playlistId', playlistId)
    u.searchParams.set('key', YT_API_KEY)
    if (pageToken) u.searchParams.set('pageToken', pageToken)

    const res = await fetch(u.toString())
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { errors?: { reason?: string }[] } }
        | null
      const reason = body?.error?.errors?.[0]?.reason
      if (res.status === 404 || reason === 'playlistNotFound') throw new PlaylistImportError('NOT_FOUND')
      if (reason === 'quotaExceeded') throw new PlaylistImportError('QUOTA')
      if (res.status === 403) throw new PlaylistImportError('FORBIDDEN')
      throw new PlaylistImportError(reason || `HTTP_${res.status}`)
    }

    const data = (await res.json()) as {
      items?: {
        snippet?: {
          title?: string
          description?: string
          publishedAt?: string
          videoOwnerChannelTitle?: string
          resourceId?: { videoId?: string }
        }
      }[]
      nextPageToken?: string
    }
    for (const it of data.items ?? []) {
      const sn = it.snippet
      const vid = sn?.resourceId?.videoId
      const rawTitle = sn?.title ?? ''
      // 비공개·삭제된 항목은 제목이 이렇게 옴 → 건너뜀
      if (!vid || !rawTitle || rawTitle === 'Private video' || rawTitle === 'Deleted video') continue
      const { title, artist } = splitTitle(rawTitle, sn?.videoOwnerChannelTitle ?? '')
      out.push({
        videoId: vid,
        title,
        artist,
        thumbnail: thumbnailUrl(vid),
        url: watchUrl(vid),
        publishedAt: (sn?.publishedAt ?? '').slice(0, 10),
        description: sn?.description ?? '',
      })
    }
    pageToken = data.nextPageToken ?? ''
    if (!pageToken) break
  }
  return out
}
