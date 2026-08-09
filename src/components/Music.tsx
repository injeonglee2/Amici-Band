import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAuth } from '../auth'
import {
  deletePlaylist,
  deleteTrack,
  newId,
  savePlaylist,
  saveTrack,
  watchPlaylists,
  watchTracks,
} from '../data'
import type { Playlist, Track } from '../types'
import { fetchYouTubeMeta, parseVideoId, thumbnailUrl, watchUrl } from '../youtube'
import SetlistPlayer from './SetlistPlayer'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'

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
  // 재생목록별 옵션: 곡 추가한 사람 표시 (기본 표시)
  const showAdder = playlist.showAdder !== false
  const [tracks, setTracks] = useState<Track[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  // 편집 모드: 제목 인라인 수정 + 곡 드래그 정렬 + 삭제
  const [editMode, setEditMode] = useState(false)
  const [titleDraft, setTitleDraft] = useState(playlist.name)
  // 삭제 확인 다이얼로그 (재생목록/곡 공용)
  const [confirm, setConfirm] = useState<{ message: string; label: string; run: () => Promise<void> } | null>(null)

  // 드래그 정렬용: 화면에 그릴 순서(items). 드래그 중이 아니면 tracks 와 동기화
  const [items, setItems] = useState<Track[]>([])
  const draggingRef = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const dragRef = useRef<{ id: string; fromIndex: number; startY: number; target: number } | null>(null)
  const baseRef = useRef<Track[]>([])
  const rowHRef = useRef(56)

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

  const playingIndex = items.findIndex((t) => t.id === playingId)
  const playing = playingIndex >= 0 ? items[playingIndex] : null

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
                <p className="hint reorder-hint">곡 오른쪽 손잡이를 잡고 위아래로 끌어 순서를 바꿀 수 있어요.</p>
              </>
            ) : (
              <div className="setlist-actions">
                <button className="btn primary play-all" onClick={playAll}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  전체 재생
                </button>
              </div>
            )}
            <div className="list track-list">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={
                    'track-row' +
                    (t.id === playingId ? ' playing' : '') +
                    (t.id === dragId ? ' dragging' : '')
                  }
                  style={t.id === dragId ? { transform: `translateY(${dragDy}px)` } : undefined}
                >
                  {editMode ? (
                    <>
                      <div className="track-thumb sm">
                        {t.thumbnail || t.videoId ? (
                          <img src={t.thumbnail || thumbnailUrl(t.videoId)} alt="" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="track-info">
                        <h3>{t.title || '(제목 없음)'}</h3>
                        {t.artist && <p>{t.artist}</p>}
                      </div>
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
                    </>
                  ) : (
                    <>
                      <button className="track-link" onClick={() => playTrack(t.id)}>
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
                        <div className="track-info">
                          <h3>{t.title || '(제목 없음)'}</h3>
                          {t.artist && <p>{t.artist}</p>}
                        </div>
                      </button>
                      {showAdder && t.addedByName && (
                        <span className="track-adder" title={`${t.addedByName}님이 추가`}>{t.addedByName}</span>
                      )}
                    </>
                  )}
                </div>
              ))}
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
    </>
  )
}

/* ---------------- 곡 추가 시트 (유튜브 링크 → 제목·가수 자동 입력) ---------------- */
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
  const [url, setUrl] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
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

  // 링크 입력이 바뀌면 영상 ID 를 파싱하고, 유효하면 메타데이터 자동 조회
  function onUrlChange(v: string) {
    setUrl(v)
    setErr('')
    const id = parseVideoId(v)
    setVideoId(id)
    if (id) loadMeta(id)
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
          <label htmlFor="tr-url">유튜브 링크</label>
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
            링크를 넣으면 제목·가수를 자동으로 채워줘요.
            {fetching && <> <b>불러오는 중…</b></>}
            {!fetching && url.trim() && !videoId && <> <b className="err-text">유튜브 링크가 아니에요.</b></>}
          </p>
        </div>

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
