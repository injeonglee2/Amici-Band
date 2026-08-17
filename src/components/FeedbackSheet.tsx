import { useState } from 'react'
import { useAuth } from '../auth'
import { submitFeedback } from '../data'
import { APP_VERSION, BUILD_TIME } from '../version'
import Sheet from './Sheet'
import { useBackHandler } from '../backnav'
import type { ToastState } from './Toast'
import type { Feedback } from '../types'

const TYPES: { value: Feedback['type']; label: string }[] = [
  { value: 'bug', label: '버그' },
  { value: 'idea', label: '개선 제안' },
  { value: 'etc', label: '기타' },
]

/** 버그 제보·개선 의견 제출 시트. 유형·내용만 쓰면 앱 버전·기기 정보를 자동 첨부해 보낸다. */
export default function FeedbackSheet({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const { user, member } = useAuth()
  useBackHandler(onClose)
  const [type, setType] = useState<Feedback['type']>('bug')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!text.trim() || busy || !user) return
    setBusy(true)
    setErr('')
    try {
      await submitFeedback({
        type,
        text: text.trim(),
        status: 'new',
        appVersion: APP_VERSION,
        buildTime: BUILD_TIME,
        userAgent: navigator.userAgent,
        createdBy: user.uid,
        createdByName: member?.name,
        createdAt: Date.now(),
      })
      toast.show('의견을 보냈어요. 고마워요!')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '전송 권한이 없어요.'
          : '전송에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2>의견 보내기</h2>

      <div className="field">
        <label>유형</label>
        <div className="fb-types">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={'fb-type' + (type === t.value ? ' on' : '')}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="fb-text">내용</label>
        <textarea id="fb-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1000} autoFocus />
      </div>

      {err && <p className="err small">{err}</p>}

      <div className="actions">
        <button type="button" className="btn primary" onClick={submit} disabled={!text.trim() || busy}>
          {busy ? '보내는 중…' : '보내기'}
        </button>
        <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>닫기</button>
      </div>
    </Sheet>
  )
}
