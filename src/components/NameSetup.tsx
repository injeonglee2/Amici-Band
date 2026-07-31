import { useState } from 'react'
import { useAuth } from '../auth'
import { PART_META, PART_ORDER, type Part } from '../types'

export default function NameSetup() {
  const { member, setRealName, signOutUser } = useAuth()
  const [name, setName] = useState(member?.name ?? '')
  const [part, setPart] = useState<Part | null>(member?.part ?? null)
  const [busy, setBusy] = useState(false)

  const trimmed = name.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 4 && !!part

  async function save() {
    if (!valid || !part) return
    setBusy(true)
    try {
      await setRealName(trimmed, part)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centered">
      <div className="login">
        <h1>프로필 설정</h1>
        <p className="muted">
          투표·명단에 표시될 <b>실명</b>과 담당 <b>파트</b>를 설정해 주세요. 처음 한 번만 하면 됩니다.
        </p>

        <label className="setup-label">이름</label>
        <input
          className="name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예) 홍길동"
          maxLength={4}
          autoFocus
        />

        <label className="setup-label">담당 파트</label>
        <div className="part-pick">
          {PART_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              className={'part-btn' + (part === p ? ' on' : '')}
              aria-pressed={part === p}
              onClick={() => setPart(p)}
            >
              {PART_META[p].label}
            </button>
          ))}
        </div>

        <button className="btn primary block" onClick={save} disabled={!valid || busy}>
          {busy ? '저장 중…' : '시작하기'}
        </button>
        <button className="btn text" onClick={signOutUser}>
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  )
}
