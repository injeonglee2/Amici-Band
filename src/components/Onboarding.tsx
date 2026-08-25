import { useState } from 'react'
import { useAuth } from '../auth'
import { createBand, joinBand } from '../data'
import { CopyButton } from './CopyButton'
import { WORKSPACE_TEMPLATES } from '../workspaceTemplates'
import { useWorkspaceTheme } from '../useWorkspaceTheme'

function msgOf(e: unknown): string {
  const m = (e as { message?: string })?.message
  return m && m.length < 120 ? m : '처리에 실패했어요. 다시 시도해 주세요.'
}

/** 로그인했지만 아직 밴드가 없는 사용자: 밴드 만들기 / 코드로 참여 */
export default function Onboarding({ onCancel }: { onCancel?: () => void }) {
  useWorkspaceTheme(WORKSPACE_TEMPLATES.personal)
  const { refreshBand, signOutUser, member } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'created'>('choose')
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<'personal' | 'band'>('personal')
  const [code, setCode] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const selectedTemplate = channelType === 'personal' ? WORKSPACE_TEMPLATES.personal : WORKSPACE_TEMPLATES.band

  async function doCreate() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await createBand(name.trim(), channelType === 'personal' ? 'personal' : 'band')
      if (res.code) {
        setCreatedCode(res.code)
        setMode('created') // 공동 채널은 코드 먼저 안내한 뒤 계속
      } else {
        await refreshBand() // 개인 채널은 초대 과정 없이 바로 프로필 설정으로
      }
    } catch (e) {
      setErr(msgOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function doJoin() {
    if (!code.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      await joinBand(code.trim())
      await refreshBand() // 가입 완료 → 이름 설정으로
    } catch (e) {
      setErr(msgOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centered">
      <div className="login onboard">
        <div className="mark big">
          <img src="/logo.png" alt="Amici Band" />
        </div>

        {mode === 'choose' && (
          <>
            <h1>새 공간 시작하기</h1>
            <p className="muted">개인 채널과 멤버가 함께 쓰는 밴드 채널을 각각 하나씩 사용할 수 있어요. 이름은 채널 사이에서 그대로 이어집니다.</p>
            <button className="btn primary block" onClick={() => { setChannelType('personal'); setMode('create'); setErr('') }}>개인 채널 만들기</button>
            <button className="btn subtle block" onClick={() => { setChannelType('band'); setMode('create'); setErr('') }}>밴드 채널 만들기</button>
            <button className="btn subtle block" onClick={() => { setMode('join'); setErr('') }}>밴드 초대 코드로 참여</button>
          </>
        )}

        {mode === 'create' && (
          <>
            <h1>{channelType === 'personal' ? '개인 채널 만들기' : '밴드 채널 만들기'}</h1>
            <p className="template-preview-label">{channelType === 'personal' ? '개인 템플릿' : '밴드 템플릿'}</p>
            <div className="template-card on onboarding-template" style={{ ['--template-color' as string]: selectedTemplate.theme.accent }}>
              <span className="template-symbol">{selectedTemplate.symbol}</span>
              <b>{selectedTemplate.label}</b>
              <small>{selectedTemplate.description}</small>
            </div>
            <div className="field">
              <label htmlFor="ob-name">채널 이름</label>
              <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder={channelType === 'personal' ? '예: 나의 기록, 인정의 공간' : '예: 아미치, 주말 밴드'} />
            </div>
            <button className="btn primary block" onClick={doCreate} disabled={!name.trim() || busy}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <button className="btn subtle block" onClick={() => { setMode('choose'); setErr('') }} disabled={busy}>뒤로</button>
          </>
        )}

        {mode === 'created' && (
          <>
            <h1>{channelType === 'personal' ? '개인 채널이 만들어졌어요' : '밴드 채널이 만들어졌어요'}</h1>
            <p className="muted">이 초대 코드로 멤버를 초대하세요. (설정에서 언제든 다시 볼 수 있어요)</p>
            <div className="invite-code big">
              <span>{createdCode}</span>
              <CopyButton text={createdCode} />
            </div>
            <button className="btn primary block" onClick={() => void refreshBand()}>계속 (내 프로필 설정)</button>
          </>
        )}

        {mode === 'join' && (
          <>
            <h1>밴드 코드로 참여</h1>
            <div className="field">
              <label htmlFor="ob-code">초대 코드</label>
              <input
                id="ob-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={9}
                autoFocus
                placeholder="예: ABC-DEF"
                autoCapitalize="characters"
              />
            </div>
            <button className="btn primary block" onClick={doJoin} disabled={!code.trim() || busy}>
              {busy ? '참여 중…' : '참여하기'}
            </button>
            <button className="btn subtle block" onClick={() => { setMode('choose'); setErr('') }} disabled={busy}>뒤로</button>
          </>
        )}

        {err && <p className="err">{err}</p>}
        {onCancel ? <button className="link-btn" onClick={onCancel}>현재 채널로 돌아가기</button> :
          <button className="link-btn" onClick={() => void signOutUser()}>{member ? '다른 계정으로' : '로그아웃'}</button>}
      </div>
    </div>
  )
}
