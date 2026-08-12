import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAuth } from '../auth'
import {
  addSetlistSong,
  removeSetlistSong,
  saveSetlistSong,
  watchAttendance,
  watchPlaylists,
  watchSetlist,
  watchTracks,
} from '../data'
import {
  isFixedPart,
  PART_META,
  PART_ORDER,
  type Attendance,
  type BandEvent,
  type Member,
  type Playlist,
  type SetlistSong,
  type Track,
} from '../types'
import { parseDate, weekday } from '../time'
import { thumbnailUrl } from '../youtube'
import type { ResolvedPlace } from '../place'
import ConfirmDialog from './ConfirmDialog'
import PartTally from './PartTally'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

/** 원본 곡을 찾기 위한 키 (재생목록이 달라도 곡 id 가 겹칠 수 있으므로 둘을 합쳐 쓴다) */
const trackKey = (playlistId: string, trackId: string) => playlistId + '/' + trackId

/**
 * 일정 카드 본문을 탭하면 열리는 합주곡 시트.
 * 합주곡은 재생목록에 담긴 곡 중에서 고르며, 추가·삭제는 관리자만 할 수 있다.
 * 곡별 파트 참여자는 스냅샷이 아니라 원본 곡에서 최신 값을 읽어 보여준다.
 */
export default function SetlistSheet({
  ev,
  place,
  members,
  toast,
  onClose,
}: {
  ev: BandEvent
  place: ResolvedPlace | null
  members: Member[]
  toast: ToastState
  onClose: () => void
}) {
  const { user, member } = useAuth()
  const isAdmin = !!member?.admin
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)

  const [songs, setSongs] = useState<SetlistSong[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [picking, setPicking] = useState(false)
  const [removing, setRemoving] = useState<SetlistSong | null>(null)
  // 편집 모드: 순서 드래그 + 곡 빼기 (재생목록 편집과 같은 개념, 관리자 전용)
  const [editMode, setEditMode] = useState(false)
  // 뒤로가기: 곡 고르기(SongPicker)가 열려 있으면 목록으로, 아니면 시트 닫기.
  // 곡 빼기 확인창은 ConfirmDialog 가 더 위에서 먼저 받는다.
  useBackHandler(() => (picking ? setPicking(false) : onClose()))
  // 참여자 표를 펼친 곡 id (한 번에 하나만 — 목록이 길어지지 않게)
  const [openId, setOpenId] = useState<string | null>(null)
  // 파트별 참석 표시용 — 참석 현황 모달과 같은 집계를 상단에 보여준다
  const [att, setAtt] = useState<Attendance[]>([])

  // 드래그 정렬용: 화면에 그릴 순서(items). 드래그 중이 아니면 songs 와 동기화
  const [items, setItems] = useState<SetlistSong[]>([])
  const draggingRef = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const dragRef = useRef<{ id: string; fromIndex: number; startY: number; target: number } | null>(null)
  const baseRef = useRef<SetlistSong[]>([])
  const rowHRef = useRef(56)

  useEffect(
    () =>
      watchSetlist(ev.id, setSongs, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '합주곡을 불러올 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
            : '합주곡을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [ev.id],
  )
  // 드래그 중이 아닐 때만 최신 목록 반영 (드래그 중 재정렬이 튕기지 않도록)
  useEffect(() => {
    if (!draggingRef.current) setItems(songs)
  }, [songs])
  useEffect(() => watchAttendance(ev.id, setAtt, () => {}), [ev.id])

  // 담긴 곡들의 원본을 구독해 파트 참여자를 항상 최신으로 표시한다.
  // 재생목록 구성이 바뀔 때만 재구독하도록 id 목록을 문자열로 고정해서 의존성으로 쓴다.
  const [tracks, setTracks] = useState<Map<string, Track>>(new Map())
  const playlistIds = useMemo(
    () => [...new Set(songs.map((s) => s.playlistId))].sort().join(','),
    [songs],
  )
  useEffect(() => {
    if (!playlistIds) {
      setTracks(new Map())
      return
    }
    const byList = new Map<string, Track[]>()
    const unsubs = playlistIds.split(',').map((pid) =>
      watchTracks(pid, (list) => {
        byList.set(pid, list)
        const next = new Map<string, Track>()
        byList.forEach((ts, p) => ts.forEach((t) => next.set(trackKey(p, t.id), t)))
        setTracks(next)
      }),
    )
    return () => unsubs.forEach((u) => u())
  }, [playlistIds])

  const memberMap = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members])

  /* ----- 드래그로 합주 순서 바꾸기 (재생목록 곡 정렬과 같은 방식) ----- */
  function onDragStart(e: ReactPointerEvent, id: string) {
    const idx = items.findIndex((s) => s.id === id)
    if (idx < 0) return
    const rowEl = (e.currentTarget as HTMLElement).closest('.setlist-row') as HTMLElement | null
    rowHRef.current = (rowEl?.offsetHeight ?? 48) + 8 // setlist-list gap 8px 포함
    draggingRef.current = true
    baseRef.current = items
    dragRef.current = { id, fromIndex: idx, startY: e.clientY, target: idx }
    setDragId(id)
    setDragDy(0)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }
  function onDragMove(e: ReactPointerEvent) {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    const shift = Math.round(dy / rowHRef.current)
    const target = Math.max(0, Math.min(baseRef.current.length - 1, d.fromIndex + shift))
    if (target !== d.target) {
      const arr = baseRef.current.slice()
      const [moved] = arr.splice(d.fromIndex, 1)
      arr.splice(target, 0, moved)
      setItems(arr)
      d.target = target
    }
    setDragDy(dy - (d.target - d.fromIndex) * rowHRef.current)
  }
  async function onDragEnd(e: ReactPointerEvent) {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setDragId(null)
    setDragDy(0)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (d.target === d.fromIndex) {
      draggingRef.current = false
      setItems(songs)
      return
    }
    // 옮긴 자리의 앞뒤 곡 사이 값으로 order 를 계산해 옮긴 곡만 저장
    const arr = baseRef.current.slice()
    const [moved] = arr.splice(d.fromIndex, 1)
    arr.splice(d.target, 0, moved)
    const ord = (s?: SetlistSong) => (s ? (s.order ?? s.addedAt) : undefined)
    const prev = ord(arr[d.target - 1])
    const next = ord(arr[d.target + 1])
    let newOrder: number
    if (prev === undefined) newOrder = (next ?? Date.now()) - 1000
    else if (next === undefined) newOrder = prev + 1000
    else newOrder = (prev + next) / 2
    setItems(arr) // 저장 반영 전까지 화면 유지
    try {
      await saveSetlistSong(ev.id, { ...moved, order: newOrder })
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '순서를 바꿀 권한이 없어요.' : '순서를 저장하지 못했어요.')
      setItems(songs)
      console.error(err)
    } finally {
      draggingRef.current = false
    }
  }

  async function doRemove(song: SetlistSong) {
    setRemoving(null)
    try {
      await removeSetlistSong(ev.id, song.id)
      toast.show('합주곡에서 뺐어요')
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '삭제 권한이 없어요.' : '곡을 빼지 못했어요.')
      console.error(e)
    }
  }

  const d = parseDate(ev.date)

  if (picking) {
    return (
      <SongPicker
        ev={ev}
        added={songs}
        toast={toast}
        onBack={() => setPicking(false)}
        onClose={onClose}
      />
    )
  }

  return (
    <>
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}>
            <div className="grab" />
          </div>

          <div className="setlist-head">
            <h2>{ev.title}</h2>
            <p>
              {d.getMonth() + 1}월 {d.getDate()}일 ({weekday(ev.date)}) · {ev.rehStart}–{ev.rehEnd}
              {place && <> · {place.name}</>}
            </p>
          </div>

          {/* 파트별 참석 — 참석 현황 모달과 같은 컴포넌트 */}
          <PartTally members={members} att={att} className="setlist-part-tally" />

          {loadErr && <div className="banner-err">{loadErr}</div>}

          <div className="setlist-count">
            <span className="part-bar-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </span>
            {songs.length === 0 ? '합주곡 없음' : `합주곡 ${songs.length}곡`}
            {/* 수정(연필)/완료(체크) — 편집 대상인 곡 목록 바로 위에 둔다 */}
            {isAdmin &&
              (editMode ? (
                <button
                  type="button"
                  className="edit-btn done setlist-edit"
                  onClick={() => setEditMode(false)}
                  aria-label="합주곡 편집 완료"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="edit-btn setlist-edit"
                  onClick={() => {
                    setOpenId(null) // 펼쳐 둔 참여자 표는 접고 들어간다 (행 높이를 고르게)
                    setEditMode(true)
                  }}
                  aria-label="합주곡 순서·삭제 수정"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
              ))}
          </div>

          {songs.length === 0 ? (
            <p className="setlist-empty">
              {isAdmin
                ? '아직 담은 곡이 없어요. 아래 ‘곡 추가’로 재생목록에서 골라 담아보세요.'
                : '아직 담은 곡이 없어요. 관리자가 곡을 담으면 여기에 표시돼요.'}
            </p>
          ) : (
            <>
              {editMode && (
                <p className="hint reorder-hint">오른쪽 손잡이를 잡고 위아래로 끌면 합주 순서가 바뀝니다. ×를 누르면 곡을 뺍니다.</p>
              )}
              <ol className="setlist-list">
                {items.map((s, i) => {
                  const track = tracks.get(trackKey(s.playlistId, s.id))
                  const joined = Object.keys(track?.participants ?? {}).length
                  const open = openId === s.id
                  return (
                    <li
                      key={s.id}
                      className={
                        'setlist-row' + (editMode ? ' editing' : '') + (s.id === dragId ? ' dragging' : '')
                      }
                      style={s.id === dragId ? { transform: `translateY(${dragDy}px)` } : undefined}
                    >
                      <div className="setlist-rowhead">
                        <span className="setlist-no">{i + 1}</span>
                        <div className="track-thumb sm">
                          {s.thumbnail || s.videoId ? (
                            <img src={s.thumbnail || thumbnailUrl(s.videoId ?? '')} alt="" loading="lazy" />
                          ) : null}
                        </div>
                        <div className="setlist-body">
                          <div className="track-info">
                            <h3>{s.title || '(제목 없음)'}</h3>
                            {s.artist && <p>{s.artist}</p>}
                          </div>
                        </div>
                        {editMode ? (
                          <>
                            <button
                              type="button"
                              className="edit-btn del setlist-del"
                              onClick={() => setRemoving(s)}
                              aria-label={`${s.title} 빼기`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                            <div
                              className="drag-handle"
                              onPointerDown={(e) => onDragStart(e, s.id)}
                              onPointerMove={onDragMove}
                              onPointerUp={onDragEnd}
                              onPointerCancel={onDragEnd}
                              aria-label="끌어서 합주 순서 변경"
                              role="button"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16M4 16h16" /></svg>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="setlist-toggle"
                            onClick={() => setOpenId(open ? null : s.id)}
                            aria-expanded={open}
                            aria-label={`${s.title} 참여자 ${open ? '접기' : '펼치기'}`}
                          >
                            <span className="setlist-joined">{joined}</span>
                            <svg
                              className={'track-open-chev' + (open ? ' open' : '')}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* 편집 중에는 접어 둔다 — 드래그 위치 계산이 고른 행 높이에 기댄다 */}
                      {!editMode && open && (
                        <PartGrid track={track} memberMap={memberMap} myUid={user?.uid} />
                      )}
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          <div className="actions">
            {isAdmin ? (
              <>
                <button type="button" className="btn primary" onClick={() => setPicking(true)}>
                  곡 추가
                </button>
                <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
              </>
            ) : (
              <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
            )}
          </div>
        </div>
      </div>

      {removing && (
        <ConfirmDialog
          message={`'${removing.title}'을(를) 합주곡에서 뺄까요?`}
          confirmLabel="빼기"
          cancelLabel="닫기"
          danger
          onConfirm={() => void doRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

/**
 * 곡을 펼쳤을 때 나오는 파트별 참여자 표 (원본 곡의 participants 기준).
 * 상단 '파트별 참석'과 같은 칸 구조라 곡을 여러 개 펼쳐도 파트 열이 세로로 맞아떨어진다.
 * 고정 파트 5칸은 인원이 없어도 늘 그리고, 임의 라벨(코러스·MC 등)은 뒤에 덧붙인다.
 */
function PartGrid({
  track,
  memberMap,
  myUid,
}: {
  track: Track | undefined
  memberMap: Map<string, Member>
  myUid: string | undefined
}) {
  if (!track) return <p className="setlist-parts none">원본 곡을 찾을 수 없어요</p>

  const parts = track.participants ?? {}
  const uids = Object.keys(parts)
  const fixed = PART_ORDER.map((p) => ({
    key: p as string,
    label: PART_META[p].label,
    uids: uids.filter((u) => parts[u] === p),
  }))
  const labels: string[] = []
  uids.forEach((u) => {
    const v = parts[u]
    if (!isFixedPart(v) && !labels.includes(v)) labels.push(v)
  })
  const custom = labels.map((label) => ({
    key: 'custom:' + label,
    label,
    uids: uids.filter((u) => parts[u] === label),
  }))

  return (
    <div className="part-tally-grid setlist-part-grid">
      {[...fixed, ...custom].map((g) => (
        <div key={g.key} className="part-cell">
          <div className="part-head">{g.label} <b>{g.uids.length}</b></div>
          <ul>
            {g.uids.length === 0 && <li className="muted">-</li>}
            {g.uids.map((u) => (
              <li key={u} className={u === myUid ? 'me' : undefined}>
                {memberMap.get(u)?.name ?? '(탈퇴)'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** 곡 고르기 — 재생목록을 먼저 고르고, 그 안의 곡을 담는다 (관리자 전용) */
function SongPicker({
  ev,
  added,
  toast,
  onBack,
  onClose,
}: {
  ev: BandEvent
  added: SetlistSong[]
  toast: ToastState
  onBack: () => void
  onClose: () => void
}) {
  const { user } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [open, setOpen] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => watchPlaylists(setPlaylists), [])
  useEffect(() => {
    if (!open) {
      setTracks([])
      return
    }
    return watchTracks(open.id, setTracks)
  }, [open])

  const addedIds = useMemo(() => new Set(added.map((s) => s.id)), [added])
  // 새로 담는 곡은 항상 맨 아래로
  const nextOrder = useMemo(
    () => added.reduce((max, s) => Math.max(max, s.order ?? s.addedAt), 0) + 1000,
    [added],
  )

  async function add(t: Track) {
    if (!open || !user || busyId) return
    setBusyId(t.id)
    try {
      await addSetlistSong(ev.id, {
        id: t.id,
        playlistId: open.id,
        playlistName: open.name,
        title: t.title,
        artist: t.artist,
        videoId: t.videoId,
        thumbnail: t.thumbnail,
        order: nextOrder,
        addedBy: user.uid,
        addedAt: Date.now(),
      })
      toast.show(`'${t.title}'을(를) 담았어요`)
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '곡을 담을 권한이 없어요.' : '곡을 담지 못했어요.')
      console.error(e)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>

        <div className="picker-bar">
          <button
            type="button"
            className="detail-back"
            onClick={() => (open ? setOpen(null) : onBack())}
            aria-label="뒤로"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <h2 className="detail-title">{open ? open.name : '재생목록 선택'}</h2>
        </div>

        {!open ? (
          playlists.length === 0 ? (
            <p className="setlist-empty">재생목록이 없어요. 음악 탭에서 먼저 만들어 주세요.</p>
          ) : (
            <div className="picker-list">
              {playlists.map((p) => (
                <button key={p.id} type="button" className="picker-row" onClick={() => setOpen(p)}>
                  <span className="picker-name">{p.name}</span>
                  <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              ))}
            </div>
          )
        ) : tracks.length === 0 ? (
          <p className="setlist-empty">이 재생목록에는 곡이 없어요.</p>
        ) : (
          <div className="picker-list">
            {tracks.map((t) => {
              const already = addedIds.has(t.id)
              return (
                <div key={t.id} className={'track-row' + (already ? ' added' : '')}>
                  <div className="track-thumb sm">
                    {t.thumbnail || t.videoId ? (
                      <img src={t.thumbnail || thumbnailUrl(t.videoId)} alt="" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="track-info">
                    <h3>{t.title || '(제목 없음)'}</h3>
                    {t.artist && <p>{t.artist}</p>}
                  </div>
                  <button
                    type="button"
                    className={'btn ' + (already ? 'subtle' : 'primary') + ' picker-add'}
                    onClick={() => void add(t)}
                    disabled={already || busyId !== null}
                  >
                    {already ? '담김' : '담기'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn subtle block" onClick={onBack}>
            합주곡 목록으로
          </button>
        </div>
      </div>
    </div>
  )
}
