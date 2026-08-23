import { firebaseReady } from './firebase'
import { DEMO } from './demo'
import { AuthProvider, useAuth } from './auth'
import SetupNotice from './components/SetupNotice'
import Login from './components/Login'
import Onboarding from './components/Onboarding'
import NameSetup from './components/NameSetup'
import Main from './components/Main'
import './styles.css'
import { getRememberedWorkspaceTemplate, getWorkspaceTemplate } from './workspaceTemplates'
import { useWorkspaceTheme } from './useWorkspaceTheme'

function LoadingScreen() {
  useWorkspaceTheme(getRememberedWorkspaceTemplate())
  return (
    <div className="splash">
      <div className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <p>불러오는 중…</p>
    </div>
  )
}

function Shell() {
  const { user, member, bandId, workspace, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }
  if (!user) return <Login />
  if (!bandId) return <Onboarding />
  const needsPart = getWorkspaceTemplate(workspace?.templateId).id === 'band'
  if (!member || (needsPart && !member.part)) return <NameSetup />
  return <Main />
}

function DemoBadge() {
  return (
    <div
      style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 100,
        padding: '5px 10px', borderRadius: 999, pointerEvents: 'none',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#fff',
        background: 'rgba(233,136,12,0.9)', boxShadow: '0 4px 14px -4px rgba(0,0,0,0.6)',
        // 스크롤 중 페인트 잔상(ghosting) 방지: 자체 합성 레이어로 승격
        transform: 'translateZ(0)', willChange: 'transform', backfaceVisibility: 'hidden',
      }}
    >
      DEMO · 로그인 없이 미리보기
    </div>
  )
}

export default function App() {
  if (!firebaseReady && !DEMO) return <SetupNotice />
  return (
    <AuthProvider>
      <Shell />
      {DEMO && <DemoBadge />}
    </AuthProvider>
  )
}
