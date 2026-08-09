/**
 * 앱 재생목록을 사용자의 유튜브(=유튜브 뮤직) 계정에 실제 재생목록으로 저장.
 *
 * Firebase 의 Google 로그인에 youtube 권한(scope)을 추가로 요청해 OAuth 액세스 토큰을 얻고,
 * YouTube Data API v3 로 재생목록을 만든 뒤 곡을 하나씩 추가한다. (API 키 불필요 — OAuth 토큰 사용)
 *
 * 사전 준비(1회, 구글 클라우드 콘솔):
 *  - YouTube Data API v3 사용 설정
 *  - OAuth 동의화면에 youtube 범위 추가 (+ 테스트 사용자 등록 또는 앱 검수)
 */
import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from 'firebase/auth'
import { auth } from './firebase'

const YT_SCOPE = 'https://www.googleapis.com/auth/youtube'

export class YouTubeExportError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'YouTubeExportError'
  }
}

/** youtube 권한이 포함된 Google OAuth 액세스 토큰 획득 (팝업 동의) */
async function getYouTubeToken(): Promise<string> {
  const provider = new GoogleAuthProvider()
  provider.addScope(YT_SCOPE)
  provider.setCustomParameters({ prompt: 'consent' })
  try {
    const result = auth?.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, provider)
      : await signInWithPopup(auth, provider)
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken
    if (!token) throw new YouTubeExportError('AUTH')
    return token
  } catch (e) {
    if (e instanceof YouTubeExportError) throw e
    const code = (e as { code?: string })?.code
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
      throw new YouTubeExportError('CANCELLED')
    if (code === 'auth/popup-blocked') throw new YouTubeExportError('POPUP_BLOCKED')
    throw new YouTubeExportError('AUTH')
  }
}

async function apiError(res: Response): Promise<YouTubeExportError> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { status?: string; errors?: { reason?: string }[] } }
    | null
  const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? ''
  if (res.status === 401) return new YouTubeExportError('AUTH')
  if (reason === 'quotaExceeded') return new YouTubeExportError('QUOTA')
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED')
    return new YouTubeExportError('API_DISABLED')
  if (res.status === 403) return new YouTubeExportError('FORBIDDEN')
  return new YouTubeExportError(reason || `HTTP_${res.status}`)
}

export interface ExportResult {
  playlistId: string
  added: number
  total: number
  url: string
}

/**
 * 유튜브에 새 재생목록을 만들고 videoIds 를 순서대로 추가.
 * 개별 곡 추가 실패(삭제된 영상 등)는 건너뛰고 성공 개수를 센다.
 */
export async function exportPlaylistToYouTube(
  name: string,
  videoIds: string[],
  onProgress?: (added: number, total: number) => void,
): Promise<ExportResult> {
  const token = await getYouTubeToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 1) 재생목록 생성 (본인만 보이는 비공개)
  const createRes = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        snippet: { title: name || 'Amici Band', description: 'Amici Band 앱에서 내보낸 재생목록' },
        status: { privacyStatus: 'private' },
      }),
    },
  )
  if (!createRes.ok) throw await apiError(createRes)
  const created = (await createRes.json()) as { id: string }
  const playlistId = created.id

  // 2) 곡을 순서대로 추가
  let added = 0
  for (const videoId of videoIds) {
    const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
      }),
    })
    if (res.ok) {
      added++
      onProgress?.(added, videoIds.length)
    } else if (res.status === 401) {
      // 토큰 만료 등 인증 문제는 중단
      throw await apiError(res)
    }
    // 그 외 개별 실패(삭제·비공개 영상)는 건너뜀
  }

  return {
    playlistId,
    added,
    total: videoIds.length,
    url: `https://music.youtube.com/playlist?list=${playlistId}`,
  }
}

export function exportErrorMessage(code: string): string {
  switch (code) {
    case 'CANCELLED':
      return '' // 사용자가 취소 — 조용히 무시
    case 'POPUP_BLOCKED':
      return '팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'
    case 'AUTH':
      return '유튜브 로그인·권한 승인에 실패했어요.'
    case 'API_DISABLED':
      return '이 프로젝트에서 YouTube Data API가 켜져 있지 않아요. 콘솔에서 사용 설정이 필요해요.'
    case 'FORBIDDEN':
      return '권한이 없어요. 구글 OAuth 동의화면에 youtube 권한/테스트 사용자 설정이 필요해요.'
    case 'QUOTA':
      return '오늘 YouTube 사용량을 초과했어요. 잠시 후 다시 시도해 주세요.'
    default:
      return '유튜브로 내보내지 못했어요.'
  }
}
