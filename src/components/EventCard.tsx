import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useAuth } from '../auth'
import { deleteEvent, watchAttendance, watchDateVotes, watchEventComments } from '../data'
import {
  STATUS_META,
  TYPE_META,
  type Attendance,
  type BandEvent,
  type DateVote,
  type EventComment,
  type Member,
} from '../types'
import { dayCount, eventEndDate, isMultiDay, isPastEvent, shortDate, weekday, parseDate } from '../time'
import { copyValue, type ResolvedPlace } from '../place'
import { addToDeviceCalendar, calendarExportSupported } from '../calendar'
import { TypeGlyph } from './TypeGlyph'
import { CopyButton } from './CopyButton'
import AttendanceModal from './AttendanceModal'
import SetlistSheet from './SetlistSheet'
import ShowPlaylistSheet from './ShowPlaylistSheet'
import DatePollSheet from './DatePollSheet'
import EventCommentsSheet from './EventCommentsSheet'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'
import { getActiveWorkspaceTemplate } from '../workspaceTemplates'

export default function EventCard({
  ev,
  place,
  members,
  onEdit,
  onOpenRecommendation,
  toast,
  autoOpenVote = false,
}: {
  ev: BandEvent
  place: ResolvedPlace | null
  members: Member[]
  onEdit: () => void
  onOpenRecommendation?: (playlistId: string) => void
  toast: ToastState
  autoOpenVote?: boolean
}) {
  const { user, member } = useAuth()
  const [modal, setModal] = useState<null | 'vote' | 'summary'>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [att, setAtt] = useState<Attendance[]>([])
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteOverflow, setNoteOverflow] = useState(false)
  const [showCalendarExport, setShowCalendarExport] = useState(false)
  const [setlistOpen, setSetlistOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false) // 날짜 미정 약속의 '가능한 날 고르기'
  const [dateVotes, setDateVotes] = useState<DateVote[]>([])
  // 댓글(친구 채널): 목록 구독 + 마지막으로 본 시각(기기 저장)으로 새 댓글 점 표시
  const [comments, setComments] = useState<EventComment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsSeenAt, setCommentsSeenAt] = useState(() => {
    try { return Number(localStorage.getItem(`amici.commentsSeen.${ev.id}`) || 0) } catch { return 0 }
  })
  const noteRef = useRef<HTMLParagraphElement>(null)
  const deepLinkOpened = useRef(false)
  const t = TYPE_META[ev.type]
  const d = parseDate(ev.date)
  const past = isPastEvent(ev) // 여러 날 일정은 종료일이 지나야 '지난 일정'
  const multiDay = isMultiDay(ev)
  const undated = !!ev.undated // 날짜 미정 약속: 카드 본문을 누르면 가능한 날 고르기, 오른쪽 아래는 참·불참 투표
  const isAdmin = !!member?.admin
  const template = getActiveWorkspaceTemplate()
  const canEdit = isAdmin || !!template.equalMembers // 친구 채널은 누구나 수정
  // 카드 아래 줄(친구 채널): 올린 사람 + 댓글. 새 댓글은 내가 쓴 것을 빼고 마지막으로 본 시각 이후 것이 있을 때
  const withComments = !!template.eventComments
  const creatorName = members.find((m) => m.uid === ev.createdBy)?.name
  const latestComment = comments.length ? comments[comments.length - 1] : null
  const hasUnread = comments.some((c) => c.createdAt > commentsSeenAt && c.uid !== user?.uid)
  function openComments() {
    const seenAt = Date.now()
    setCommentsSeenAt(seenAt)
    try { localStorage.setItem(`amici.commentsSeen.${ev.id}`, String(seenAt)) } catch { /* 저장소가 막힌 환경 */ }
    setCommentsOpen(true)
  }
  const isRecommendationDeadline = !!ev.recommendationPlaylistId
  const deadlineTitle = ev.musicDeadlineKind === 'vote' ? '추천곡 투표 마감' : '추천곡 추가 마감'
  const deadlinePlaylistName = ev.recommendationPlaylistName || ev.title.replace(/\s+(추천곡|투표)\s*마감$/, '')
  const deadlineSummary = ev.musicDeadlineKind === 'vote' ? `인당 최대 ${ev.voteSelectionCount ?? 1}곡 선택` : `인당 최대 ${ev.recommendationLimit ?? 1}곡 추천`
  // 관리자 전용 일정은 관리자, 그룹 대상 일정은 생성 당시 지정된 멤버만 집계한다.
  const eligibleMembers = useMemo(
    () => ev.adminOnly
      ? members.filter((m) => m.admin)
      : ev.targetMemberIds?.length
        ? members.filter((m) => ev.targetMemberIds!.includes(m.uid))
        : members,
    [ev.adminOnly, ev.targetMemberIds, members],
  )
  const eligibleUids = useMemo(() => new Set(eligibleMembers.map((m) => m.uid)), [eligibleMembers])
  const eligibleAtt = useMemo(() => att.filter((a) => eligibleUids.has(a.uid)), [att, eligibleUids])
  const canDelete = !!user && (ev.createdBy === user.uid || isAdmin || !!template.equalMembers) // 친구 채널은 누구나 삭제
  // 곡이 필요한 유형(밴드 채널만): 합주=합주곡(곡 하나씩), 공연=재생목록(통째로 연결)
  const hasSetlist = template.id === 'band' && !isRecommendationDeadline && (ev.type === 'practice' || ev.type === 'show')
  const setlistLabel = ev.type === 'show' ? '재생목록' : '합주곡'
  const tappable = hasSetlist || isRecommendationDeadline || undated

  function openSetlist() {
    if (undated) {
      setPollOpen(true)
      return
    }
    if (ev.recommendationPlaylistId) {
      onOpenRecommendation?.(ev.recommendationPlaylistId)
      return
    }
    if (hasSetlist) setSetlistOpen(true)
  }
  function onRowKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openSetlist()
    }
  }

  // 날짜 미정 약속도 참·불참 투표를 받는다(종일 유형이어도)
  useEffect(() => {
    if (ev.type === 'other' && !undated) {
      setAtt([])
      return
    }
    return watchAttendance(ev.id, setAtt)
  }, [ev.id, ev.type, undated])
  // 날짜 미정 약속은 참석 대신 후보 날짜 가능 여부를 구독한다
  useEffect(() => {
    if (!undated) {
      setDateVotes([])
      return
    }
    return watchDateVotes(ev.id, setDateVotes)
  }, [ev.id, undated])
  useEffect(() => {
    if (!withComments) {
      setComments([])
      return
    }
    return watchEventComments(ev.id, setComments)
  }, [ev.id, withComments])
  useEffect(() => {
    if ((ev.type === 'other' && !undated) || !autoOpenVote || deepLinkOpened.current) return
    deepLinkOpened.current = true
    if (undated) setPollOpen(true)
    else setModal('vote')
  }, [autoOpenVote, ev.type, undated])
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
  const mine = useMemo(() => eligibleAtt.find((a) => a.uid === user?.uid), [eligibleAtt, user])

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
      <div className={'event' + (isRecommendationDeadline ? ' recommendation-event' : '')} style={{ ['--k' as string]: isRecommendationDeadline ? 'var(--undecided)' : ev.color || t.color }}>
        {/* 합주·공연이면 본문(날짜·제목·시간) 탭 → 합주곡 시트. 우측 버튼·장소 복사는 전파를 막아 기존 동작 유지 */}
        <div
          className={'event-row' + (tappable ? ' tappable' : '')}
          role={tappable ? 'button' : undefined}
          tabIndex={tappable ? 0 : undefined}
          aria-label={isRecommendationDeadline ? `${ev.title} 추천곡 열기` : undated ? `${ev.title} 날짜 투표 현황` : hasSetlist ? `${ev.title} ${setlistLabel}` : undefined}
          onClick={tappable ? openSetlist : undefined}
          onKeyDown={tappable ? onRowKeyDown : undefined}
        >
          {undated ? (
            <div className="datebox undated"><div className="d">미정</div></div>
          ) : (
            <div className="datebox">
              <div className="m">{d.getMonth() + 1}월</div>
              <div className="d">{d.getDate()}</div>
              <div className="w">({weekday(ev.date)})</div>
            </div>
          )}
          <div className="einfo">
            <div className="etitle">
              <TypeGlyph type={ev.type} className="type-ico" />
              <h3>{isRecommendationDeadline ? deadlineTitle : ev.title}</h3>
              {multiDay && <span className="event-duration-badge">{dayCount(ev)}일간</span>}
              {ev.adminOnly && isAdmin && <span className="admin-only-badge">관리자</span>}
              {!ev.adminOnly && ev.targetGroupName && <span className="event-target-badge">{ev.targetGroupName}</span>}
            </div>
            {(!ev.allDay || multiDay || isRecommendationDeadline || undated || place || (withComments && !!creatorName)) && <div className="sub">
              {undated ? (ev.period ? <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>{ev.period}</span> : null) : isRecommendationDeadline ? <>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>{deadlinePlaylistName}</span>
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>{deadlineSummary}</span>
              </> : multiDay ? (
                // 여러 날: "09:00 – 21일 (수) 18:00" (시작일 시작 시각 ~ 종료일 종료 시각). 종일이면 "– 21일 (수)"
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>{ev.allDay ? `– ${shortDate(eventEndDate(ev), ev.date)}` : `${ev.rehStart} – ${shortDate(eventEndDate(ev), ev.date)} ${ev.rehEnd}`}</span>
              ) : !ev.allDay && <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{`${ev.rehStart}–${ev.rehEnd}`}</span>}
              {place && (
                <span className="loc-wrap" onClick={(e) => e.stopPropagation()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                  <span className="loc">{place.name}</span>
                  <CopyButton text={copyValue(place)} onCopied={() => toast.show('주소가 복사되었어요')} />
                </span>
              )}
            </div>}
          </div>
          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            {/* 윗줄: 캘린더에 추가 + 수정(관리자, 다가오는) 또는 삭제(지난) */}
            <div className="ca-top">
              {isRecommendationDeadline && (
                <button className="deadline-link-btn" onClick={openSetlist} aria-label="추천곡으로 이동">
                  이동 <span aria-hidden="true">›</span>
                </button>
              )}
              {!past && showCalendarExport && !isRecommendationDeadline && !undated && (
                <button className="edit-btn" onClick={() => void addToDeviceCalendar(ev, place)} aria-label="캘린더에 추가" title="캘린더에 추가">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></svg>
                </button>
              )}
              {!past && canEdit && !isRecommendationDeadline && (
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
            {/* 아랫줄: 내 참석 상태. 날짜 미정 약속도 참·불참 투표를 받는다 */}
            {!isRecommendationDeadline && (ev.type !== 'other' || undated) && <div className="ca-bottom">
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
            </div>}
          </div>
        </div>

        {ev.note && !isRecommendationDeadline && (
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

        {/* 친구 채널: 올린 사람 · 댓글(개수, 새 댓글 점) · 최근 댓글 한 줄 */}
        {withComments && !isRecommendationDeadline && (
          <div className="event-foot">
            {creatorName && (
              <span className="event-by">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                {creatorName}
              </span>
            )}
            <button type="button" className="event-comments-btn" onClick={openComments} aria-label={comments.length > 0 ? `댓글 ${comments.length}개 보기` : '댓글 남기기'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              {comments.length > 0 ? `댓글 ${comments.length}` : '댓글 남기기'}
              {hasUnread && <span className="vote-dot" aria-hidden="true" />}
            </button>
            {latestComment && <span className="event-comment-preview">{latestComment.name}: {latestComment.text}</span>}
          </div>
        )}
      </div>

      {modal && !isRecommendationDeadline && (ev.type !== 'other' || undated) && (
        <AttendanceModal ev={ev} place={place} list={eligibleAtt} members={eligibleMembers} initialMode={modal} readOnly={past} simple={undated} onClose={() => setModal(null)} />
      )}

      {setlistOpen &&
        (ev.type === 'show' ? (
          <ShowPlaylistSheet
            ev={ev}
            place={place}
            members={eligibleMembers}
            toast={toast}
            onClose={() => setSetlistOpen(false)}
          />
        ) : (
          <SetlistSheet
            ev={ev}
            place={place}
            members={eligibleMembers}
            toast={toast}
            onClose={() => setSetlistOpen(false)}
          />
        ))}


      {pollOpen && (
        <DatePollSheet ev={ev} votes={dateVotes} members={members} toast={toast} onClose={() => setPollOpen(false)} />
      )}

      {commentsOpen && (
        <EventCommentsSheet ev={ev} place={place} comments={comments} toast={toast} onClose={() => setCommentsOpen(false)} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`'${ev.title}' 일정을 삭제할까요? 참석 기록도 함께 사라져요.`}
          confirmLabel="삭제"
          cancelLabel="닫기"
          confirmVariant="danger-solid"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
