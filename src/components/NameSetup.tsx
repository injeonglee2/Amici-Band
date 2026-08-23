import { useState } from 'react'
import { useAuth } from '../auth'
import { saveFcmToken, saveWebPushSubscription } from '../data'
import { pushConfigured, requestNotificationRegistrations } from '../messaging'
import { PART_META, PART_ORDER, type Part } from '../types'
import { getWorkspaceTemplate } from '../workspaceTemplates'
import { useWorkspaceTheme } from '../useWorkspaceTheme'

export default function NameSetup() {
  const { user, member, workspace, setRealName, signOutUser } = useAuth()
  const template = getWorkspaceTemplate(workspace?.templateId)
  useWorkspaceTheme(template)
  const needsPart = template.id === 'band'
  const [name, setName] = useState(member?.name ?? '')
  const [part, setPart] = useState<Part | null>(member?.part ?? null)
  const [busy, setBusy] = useState(false)
  const [receiveNotifications, setReceiveNotifications] = useState(pushConfigured())

  const trimmed = name.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 4 && (!needsPart || !!part)

  async function save() {
    if (!valid) return
    setBusy(true)
    try {
      // iPhone Web Push 권한 요청은 사용자의 버튼 탭과 직접 연결되어야 한다.
      const registrations = receiveNotifications
        ? requestNotificationRegistrations()
        : Promise.resolve({ fcmToken: null, webPushSubscription: null })
      await setRealName(trimmed, needsPart ? (part ?? undefined) : undefined)
      const { fcmToken, webPushSubscription } = await registrations
      if (user && (fcmToken || webPushSubscription)) {
        await Promise.all([
          fcmToken ? saveFcmToken(user.uid, fcmToken) : Promise.resolve(),
          webPushSubscription
            ? saveWebPushSubscription(user.uid, webPushSubscription)
            : Promise.resolve(),
        ])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centered">
      <div className="login">
        <h1>프로필 설정</h1>
        <p className="muted">
          투표·명단에 표시될 <b>이름</b>{needsPart && <>과 담당 <b>파트</b></>}를 설정해 주세요. 처음 한 번만 하면 됩니다.
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

        {needsPart && (
          <>
            <label className="setup-label">담당 파트</label>
            <div className="part-pick">
              {PART_ORDER.map((p) => (
                <button key={p} type="button" className={'part-btn' + (part === p ? ' on' : '')}
                  aria-pressed={part === p} onClick={() => setPart(p)}>
                  {PART_META[p].label}
                </button>
              ))}
            </div>
          </>
        )}

        {pushConfigured() && (
          <label className="setup-notification">
            <input
              type="checkbox"
              checked={receiveNotifications}
              onChange={(e) => setReceiveNotifications(e.target.checked)}
            />
            <span>
              <b>일정 및 투표 알림 받기</b>
              <small>시작하기를 누르면 알림 권한을 함께 요청합니다.</small>
            </span>
          </label>
        )}

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
