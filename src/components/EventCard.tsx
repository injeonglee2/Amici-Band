import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { deleteEvent, watchAttendance } from '../data'
import {
  STATUS_META,
  TYPE_META,
  type Attendance,
  type AttendStatus,
  type BandEvent,
  type Member,
} from '../types'
import { dayDiff, weekday, parseDate } from '../time'
import { copyValue, type ResolvedPlace } from '../place'
import { TypeGlyph } from './TypeGlyph'
import { CopyButton } from './CopyButton'
import AttendanceModal from './AttendanceModal'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'

const ORDER: AttendStatus[] = ['present', 'late', 'leave', 'absent']

export default function EventCard({
  ev,
  place,
  members,
  onEdit,
  toast,
}: {
  ev: BandEvent
  place: ResolvedPlace | null
  members: Member[]
  onEdit: () => void
  toast: ToastState
}) {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [att, setAtt] = useState<Attendance[]>([])
  const t = TYPE_META[ev.type]
  const d = parseDate(ev.date)
  const past = dayDiff(ev.date) < 0
  const canDelete = !!user && ev.createdBy === user.uid

  useEffect(() => watchAttendance(ev.id, setAtt), [ev.id])
  const mine = useMemo(() => att.find((a) => a.uid === user?.uid), [att, user])
  const undecidedCount = useMemo(() => {
    const voted = new Set(att.map((a) => a.uid))
    return members.filter((m) => !voted.has(m.uid)).length
  }, [att, members])

  async function doDelete() {
    setConfirmDelete(false)
    try {
      await deleteEvent(ev.id)
      toast.show('일정을 삭제했어요')
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '삭제 권한이 없어요.' : '삭제에 실패했어요.')
    }
  }

  return (
    <>
      <div
        className="event"
        style={{ ['--k' as string]: t.color }}
        role="button"
        tabIndex={0}
        aria-label={`${ev.title} 참석 ${past ? '결과' : '투표'}`}
        onClick={() => setModalOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setModalOpen(true)
          }
        }}
      >
        <TypeGlyph type={ev.type} className={'wm wm-' + ev.type} />
        <div className="event-row">
          <div className="datebox">
            <div className="m">{d.getMonth() + 1}월</div>
            <div className="d">{d.getDate()}</div>
            <div className="w">({weekday(ev.date)})</div>
          </div>
          <div className="einfo">
            <div className="tag"><TypeGlyph type={ev.type} className="type-ico" />{t.label}</div>
            <h3>{ev.title}</h3>
            <div className="sub">
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                {ev.rehStart}–{ev.rehEnd}
              </span>
              {place && (
                <span className="loc-wrap" onClick={(e) => e.stopPropagation()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  <span className="loc">{place.name}</span>
                  <CopyButton text={copyValue(place)} onCopied={() => toast.show('주소가 복사되었어요')} />
                </span>
              )}
            </div>
          </div>
          {past ? (
            canDelete && (
              <button className="edit-btn del" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }} aria-label="삭제">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )
          ) : (
            <button className="edit-btn" onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label="수정">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          )}
        </div>

        {ev.note && <p className="event-note">{ev.note}</p>}

        <div className="attend-summary">
          {ORDER.map((s) => {
            const n = att.filter((a) => a.status === s).length
            return (
              <span
                key={s}
                className={'asum' + (mine?.status === s ? ' mine' : '')}
                style={{ ['--k' as string]: STATUS_META[s].color }}
              >
                <span className="dot" />
                {STATUS_META[s].label}
                <b>{n}</b>
              </span>
            )
          })}
          <span className="asum" style={{ ['--k' as string]: 'var(--undecided)' }}>
            <span className="dot" />
            미정
            <b>{undecidedCount}</b>
          </span>
        </div>
      </div>

      {modalOpen && (
        <AttendanceModal ev={ev} list={att} members={members} readOnly={past} onClose={() => setModalOpen(false)} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`'${ev.title}' 일정을 삭제할까요? 참석 기록도 함께 사라져요.`}
          confirmLabel="삭제"
          cancelLabel="닫기"
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
