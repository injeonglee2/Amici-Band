import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import {
  addSetlistSong,
  removeSetlistSong,
  watchPlaylists,
  watchSetlist,
  watchTracks,
} from '../data'
import {
  isFixedPart,
  PART_META,
  PART_ORDER,
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
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'

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

          {loadErr && <div className="banner-err">{loadErr}</div>}

          <div className="setlist-count">
            <span className="part-bar-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </span>
            {songs.length === 0 ? '합주곡 없음' : `합주곡 ${songs.length}곡`}
          </div>

          {songs.length === 0 ? (
            <p className="setlist-empty">
              {isAdmin
                ? '아직 담은 곡이 없어요. 아래 ‘곡 추가’로 재생목록에서 골라 담아보세요.'
                : '아직 담은 곡이 없어요. 관리자가 곡을 담으면 여기에 표시돼요.'}
            </p>
          ) : (
            <ol className="setlist-list">
              {songs.map((s, i) => (
                <li key={s.id} className="setlist-row">
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
                    <PartLine
                      track={tracks.get(trackKey(s.playlistId, s.id))}
                      memberMap={memberMap}
                      myUid={user?.uid}
                    />
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      className="edit-btn del setlist-del"
                      onClick={() => setRemoving(s)}
                      aria-label={`${s.title} 빼기`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          <div className="actions">
            {isAdmin ? (
              <>
                <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
                <button type="button" className="btn primary" onClick={() => setPicking(true)}>
                  곡 추가
                </button>
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

/** 곡 한 줄에 붙는 파트별 참여자 요약 (원본 곡의 participants 기준) */
function PartLine({
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
  if (uids.length === 0) return <p className="setlist-parts none">참여자 없음</p>

  // 고정 파트를 정해진 순서로 먼저, 그 뒤에 임의 라벨을 등장 순서대로
  const fixed = PART_ORDER.map((p) => ({
    key: p as string,
    label: PART_META[p].label,
    uids: uids.filter((u) => parts[u] === p),
  })).filter((g) => g.uids.length > 0)
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
    <p className="setlist-parts">
      {[...fixed, ...custom].map((g) => (
        <span key={g.key} className="setlist-part">
          <b>{g.label}</b>
          {g.uids.map((u) => (
            <span key={u} className={'part-name' + (u === myUid ? ' me' : '')}>
              {memberMap.get(u)?.name ?? '(탈퇴)'}
            </span>
          ))}
        </span>
      ))}
    </p>
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
