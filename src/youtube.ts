/**
 * 유튜브 링크 유틸 — 영상 ID 추출 + 제목/가수 자동 조회.
 *
 * oEmbed(공개 엔드포인트, API 키 불필요)로 제목·채널명을 가져온다.
 * youtube.com/oembed 가 CORS 로 막히는 경우를 대비해 noembed.com 으로 폴백한다.
 */

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

// 제목 속 흔한 홍보성 꼬리표 제거: (Official Video), [MV], (Lyrics) 등.
// 위치와 무관하게(끝이 아니어도) 지우되, 키워드가 들어간 괄호만 대상으로 한다.
const TAG_PATTERN =
  /\s*[([【][^)\]】]*(official|m\/?v|lyrics?|audio|video|가사|뮤직비디오|visualizer|공식|feat\.?|ft\.?)[^)\]】]*[)\]】]/gi

function stripTags(s: string): string {
  return s.replace(TAG_PATTERN, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** oEmbed 응답의 제목·채널명을 "가수 / 곡 제목" 으로 최대한 분리 */
function splitTitle(rawTitle: string, author: string): { title: string; artist: string } {
  const title = rawTitle.trim()

  // 채널명 접미사 " - Topic" 은 유튜브 뮤직 자동 생성 채널 표기 → 가수명으로 사용
  const artistFromAuthor = author.replace(/\s*-\s*Topic$/i, '').trim()

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
