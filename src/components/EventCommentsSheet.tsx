import { useState } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import { addEventComment, deleteEventComment, newId } from '../data'
import type { ResolvedPlace } from '../place'
import type { BandEvent, EventComment } from '../types'
import { getActiveWorkspaceTemplate } from '../workspaceTemplates'
import ConfirmDialog from './ConfirmDialog'
import EventSheetHeader from './EventSheetHeader'
import Sheet from './Sheet'
import type { ToastState } from './Toast'

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 일정 댓글 시트 — 카드 아래 댓글 줄에서 연다. 참석 사유(현황의 상태 부연)와 달리 일정에 대한 대화를 오래된 순으로 쌓는다.
 * 삭제는 본인 글, 또는 운영 권한(친구 채널은 모두). 푸시 알림은 보내지 않는다.
 */
export default function EventCommentsSheet({ ev, place, comments, toast, onClose }: {
  ev: BandEvent
  place: ResolvedPlace | null
  comments: EventComment[]
  toast: ToastState
  onClose: () => void
}) {
  const { user, member } = useAuth()
  useBackHandler(onClose)
  const canManage = !!member?.admin || !!getActiveWorkspaceTemplate().equalMembers
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<EventComment | null>(null)

  async function send() {
    const value = text.trim()
    if (!value || !user || !member || busy) return
    setBusy(true)
    try {
      await addEventComment(ev.id, { id: newId(), uid: user.uid, name: member.name, text: value, createdAt: Date.now() })
      setText('')
    } catch {
      toast.show('댓글을 남기지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const target = confirmDel
    setConfirmDel(null)
    if (!target) return
    try {
      await deleteEventComment(ev.id, target.id)
    } catch {
      toast.show('댓글을 삭제하지 못했어요')
    }
  }

  return (
    <>
      <Sheet onClose={onClose}>
        <EventSheetHeader ev={ev} place={place} />

        {comments.length === 0 ? (
          <p className="muted comment-empty">아직 댓글이 없어요.</p>
        ) : (
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} className="comment-row">
                <div className="comment-head">
                  <b>{c.name}</b>
                  <span>{stamp(c.createdAt)}</span>
                  {(c.uid === user?.uid || canManage) && (
                    <button type="button" className="edit-btn del" aria-label="댓글 삭제" onClick={() => setConfirmDel(c)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                <p className="comment-text">{c.text}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="comment-input-row">
          <textarea className="note-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 남기기" rows={2} maxLength={300} disabled={!user} />
          <button type="button" className="btn primary" onClick={() => void send()} disabled={!text.trim() || busy}>{busy ? '…' : '보내기'}</button>
        </div>

        <div className="actions">
          <button type="button" className="btn subtle grow" onClick={onClose}>닫기</button>
        </div>
      </Sheet>

      {confirmDel && (
        <ConfirmDialog
          message="이 댓글을 삭제할까요?"
          confirmLabel="삭제"
          cancelLabel="닫기"
          confirmVariant="danger-solid"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </>
  )
}
