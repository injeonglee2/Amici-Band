import { useState } from 'react'
import { useAuth } from '../auth'
import { createBand, joinBand } from '../data'
import { CopyButton } from './CopyButton'
import { CREATABLE_TEMPLATE_IDS, WORKSPACE_TEMPLATES, workspaceLogo, type WorkspaceTemplateId } from '../workspaceTemplates'
import { useWorkspaceTheme } from '../useWorkspaceTheme'
import { TemplateSymbol } from './TemplateSymbol'

function msgOf(e: unknown): string {
  const m = (e as { message?: string })?.message
  return m && m.length < 120 ? m : '처리에 실패했어요. 다시 시도해 주세요.'
}

/** 채널 종류별 이름 예시 */
const NAME_PLACEHOLDER: Record<WorkspaceTemplateId, string> = {
  personal: '예: 나의 기록, 인정의 공간',
  band: '예: 아미치, 주말 밴드',
  friends: '예: 고등학교 친구들, 주말 모임',
  study: '예: 알고리즘 스터디',
  gathering: '예: 동호회',
}

/** 로그인했지만 아직 채널이 없는 사용자: 채널 만들기(개인·밴드·친구) / 초대 코드로 참여 */
export default function Onboarding({ onCancel }: { onCancel?: () => void }) {
  useWorkspaceTheme(WORKSPACE_TEMPLATES.personal)
  const { refreshBand, signOutUser, member } = useAuth()
  // choose: 채널 만들기 / 초대코드로 시작하기 두 가지만 → type: 채널 종류 선택 → create: 이름 입력
  const [mode, setMode] = useState<'choose' | 'type' | 'create' | 'join' | 'created'>('choose')
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<WorkspaceTemplateId>('personal')
  const [code, setCode] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const selectedTemplate = WORKSPACE_TEMPLATES[channelType]
  const channelLabel = `${selectedTemplate.label} 채널`

  /**
   * 새 채널로 들어간다. 앱 안(채널 추가)에서 열렸으면 Main 이 이전 채널의 일정·멤버 구독을 그대로 들고 있으므로
   * 채널 전환과 같은 방식으로 전체를 새로 고쳐 새 채널만 보이게 한다. 첫 채널(온보딩)은 셸이 새로 그리므로 재해석만 한다.
   */
  async function enterChannel() {
    await refreshBand()
    if (onCancel) window.location.reload()
  }

  function startCreate(id: WorkspaceTemplateId) {
    setChannelType(id)
    setMode('create')
    setErr('')
  }

  async function doCreate() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await createBand(name.trim(), channelType)
      if (res.code) {
        setCreatedCode(res.code)
        setMode('created') // 공동(밴드·친구) 채널은 코드 먼저 안내한 뒤 계속
      } else {
        await enterChannel() // 개인 채널은 초대 과정 없이 바로 프로필 설정으로
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
      await enterChannel() // 가입 완료 → 이름 설정으로
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
          <img src={workspaceLogo(WORKSPACE_TEMPLATES.personal)} alt="Amici Band" />
        </div>

        {mode === 'choose' && (
          <>
            <h1>시작하기</h1>
            <button className="btn primary block" onClick={() => { setMode('type'); setErr('') }}>채널 만들기</button>
            <button className="btn subtle block" onClick={() => { setMode('join'); setErr('') }}>초대코드로 시작하기</button>
          </>
        )}

        {mode === 'type' && (
          <>
            <h1>어떤 채널을 만들까요?</h1>
            <div className="template-list" role="list">
              {CREATABLE_TEMPLATE_IDS.map((id) => {
                const template = WORKSPACE_TEMPLATES[id]
                return (
                  <button key={id} type="button" role="listitem" className="template-card" style={{ ['--template-color' as string]: template.theme.accent }} onClick={() => startCreate(id)}>
                    <span className="template-symbol"><TemplateSymbol template={template} /></span>
                    <span><b>{template.label}</b><small>{template.description}</small></span>
                  </button>
                )
              })}
            </div>
            <button className="btn subtle block" onClick={() => { setMode('choose'); setErr('') }}>뒤로</button>
          </>
        )}

        {mode === 'create' && (
          <>
            <h1>{channelLabel} 만들기</h1>
            <p className="template-preview-label">{selectedTemplate.label} 템플릿</p>
            <div className="template-card on onboarding-template" style={{ ['--template-color' as string]: selectedTemplate.theme.accent }}>
              <span className="template-symbol"><TemplateSymbol template={selectedTemplate} /></span>
              <b>{selectedTemplate.label}</b>
              <small>{selectedTemplate.description}</small>
            </div>
            <div className="field">
              <label htmlFor="ob-name">채널 이름</label>
              <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder={NAME_PLACEHOLDER[channelType]} />
            </div>
            <button className="btn primary block" onClick={doCreate} disabled={!name.trim() || busy}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <button className="btn subtle block" onClick={() => { setMode('type'); setErr('') }} disabled={busy}>뒤로</button>
          </>
        )}

        {mode === 'created' && (
          <>
            <h1>{channelLabel}이 만들어졌어요</h1>
            <p className="muted">이 초대 코드로 {selectedTemplate.memberNoun}를 초대하세요. (설정에서 언제든 다시 볼 수 있어요)</p>
            <div className="invite-code big">
              <span>{createdCode}</span>
              <CopyButton text={createdCode} />
            </div>
            <button className="btn primary block" onClick={() => void enterChannel()}>계속 (내 프로필 설정)</button>
          </>
        )}

        {mode === 'join' && (
          <>
            <h1>초대코드로 시작하기</h1>
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
