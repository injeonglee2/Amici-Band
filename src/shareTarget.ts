import { parsePlaylistId, parseVideoId } from './youtube'

export interface ShareRequest {
  youtubeUrl: string | null
  raw: string
}

const SHARE_PATH = /^\/share\/?$/
const WEB_URL = /https?:\/\/[^\s<>"']+/gi

function cleanUrlCandidate(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/[\])}>.,!?;:'"”’]+$/g, '')
}

/** 카카오톡처럼 제목·설명이 섞인 공유 문장에서 첫 유튜브 영상/재생목록 URL을 찾는다. */
export function extractSharedYouTubeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // URL 또는 ID만 공유된 경우를 먼저 처리한다.
  if (parseVideoId(raw) || parsePlaylistId(raw)) return raw

  for (const match of raw.matchAll(WEB_URL)) {
    const candidate = cleanUrlCandidate(match[0])
    if (parseVideoId(candidate) || parsePlaylistId(candidate)) return candidate
  }
  return null
}

/** Android 네이티브/PWA share_target이 연 /share 요청을 한 번 읽는다. */
export function readShareRequest(): ShareRequest | null {
  if (typeof window === 'undefined' || !SHARE_PATH.test(window.location.pathname)) return null
  const params = new URLSearchParams(window.location.search)
  const raw = [params.get('url'), params.get('text'), params.get('title')]
    .filter((value): value is string => !!value?.trim())
    .join('\n')
  return { raw, youtubeUrl: extractSharedYouTubeUrl(raw) }
}

/** 공유 내용을 상태로 옮긴 뒤 주소만 기본 화면으로 정리한다. 다른 쿼리(예: demo)는 보존한다. */
export function clearShareRequest(): void {
  if (typeof window === 'undefined' || !SHARE_PATH.test(window.location.pathname)) return
  const next = new URL(window.location.href)
  next.pathname = '/'
  next.searchParams.delete('title')
  next.searchParams.delete('text')
  next.searchParams.delete('url')
  window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`)
}
