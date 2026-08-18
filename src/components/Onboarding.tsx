import { useState } from 'react'
import { useAuth } from '../auth'
import { createBand, joinBand } from '../data'
import { CopyButton } from './CopyButton'

function msgOf(e: unknown): string {
  const m = (e as { message?: string })?.message
  return m && m.length < 120 ? m : '처리에 실패했어요. 다시 시도해 주세요.'
}

/** 로그인했지만 아직 밴드가 없는 사용자: 밴드 만들기 / 코드로 참여 */
export default function Onboarding() {
  const { refreshBand, signOutUser, member } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'created'>('choose')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function doCreate() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await createBand(name.trim())
      setCreatedCode(res.code)
      setMode('created') // 코드 먼저 안내한 뒤 계속(이름 설정)
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
            <h1>밴드 시작하기</h1>
            <p className="muted">밴드를 새로 만들거나, 받은 초대 코드로 참여하세요.</p>
            <button className="btn primary block" onClick={() => { setMode('create'); setErr('') }}>밴드 만들기</button>
            <button className="btn subtle block" onClick={() => { setMode('join'); setErr('') }}>코드로 참여</button>
          </>
        )}

        {mode === 'create' && (
          <>
            <h1>밴드 만들기</h1>
            <div className="field">
              <label htmlFor="ob-name">밴드 이름</label>
              <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus placeholder="예: 아미치" />
            </div>
            <button className="btn primary block" onClick={doCreate} disabled={!name.trim() || busy}>
              {busy ? '만드는 중…' : '만들기'}
            </button>
            <button className="btn subtle block" onClick={() => { setMode('choose'); setErr('') }} disabled={busy}>뒤로</button>
          </>
        )}

        {mode === 'created' && (
          <>
            <h1>밴드가 만들어졌어요</h1>
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
            <h1>코드로 참여</h1>
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
        <button className="link-btn" onClick={() => void signOutUser()}>
          {member ? '다른 계정으로' : '로그아웃'}
        </button>
      </div>
    </div>
  )
}
