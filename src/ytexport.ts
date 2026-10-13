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

// 멤버들이 이미 승인한 범위. 다른 범위(youtube.force-ssl 등)로 바꾸면 Google 이 새 권한으로
// 보고 모든 계정에 동의 화면을 다시 띄우므로, 콘솔 동의화면에 등록된 이 값을 유지한다.
const YT_SCOPE = 'https://www.googleapis.com/auth/youtube'

export class YouTubeExportError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'YouTubeExportError'
  }
}

// 받은 토큰은 만료(1시간) 전까지 재사용해 연속 저장 때 팝업을 다시 띄우지 않는다. 탭을 닫으면 사라진다.
const TOKEN_KEY = 'yt-export-token'
const TOKEN_TTL = 50 * 60 * 1000
function cachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const { token, uid, exp } = JSON.parse(raw) as { token: string; uid: string; exp: number }
    if (Date.now() > exp || uid !== auth?.currentUser?.uid) return null
    return token
  } catch {
    return null
  }
}
function rememberToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, uid: auth?.currentUser?.uid ?? '', exp: Date.now() + TOKEN_TTL }))
  } catch {
    /* 저장 공간 없음 — 다음 저장 때 팝업을 다시 띄우면 된다 */
  }
}
function forgetToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 무시 */
  }
}

/** youtube 권한이 포함된 Google OAuth 액세스 토큰 획득 (팝업). 이미 승인한 계정이면 Google 이 동의 화면 없이 바로 닫는다 */
async function getYouTubeToken(): Promise<string> {
  const cached = cachedToken()
  if (cached) return cached
  const provider = new GoogleAuthProvider()
  provider.addScope(YT_SCOPE)
  // prompt 를 'consent' 로 강제하면 이미 권한을 준 계정도 매번 동의 화면을 거친다.
  // 지정하지 않으면 미승인 권한이 있을 때만 동의 화면이 뜬다.
  provider.setCustomParameters({
    include_granted_scopes: 'true',
    ...(auth?.currentUser?.email ? { login_hint: auth.currentUser.email } : {}),
  })
  try {
    const result = auth?.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, provider)
      : await signInWithPopup(auth, provider)
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken
    if (!token) throw new YouTubeExportError('AUTH')
    rememberToken(token)
    return token
  } catch (e) {
    if (e instanceof YouTubeExportError) throw e
    const code = (e as { code?: string })?.code
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
      throw new YouTubeExportError('CANCELLED')
    if (code === 'auth/popup-blocked') throw new YouTubeExportError('POPUP_BLOCKED')
    if (code === 'auth/user-mismatch') throw new YouTubeExportError('USER_MISMATCH')
    throw new YouTubeExportError('AUTH')
  }
}

async function apiError(res: Response): Promise<YouTubeExportError> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { status?: string; errors?: { reason?: string }[] } }
    | null
  const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? ''
  const error = (code: string) => Object.assign(new YouTubeExportError(code), { status: res.status, reason })
  if (res.status === 401) return error('AUTH')
  if (reason === 'quotaExceeded') return error('QUOTA')
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') return error('API_DISABLED')
  if (reason === 'youtubeSignupRequired') return error('NO_CHANNEL')
  if (reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') return error('FORBIDDEN')
  if (res.status === 403) return error(reason === 'forbidden' || !reason ? 'FORBIDDEN' : reason)
  return error(reason || `HTTP_${res.status}`)
}

// 계정·권한·할당량 문제는 곡마다 반복되므로 즉시 중단한다.
const FATAL_CODES = new Set(['AUTH', 'QUOTA', 'API_DISABLED', 'NO_CHANNEL'])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// YouTube 는 연속 추가 시 409(ABORTED)·5xx 를 자주 돌려준다. 잠시 뒤 다시 시도하면 대부분 성공한다.
const isTransient = (e: YouTubeExportError & { status?: number }) =>
  e.status === 409 || (e.status ?? 0) >= 500 || ['backendError', 'rateLimitExceeded', 'SERVICE_UNAVAILABLE', 'ABORTED'].includes(e.code)

// 유튜브 재생목록 제목은 150자 이하이고 < > 를 허용하지 않는다.
function playlistTitle(name: string): string {
  const title = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return Array.from(title || 'Amici Band').slice(0, 150).join('')
}

export interface ExportResult {
  playlistId: string
  added: number
  total: number
  url: string
}

/**
 * 유튜브에 새 재생목록을 만들고 videoIds 를 순서대로 추가.
 * 추가할 수 없는 개별 영상은 건너뛰고, 권한·할당량 같은 계정 오류는 즉시 알린다.
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
        snippet: { title: playlistTitle(name), description: 'Amici Band 앱에서 내보낸 재생목록' },
        status: { privacyStatus: 'private' },
      }),
    },
  )
  if (!createRes.ok) {
    const error = await apiError(createRes)
    // 재사용한 토큰이 만료·권한 부족이면 버리고 다음 저장 때 팝업을 다시 띄운다
    if (error.code === 'AUTH' || error.code === 'FORBIDDEN') forgetToken()
    throw error
  }
  const created = (await createRes.json()) as { id: string }
  const playlistId = created.id

  // 2) 곡을 순서대로 추가. 잘못된 ID·중복은 미리 거르고, 개별 영상 문제(삭제·비공개·지역제한)는 건너뛴다.
  const ids = Array.from(new Set(videoIds.map((id) => id.trim()).filter((id) => /^[\w-]{11}$/.test(id))))
  let added = 0
  for (const videoId of ids) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
        }),
      })
      if (res.ok) {
        added++
        onProgress?.(added, ids.length)
        break
      }
      const error = await apiError(res)
      if (FATAL_CODES.has(error.code)) {
        if (error.code === 'AUTH') forgetToken()
        throw error
      }
      if (isTransient(error) && attempt < 3) {
        await sleep(800 * 2 ** attempt)
        continue
      }
      console.warn('유튜브 곡 추가 건너뜀', videoId, error.code)
      break
    }
  }

  return {
    playlistId,
    added,
    total: ids.length,
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
    case 'USER_MISMATCH':
      return '앱에 로그인한 Google 계정과 같은 계정을 선택해 주세요.'
    case 'NO_CHANNEL':
      return '이 Google 계정에 YouTube 채널이 없어요. YouTube에서 채널을 만든 뒤 다시 시도해 주세요.'
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
