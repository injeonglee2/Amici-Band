import { useState } from 'react'
import { useAuth } from '../auth'
import { versionLabel } from '../version'
import { WORKSPACE_TEMPLATES } from '../workspaceTemplates'
import { useWorkspaceTheme } from '../useWorkspaceTheme'

function messageFor(code: string): string {
  switch (code) {
    case 'auth/operation-not-allowed':
      return '구글 로그인이 아직 켜져 있지 않아요. Firebase 콘솔 → Authentication → Sign-in method 에서 Google 을 사용 설정해 주세요.'
    case 'auth/configuration-not-found':
      return 'Authentication 이 아직 설정되지 않았어요. 콘솔에서 Authentication “시작하기” 후 Google 로그인을 켜주세요.'
    case 'auth/unauthorized-domain':
      return '이 도메인이 승인되지 않았어요. Authentication → 설정 → 승인된 도메인에 추가해 주세요.'
    case 'auth/popup-blocked':
      return '팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '로그인 창이 닫혔어요. 다시 시도해 주세요.'
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'API 키가 올바르지 않아요. .env.local 의 값을 확인해 주세요.'
    default:
      return '로그인에 실패했어요.' + (code ? ` (${code})` : '')
  }
}

export default function Login() {
  useWorkspaceTheme(WORKSPACE_TEMPLATES.personal)
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    setBusy(true)
    setErr('')
    try {
      await signIn()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(messageFor(code))
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centered">
      <div className="login">
        <div className="mark big">
          <img src="/logo.png" alt="Amici Band" />
        </div>
        <h1>Amici Band</h1>
        <p className="muted">개인 기록과 공동 일정을 한곳에서 관리해요.</p>
        <button className="google-btn" onClick={go} disabled={busy}>
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          {busy ? '로그인 중…' : 'Google 계정으로 로그인'}
        </button>
        {err && <p className="err">{err}</p>}
      </div>
      <p className="app-ver">{versionLabel()}</p>
    </div>
  )
}
