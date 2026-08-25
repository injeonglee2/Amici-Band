import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useAuth } from '../auth'
import { deleteEvent, watchAttendance } from '../data'
import {
  STATUS_META,
  TYPE_META,
  type Attendance,
  type BandEvent,
  type Member,
} from '../types'
import { dayDiff, weekday, parseDate } from '../time'
import { copyValue, type ResolvedPlace } from '../place'
import { addToDeviceCalendar, calendarExportSupported } from '../calendar'
import { TypeGlyph } from './TypeGlyph'
import { CopyButton } from './CopyButton'
import AttendanceModal from './AttendanceModal'
import SetlistSheet from './SetlistSheet'
import ShowPlaylistSheet from './ShowPlaylistSheet'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'

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
  const { user, member } = useAuth()
  const [modal, setModal] = useState<null | 'vote' | 'summary'>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [att, setAtt] = useState<Attendance[]>([])
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteOverflow, setNoteOverflow] = useState(false)
  const [showCalendarExport, setShowCalendarExport] = useState(false)
  const [setlistOpen, setSetlistOpen] = useState(false)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const t = TYPE_META[ev.type]
  const d = parseDate(ev.date)
  const past = dayDiff(ev.date) < 0
  const isAdmin = !!member?.admin
  const canDelete = !!user && (ev.createdBy === user.uid || isAdmin)
  // 곡이 필요한 유형: 합주=합주곡(곡 하나씩), 공연=재생목록(통째로 연결)
  const hasSetlist = ev.type === 'practice' || ev.type === 'show'
  const setlistLabel = ev.type === 'show' ? '재생목록' : '합주곡'

  function openSetlist() {
    if (hasSetlist) setSetlistOpen(true)
  }
  function onRowKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openSetlist()
    }
  }

  useEffect(() => watchAttendance(ev.id, setAtt), [ev.id])
  useEffect(() => {
    let active = true
    calendarExportSupported().then((supported) => {
      if (active) setShowCalendarExport(supported)
    })
    return () => {
      active = false
    }
  }, [])
  // 메모가 1줄을 넘겨 잘리는지 측정 (접힌 상태에서만 의미 있음) → 넘칠 때만 펼치기 버튼 노출
  useLayoutEffect(() => {
    const el = noteRef.current
    if (!el || noteOpen) return
    setNoteOverflow(el.scrollHeight > el.clientHeight + 1)
  }, [ev.note, noteOpen])
  const mine = useMemo(() => att.find((a) => a.uid === user?.uid), [att, user])

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
      <div className="event" style={{ ['--k' as string]: t.color }}>
        {/* 합주·공연이면 본문(날짜·제목·시간) 탭 → 합주곡 시트. 우측 버튼·장소 복사는 전파를 막아 기존 동작 유지 */}
        <div
          className={'event-row' + (hasSetlist ? ' tappable' : '')}
          role={hasSetlist ? 'button' : undefined}
          tabIndex={hasSetlist ? 0 : undefined}
          aria-label={hasSetlist ? `${ev.title} ${setlistLabel}` : undefined}
          onClick={hasSetlist ? openSetlist : undefined}
          onKeyDown={hasSetlist ? onRowKeyDown : undefined}
        >
          <div className="datebox">
            <div className="m">{d.getMonth() + 1}월</div>
            <div className="d">{d.getDate()}</div>
            <div className="w">({weekday(ev.date)})</div>
          </div>
          <div className="einfo">
            <div className="etitle">
              <TypeGlyph type={ev.type} className="type-ico" />
              <h3>{ev.title}</h3>
              {ev.adminOnly && isAdmin && <span className="admin-only-badge">관리자</span>}
            </div>
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
          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            {/* 윗줄: 캘린더에 추가 + 수정(관리자, 다가오는) 또는 삭제(지난) */}
            <div className="ca-top">
              {!past && showCalendarExport && (
                <button className="edit-btn" onClick={() => void addToDeviceCalendar(ev, place)} aria-label="캘린더에 추가" title="캘린더에 추가">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></svg>
                </button>
              )}
              {!past && isAdmin && (
                <button className="edit-btn" onClick={onEdit} aria-label="수정">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
              )}
              {past && canDelete && (
                <button className="edit-btn del" onClick={() => setConfirmDelete(true)} aria-label="삭제">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {/* 아랫줄: 내 참석 상태(미투표=점 / 투표함=내 상태 색 pill) */}
            <div className="ca-bottom">
              {mine ? (
                <button className="card-vote-pill" style={{ ['--k' as string]: STATUS_META[mine.status].color }} onClick={() => setModal('summary')} aria-label="참석 현황" title="참석 현황">
                  {STATUS_META[mine.status].label}
                  {mine.status === 'late' && mine.arriveTime ? ` ${mine.arriveTime}` : ''}
                  {mine.status === 'leave' && mine.leaveTime ? ` ${mine.leaveTime}` : ''}
                </button>
              ) : !past ? (
                <button className="card-vote" onClick={() => setModal('vote')} aria-label="참석 투표" title="참석 투표">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  <span className="vote-dot" aria-hidden="true" />
                </button>
              ) : (
                <button className="card-vote view" onClick={() => setModal('summary')} aria-label="참석 결과" title="참석 결과">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {ev.note && (
          <div className={'event-note' + (noteOpen ? ' open' : '')}>
            <p className="event-note-text" ref={noteRef}>{ev.note}</p>
            {(noteOverflow || noteOpen) && (
              <button
                type="button"
                className="note-toggle"
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
                aria-label={noteOpen ? '메모 접기' : '메모 펼치기'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            )}
          </div>
        )}

      </div>

      {modal && (
        <AttendanceModal ev={ev} list={att} members={members} initialMode={modal} readOnly={past} onClose={() => setModal(null)} />
      )}

      {setlistOpen &&
        (ev.type === 'show' ? (
          <ShowPlaylistSheet
            ev={ev}
            place={place}
            members={members}
            toast={toast}
            onClose={() => setSetlistOpen(false)}
          />
        ) : (
          <SetlistSheet
            ev={ev}
            place={place}
            members={members}
            toast={toast}
            onClose={() => setSetlistOpen(false)}
          />
        ))}


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
