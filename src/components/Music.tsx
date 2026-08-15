import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAuth } from '../auth'
import {
  deletePlaylist,
  deleteTrack,
  newId,
  savePlaylist,
  saveTrack,
  watchMembers,
  watchPlaylists,
  watchTracks,
} from '../data'
import type { Member, Playlist, Track } from '../types'
import { isFixedPart, PART_META } from '../types'
import {
  fetchPlaylistItems,
  fetchYouTubeMeta,
  parsePlaylistId,
  parseVideoId,
  PlaylistImportError,
  searchYouTube,
  thumbnailUrl,
  watchUrl,
  type YouTubeSearchResult,
} from '../youtube'
import SetlistPlayer from './SetlistPlayer'
import ParticipationSheet from './ParticipationSheet'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'
import { DEMO } from '../demo'
import { exportErrorMessage, exportPlaylistToYouTube, YouTubeExportError, type ExportResult } from '../ytexport'

type EditingList = Playlist | 'new' | null

/** 음악 뷰 — 하단 네비 '음악' 탭. 재생목록(폴더) 목록 + 상세(곡 목록) */
export default function MusicView({ toast }: { toast: ToastState }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingList>(null)

  useEffect(
    () =>
      watchPlaylists(setPlaylists, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '재생목록을 불러올 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
            : '재생목록을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )

  const open = playlists.find((p) => p.id === openId) ?? null

  // 재생목록 상세 (곡 목록)
  if (open) {
    return <PlaylistDetail playlist={open} toast={toast} onBack={() => setOpenId(null)} />
  }

  // 재생목록 목록 (폴더)
  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {playlists.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            <p>재생목록이 없어요.<br />아래 <b>+ 재생목록</b>으로 시작하세요.</p>
          </div>
        ) : (
          <div className="list playlist-list">
            {playlists.map((p) => (
              <button key={p.id} className="playlist-row" onClick={() => setOpenId(p.id)}>
                <div className="playlist-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                </div>
                <div className="playlist-info">
                  <h3>{p.name}</h3>
                </div>
                <svg className="playlist-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setEditing('new')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        재생목록
      </button>

      {editing !== null && (
        <PlaylistForm
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDeleted={() => setEditing(null)}
        />
      )}
    </>
  )
}

/* ---------------- 재생목록 만들기/수정 시트 ---------------- */
function PlaylistForm({
  editing,
  onClose,
  onDeleted,
}: {
  editing: Playlist | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose) // 뒤로가기로 재생목록 폼 닫기
  const [name, setName] = useState(editing?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const valid = name.trim().length > 0

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setErr('')
    try {
      const p: Playlist = {
        id: editing?.id ?? newId(),
        name: name.trim(),
        createdBy: editing?.createdBy ?? member?.uid ?? '',
        createdAt: editing?.createdAt ?? Date.now(),
      }
      await savePlaylist(p)
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '저장 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
          : '저장에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!confirm('이 재생목록을 삭제할까요? 담아둔 곡도 함께 사라집니다.')) return
    setBusy(true)
    try {
      await deletePlaylist(editing.id)
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>{editing ? '재생목록 수정' : '새 재생목록'}</h2>

        <div className="field">
          <label htmlFor="pl-name">재생목록 이름</label>
          <input
            id="pl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            placeholder="예) 이번 공연 셋리스트"
            maxLength={40}
            autoFocus
          />
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          {editing && <button type="button" className="btn danger" onClick={remove} disabled={busy}>삭제</button>}
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 재생목록 상세 (곡 목록) ---------------- */
function PlaylistDetail({
  playlist,
  toast,
  onBack,
}: {
  playlist: Playlist
  toast: ToastState
  onBack: () => void
}) {
  const { member } = useAuth()
  // 재생목록별 옵션: 곡 추가한 사람 표시 (기본 표시)
  const showAdder = playlist.showAdder !== false
  const [tracks, setTracks] = useState<Track[]>([])
  // 파트별 참여 집계용: 전체 멤버 명단(uid→이름/파트) 구독
  const [members, setMembers] = useState<Member[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  // 편집 모드: 제목 인라인 수정 + 곡 드래그 정렬 + 삭제 + 곡 정보 수정
  const [editMode, setEditMode] = useState(false)
  // '내 참여곡만' 필터 (내가 참여한 곡만 보기)
  const [mineOnly, setMineOnly] = useState(false)
  const [titleDraft, setTitleDraft] = useState(playlist.name)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  // 파트 참여 팝업(시트)을 띄운 곡 id. 곡 데이터는 tracks 에서 최신값을 다시 찾아 전달
  const [participatingId, setParticipatingId] = useState<string | null>(null)
  // 삭제 확인 다이얼로그 (재생목록/곡 공용)
  const [confirm, setConfirm] = useState<{ message: string; label: string; run: () => Promise<void> } | null>(null)
  // 유튜브 내보내기
  const [exportAsk, setExportAsk] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState<ExportResult | null>(null)

  // 드래그 정렬용: 화면에 그릴 순서(items). 드래그 중이 아니면 tracks 와 동기화
  const [items, setItems] = useState<Track[]>([])
  const draggingRef = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const dragRef = useRef<{ id: string; fromIndex: number; startY: number; target: number } | null>(null)
  const baseRef = useRef<Track[]>([])
  const rowHRef = useRef(56)

  // 뒤로가기: 편집 중이면 편집 종료(제목 저장), 아니면 재생목록 목록으로.
  // 위에 열린 곡추가·곡수정·참여·재생기·확인창은 각 컴포넌트가 먼저 받는다.
  useBackHandler(() => (editMode ? void exitEdit() : back()))

  useEffect(
    () =>
      watchTracks(playlist.id, setTracks, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '곡을 불러올 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
            : '곡을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [playlist.id],
  )
  // 드래그 중이 아닐 때만 최신 목록 반영 (드래그 중 재정렬이 튕기지 않도록)
  useEffect(() => {
    if (!draggingRef.current) setItems(tracks)
  }, [tracks])
  // 멤버 명단 구독 (참여자 uid → 이름/파트 매핑용)
  useEffect(() => watchMembers(setMembers, () => {}), [])
  const memberMap = new Map(members.map((m) => [m.uid, m]))

  const playingIndex = items.findIndex((t) => t.id === playingId)
  const playing = playingIndex >= 0 ? items[playingIndex] : null

  // 내 참여곡: 각 곡의 participants 에 내 uid 가 있으면 참여. 파트 라벨은 고정 파트면 한글, 임의 라벨이면 그대로.
  const myUid = member?.uid
  const myPartOf = (t: Track): string | undefined => {
    const v = myUid ? t.participants?.[myUid] : undefined
    return v === undefined ? undefined : isFixedPart(v) ? PART_META[v].label : v
  }
  const myCount = myUid ? items.filter((t) => t.participants?.[myUid] !== undefined).length : 0
  // 편집 모드에선 항상 전체(순서 변경용). 아니면 '내 참여곡만' 필터 적용(내 곡이 없으면 전체)
  const rows =
    editMode || !mineOnly || myCount === 0
      ? items
      : items.filter((t) => myUid && t.participants?.[myUid] !== undefined)

  function playTrack(id: string) {
    setPlayingId(id)
  }
  function playAll() {
    if (items.length === 0) return
    setPlayingId(items[0].id)
  }
  function playNext() {
    if (playingIndex >= 0 && playingIndex < items.length - 1) setPlayingId(items[playingIndex + 1].id)
  }
  function playPrev() {
    if (playingIndex > 0) setPlayingId(items[playingIndex - 1].id)
  }
  // 곡이 끝나면 다음 곡으로 (연속재생). 마지막 곡이면 그대로 멈춤
  function onTrackEnded() {
    if (playingIndex >= 0 && playingIndex < items.length - 1) setPlayingId(items[playingIndex + 1].id)
  }

  /* ----- 유튜브(=유튜브 뮤직) 재생목록으로 내보내기 ----- */
  function startExport() {
    if (DEMO) {
      toast.show('데모에서는 내보내기를 쓸 수 없어요')
      return
    }
    if (items.length === 0) return
    setExportAsk(true)
  }
  async function runExport() {
    const videoIds = items.map((t) => t.videoId).filter(Boolean)
    if (videoIds.length === 0) return
    setExporting(true)
    try {
      const result = await exportPlaylistToYouTube(playlist.name, videoIds, (a, t) =>
        toast.show(`${a} / ${t}곡 저장 중…`),
      )
      setExportDone(result)
      toast.show(`유튜브에 ${result.added}곡 저장했어요`)
    } catch (e) {
      const code = e instanceof YouTubeExportError ? e.code : ''
      const msg = exportErrorMessage(code)
      if (msg) toast.show(msg) // 취소(CANCELLED)는 빈 문자열 → 조용히 무시
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  /* ----- 제목 인라인 수정 ----- */
  function enterEdit() {
    setTitleDraft(playlist.name)
    setEditMode(true)
  }
  async function commitTitle() {
    const name = titleDraft.trim()
    if (!name || name === playlist.name) return
    try {
      await savePlaylist({ ...playlist, name })
    } catch (e) {
      console.error(e)
    }
  }
  async function exitEdit() {
    await commitTitle()
    setEditMode(false)
  }
  function back() {
    if (editMode) void commitTitle()
    onBack()
  }
  async function toggleShowAdder() {
    try {
      await savePlaylist({ ...playlist, showAdder: !showAdder })
    } catch (e) {
      console.error(e)
    }
  }
  // 삭제 확인은 앱 자체 다이얼로그 사용 (일부 환경에서 window.confirm 이 무시됨)
  function removePlaylistNow() {
    setConfirm({
      message: '이 재생목록을 삭제할까요? 담아둔 곡도 함께 사라집니다.',
      label: '삭제',
      run: async () => {
        try {
          await deletePlaylist(playlist.id)
          onBack()
        } catch (e) {
          console.error(e)
        }
      },
    })
  }

  function removeTrack(t: Track) {
    setConfirm({
      message: `"${t.title || '이 곡'}" 을(를) 재생목록에서 뺄까요?`,
      label: '빼기',
      run: async () => {
        try {
          if (playingId === t.id) setPlayingId(null)
          await deleteTrack(playlist.id, t.id)
          toast.show('곡을 뺐어요')
        } catch (e) {
          console.error(e)
        }
      },
    })
  }

  /* ----- 드래그로 순서 바꾸기 (슬라이드) ----- */
  function onDragStart(e: ReactPointerEvent, id: string) {
    const idx = items.findIndex((t) => t.id === id)
    if (idx < 0) return
    const rowEl = (e.currentTarget as HTMLElement).closest('.track-row') as HTMLElement | null
    rowHRef.current = (rowEl?.offsetHeight ?? 48) + 8 // track-list gap 8px 포함
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
      setItems(tracks)
      return
    }
    // 옮긴 위치의 앞뒤 곡 사이 값으로 order 계산해 옮긴 곡만 저장
    const arr = baseRef.current.slice()
    const [moved] = arr.splice(d.fromIndex, 1)
    arr.splice(d.target, 0, moved)
    const ord = (t?: Track) => (t ? (t.order ?? t.addedAt) : undefined)
    const prev = ord(arr[d.target - 1])
    const next = ord(arr[d.target + 1])
    let newOrder: number
    if (prev === undefined) newOrder = (next ?? Date.now()) - 1000
    else if (next === undefined) newOrder = prev + 1000
    else newOrder = (prev + next) / 2
    setItems(arr) // 저장 반영 전까지 화면 유지
    try {
      await saveTrack(playlist.id, { ...moved, order: newOrder })
    } catch (err) {
      console.error(err)
    } finally {
      draggingRef.current = false
    }
  }

  return (
    <>
      <div className={'detail-bar' + (editMode ? ' editing' : '')}>
        <button className="detail-back" onClick={back} aria-label="재생목록 목록으로">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        {editMode ? (
          <input
            className="detail-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void exitEdit() } }}
            placeholder="재생목록 이름"
            maxLength={40}
            autoFocus
          />
        ) : (
          <h2 className="detail-title">{playlist.name}</h2>
        )}
        {editMode ? (
          <>
            <button className="edit-btn danger-ico" onClick={removePlaylistNow} aria-label="재생목록 삭제">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </button>
            <button className="edit-btn done" onClick={() => void exitEdit()} aria-label="완료">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          </>
        ) : (
          <button className="edit-btn" onClick={enterEdit} aria-label="재생목록 수정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        )}
      </div>

      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {playing && (
          <SetlistPlayer
            track={playing}
            index={playingIndex}
            total={items.length}
            hasPrev={playingIndex > 0}
            hasNext={playingIndex < items.length - 1}
            onPrev={playPrev}
            onNext={playNext}
            onEnded={onTrackEnded}
            onClose={() => setPlayingId(null)}
          />
        )}

        {items.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            <p>담은 곡이 없어요.<br />아래 <b>+ 곡 추가</b>로 유튜브 링크를 넣어보세요.</p>
          </div>
        ) : (
          <>
            {editMode ? (
              <>
                <div className="playlist-option">
                  <span>곡 추가한 사람 표시</span>
                  <button
                    className={'switch' + (showAdder ? ' on' : '')}
                    role="switch"
                    aria-checked={showAdder}
                    aria-label="곡 추가한 사람 표시"
                    onClick={toggleShowAdder}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
                <p className="hint reorder-hint">곡을 누르면 제목·가수를 수정할 수 있어요. 오른쪽 손잡이를 잡고 위아래로 끌면 순서가 바뀝니다.</p>
              </>
            ) : (
              <div className="setlist-actions">
                <button className="btn primary play-all" onClick={playAll}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  전체 재생
                </button>
                <button className="btn subtle export-btn" onClick={startExport} disabled={exporting} title="유튜브 재생목록으로 저장">
                  {exporting ? (
                    '저장 중…'
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 15V9l5 3-5 3zM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity="0" /><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      유튜브 저장
                    </>
                  )}
                </button>
              </div>
            )}
            {!editMode && myUid && myCount > 0 && (
              <div className="track-filter">
                <button
                  type="button"
                  className={'chip mine-filter' + (mineOnly ? ' on' : '')}
                  aria-pressed={mineOnly}
                  onClick={() => setMineOnly((v) => !v)}
                >
                  내 참여곡만 <b>{myCount}</b>
                </button>
              </div>
            )}
            <div className="list track-list">
              {rows.map((t) =>
                editMode ? (
                  <div
                    key={t.id}
                    className={
                      'track-row' +
                      (t.id === playingId ? ' playing' : '') +
                      (t.id === dragId ? ' dragging' : '')
                    }
                    style={t.id === dragId ? { transform: `translateY(${dragDy}px)` } : undefined}
                  >
                    <button className="track-link" onClick={() => setEditingTrack(t)} aria-label="곡 정보 수정">
                      <div className="track-thumb sm">
                        {t.thumbnail || t.videoId ? (
                          <img src={t.thumbnail || thumbnailUrl(t.videoId)} alt="" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="track-info">
                        <h3>{t.title || '(제목 없음)'}</h3>
                        {t.artist && <p>{t.artist}</p>}
                      </div>
                      <span className="track-edit-ico" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                      </span>
                    </button>
                    <button className="edit-btn track-del" onClick={() => removeTrack(t)} aria-label="곡 빼기">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                    <div
                      className="drag-handle"
                      onPointerDown={(e) => onDragStart(e, t.id)}
                      onPointerMove={onDragMove}
                      onPointerUp={onDragEnd}
                      onPointerCancel={onDragEnd}
                      aria-label="끌어서 순서 변경"
                      role="button"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16M4 16h16" /></svg>
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className={'track-row' + (t.id === playingId ? ' playing' : '') + (myPartOf(t) ? ' mine' : '')}>
                    <button className="track-thumb-btn" onClick={() => playTrack(t.id)} aria-label="재생">
                      <div className="track-thumb">
                        {t.thumbnail || t.videoId ? (
                          <img src={t.thumbnail || thumbnailUrl(t.videoId)} alt="" loading="lazy" />
                        ) : null}
                        <span className="track-play" aria-hidden="true">
                          {t.id === playingId ? (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </span>
                      </div>
                    </button>
                    <button className="track-open" onClick={() => setParticipatingId(t.id)} aria-label="파트 참여 보기">
                      <div className="track-info">
                        <h3>{t.title || '(제목 없음)'}</h3>
                        {t.artist && <p>{t.artist}</p>}
                      </div>
                      {myPartOf(t) && (
                        <span className="track-mypart" title="내 파트">{myPartOf(t)}</span>
                      )}
                      {(() => {
                        const c = Object.keys(t.participants ?? {}).length
                        return c > 0 ? (
                          <span className="track-partcount" title={`참여 ${c}명`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            {c}
                          </span>
                        ) : null
                      })()}
                      {showAdder && t.addedByName && (
                        <span className="track-adder" title={`${t.addedByName}님이 추가`}>{t.addedByName}</span>
                      )}
                      <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        곡 추가
      </button>

      {adding && (
        <TrackForm playlistId={playlist.id} toast={toast} onClose={() => setAdding(false)} />
      )}

      {editingTrack && (
        <TrackEditForm
          playlistId={playlist.id}
          track={editingTrack}
          toast={toast}
          onClose={() => setEditingTrack(null)}
        />
      )}

      {(() => {
        // 팝업은 tracks 의 최신 곡 데이터를 사용 (참여 후 인원이 즉시 반영되도록)
        const active = participatingId ? tracks.find((t) => t.id === participatingId) : undefined
        if (!participatingId) return null
        if (!active) {
          // 곡이 사라졌으면 팝업 닫기
          return null
        }
        return (
          <ParticipationSheet
            playlistId={playlist.id}
            track={active}
            memberMap={memberMap}
            me={member}
            toast={toast}
            onClose={() => setParticipatingId(null)}
          />
        )
      })()}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.label}
          cancelLabel="취소"
          danger
          onConfirm={() => {
            const c = confirm
            setConfirm(null)
            void c.run()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {exportAsk && (
        <ConfirmDialog
          message={`이 재생목록(${items.length}곡)을 내 유튜브 계정에 재생목록으로 저장할까요? 유튜브 로그인·권한 창이 떠요.`}
          confirmLabel="저장"
          cancelLabel="취소"
          onConfirm={() => {
            setExportAsk(false)
            void runExport()
          }}
          onCancel={() => setExportAsk(false)}
        />
      )}

      {exportDone && (
        <ConfirmDialog
          message={`유튜브에 "${playlist.name}" 재생목록을 저장했어요 (${exportDone.added}/${exportDone.total}곡). 유튜브 뮤직에서 열까요?`}
          confirmLabel="열기"
          cancelLabel="닫기"
          onConfirm={() => {
            const url = exportDone.url
            setExportDone(null)
            window.open(url, '_blank', 'noopener')
          }}
          onCancel={() => setExportDone(null)}
        />
      )}
    </>
  )
}

/* ---------------- 곡 정보 수정 시트 (제목·가수) ---------------- */
function TrackEditForm({
  playlistId,
  track,
  toast,
  onClose,
}: {
  playlistId: string
  track: Track
  toast: ToastState
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose) // 뒤로가기로 곡 정보 수정 시트 닫기
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(track.artist)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const valid = title.trim().length > 0

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setErr('')
    try {
      // saveTrack 은 문서 전체를 덮어쓰므로 기존 필드를 유지한 채 제목·가수만 교체
      await saveTrack(playlistId, { ...track, title: title.trim(), artist: artist.trim() })
      toast.show('곡 정보를 수정했어요')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '저장 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
          : '저장에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>곡 정보 수정</h2>

        {(track.thumbnail || track.videoId) && (
          <div className="track-preview">
            <img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" />
          </div>
        )}

        <div className="field">
          <label htmlFor="te-title">곡 제목</label>
          <input
            id="te-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) Bohemian Rhapsody"
            maxLength={120}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="te-artist">가수 (선택)</label>
          <input
            id="te-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="예) Queen"
            maxLength={80}
          />
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

function importErrorMessage(code: string): string {
  switch (code) {
    case 'NOT_FOUND':
      return '재생목록을 찾을 수 없어요. 비공개라면 유튜브에서 공개·일부공개로 바꾼 뒤 다시 시도해 주세요.'
    case 'FORBIDDEN':
      return '가져올 수 없어요. YouTube Data API가 켜져 있는지(키 설정) 확인이 필요해요.'
    case 'QUOTA':
      return '오늘 YouTube API 사용량을 초과했어요. 잠시 후 다시 시도해 주세요.'
    case 'NO_KEY':
      return 'YouTube API 키가 설정돼 있지 않아요.'
    default:
      return '재생목록을 가져오지 못했어요.'
  }
}

/* ---------------- 곡 추가 시트 (유튜브 링크 → 제목·가수 자동 입력 / 재생목록 일괄 가져오기) ---------------- */
function TrackForm({
  playlistId,
  toast,
  onClose,
}: {
  playlistId: string
  toast: ToastState
  onClose: () => void
}) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose) // 뒤로가기로 곡 추가 시트 닫기
  const [url, setUrl] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  // 유튜브 검색
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YouTubeSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  // 같은 링크로 중복 조회 방지 + 최신 조회만 반영
  const lastFetchedId = useRef<string | null>(null)
  const reqSeq = useRef(0)

  async function loadMeta(id: string) {
    if (lastFetchedId.current === id) return
    lastFetchedId.current = id
    const seq = ++reqSeq.current
    setFetching(true)
    setHint('')
    try {
      const meta = await fetchYouTubeMeta(id)
      if (seq !== reqSeq.current) return // 더 최신 요청이 있으면 버림
      setTitle(meta.title)
      setArtist(meta.artist)
      if (!meta.title) setHint('제목을 자동으로 못 가져왔어요. 직접 입력해 주세요.')
    } catch {
      if (seq === reqSeq.current) setHint('정보를 못 가져왔어요. 직접 입력해 주세요.')
    } finally {
      if (seq === reqSeq.current) setFetching(false)
    }
  }

  // 유튜브 검색 (버튼/엔터로만 — 할당량 절약)
  async function runSearch() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchErr('')
    try {
      const list = await searchYouTube(q)
      setResults(list)
    } catch (e) {
      const code = e instanceof PlaylistImportError ? e.code : ''
      setResults(null)
      setSearchErr(
        code === 'QUOTA'
          ? '오늘 검색 사용량을 초과했어요. 잠시 후 다시 시도해 주세요.'
          : code === 'FORBIDDEN' || code === 'NO_KEY'
            ? '검색을 쓸 수 없어요. YouTube API 키 설정을 확인해 주세요.'
            : '검색에 실패했어요.',
      )
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  // 검색 결과 선택 → 폼에 채우기 (제목·가수 수정 후 담기 가능)
  function pickResult(r: YouTubeSearchResult) {
    lastFetchedId.current = r.videoId // oEmbed 재조회 방지
    setUrl(watchUrl(r.videoId))
    setVideoId(r.videoId)
    setListId(null)
    setTitle(r.title)
    setArtist(r.artist)
    setResults(null)
    setQuery('')
    setErr('')
    setHint('')
  }

  // 링크 입력이 바뀌면 영상 ID·재생목록 ID 를 파싱. 영상이면 메타데이터 자동 조회
  function onUrlChange(v: string) {
    setUrl(v)
    setErr('')
    setListId(parsePlaylistId(v))
    const id = parseVideoId(v)
    setVideoId(id)
    if (id) loadMeta(id)
  }

  // 재생목록 URL 의 곡을 모두 이 재생목록에 담기
  async function importAll() {
    if (!listId || importing) return
    setImporting(true)
    setErr('')
    setImportMsg('곡 목록을 불러오는 중…')
    try {
      const songs = await fetchPlaylistItems(listId)
      if (songs.length === 0) {
        setImportMsg('')
        setErr('가져올 곡이 없어요. (비공개이거나 빈 재생목록일 수 있어요)')
        return
      }
      const base = Date.now()
      let done = 0
      for (const s of songs) {
        const t: Track = {
          id: newId(),
          url: s.url,
          videoId: s.videoId,
          title: s.title,
          artist: s.artist,
          thumbnail: s.thumbnail,
          order: base + done,
          addedBy: member?.uid ?? '',
          addedByName: member?.name,
          addedAt: base + done,
        }
        await saveTrack(playlistId, t)
        done++
        setImportMsg(`${done} / ${songs.length}곡 담는 중…`)
      }
      toast.show(`${done}곡을 담았어요`)
      onClose()
    } catch (e) {
      const code = e instanceof PlaylistImportError ? e.code : (e as { code?: string })?.code ?? ''
      setImportMsg('')
      setErr(importErrorMessage(code))
      console.error(e)
    } finally {
      setImporting(false)
    }
  }

  const valid = !!videoId && title.trim().length > 0

  async function submit() {
    if (busy) return
    if (!videoId) {
      setErr('유튜브 링크를 정확히 넣어주세요.')
      return
    }
    if (!title.trim()) {
      setErr('곡 제목을 입력해 주세요.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const nowMs = Date.now()
      const t: Track = {
        id: newId(),
        url: url.trim() || watchUrl(videoId),
        videoId,
        title: title.trim(),
        artist: artist.trim(),
        thumbnail: thumbnailUrl(videoId),
        order: nowMs, // 목록 맨 아래에 추가 (order 기본값 = 담은 시각)
        addedBy: member?.uid ?? '',
        addedByName: member?.name, // 추가한 사람 이름 스냅샷 (undefined 면 saveTrack 이 제거)
        addedAt: nowMs,
      }
      await saveTrack(playlistId, t)
      toast.show('곡을 담았어요')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '저장 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
          : '저장에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>곡 추가</h2>

        <div className="field">
          <label htmlFor="tr-search">유튜브에서 검색</label>
          <div className="yt-search">
            <input
              id="tr-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch() } }}
              placeholder="곡 제목·가수로 검색"
              maxLength={80}
            />
            <button type="button" className="btn primary yt-search-btn" onClick={() => void runSearch()} disabled={!query.trim() || searching}>
              {searching ? '…' : '검색'}
            </button>
          </div>
          {searchErr && <p className="err small">{searchErr}</p>}
          {results && results.length > 0 && (
            <ul className="yt-results">
              {results.map((r) => (
                <li key={r.videoId}>
                  <button type="button" onClick={() => pickResult(r)}>
                    <div className="track-thumb sm">
                      <img src={r.thumbnail} alt="" loading="lazy" />
                    </div>
                    <div className="track-info">
                      <h3>{r.title || '(제목 없음)'}</h3>
                      {r.artist && <p>{r.artist}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results && results.length === 0 && !searching && (
            <p className="hint">검색 결과가 없어요. 다른 검색어로 시도해 보세요.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="tr-url">또는 유튜브 링크</label>
          <input
            id="tr-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://youtu.be/… 또는 https://www.youtube.com/watch?v=…"
            autoFocus
          />
          <p className="hint">
            링크를 넣으면 제목·가수를 자동으로 채워줘요. 재생목록(플레이리스트) 링크를 넣으면 곡을 한 번에 가져올 수 있어요.
            {fetching && <> <b>불러오는 중…</b></>}
            {!fetching && url.trim() && !videoId && !listId && <> <b className="err-text">유튜브 링크가 아니에요.</b></>}
          </p>
        </div>

        {listId && (
          <div className="import-box">
            <div className="import-box-head">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13M3 12h13M3 18h9M17 12l4 2-4 2z" /></svg>
              <span>재생목록 링크예요 — 곡을 한 번에 가져올 수 있어요.</span>
            </div>
            <button type="button" className="btn primary block" onClick={importAll} disabled={importing}>
              {importing ? importMsg || '가져오는 중…' : '이 재생목록의 곡 전체 가져오기'}
            </button>
            <p className="hint">공개·일부공개 재생목록만 가져올 수 있어요. (비공개는 불가)</p>
          </div>
        )}

        {videoId && (
          <div className="track-preview">
            <img src={thumbnailUrl(videoId)} alt="" />
          </div>
        )}

        <div className="field">
          <label htmlFor="tr-title">곡 제목</label>
          <input
            id="tr-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) Bohemian Rhapsody"
            maxLength={120}
          />
        </div>

        <div className="field">
          <label htmlFor="tr-artist">가수 (선택)</label>
          <input
            id="tr-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="예) Queen"
            maxLength={80}
          />
        </div>

        {hint && <p className="hint">{hint}</p>}
        {err && <p className="err small">{err}</p>}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '담는 중…' : '담기'}</button>
        </div>
      </div>
    </div>
  )
}
