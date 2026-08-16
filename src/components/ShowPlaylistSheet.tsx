import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { setEventPlaylist, watchAttendance, watchPlaylists, watchTracks } from '../data'
import type { Attendance, BandEvent, Member, Playlist, Track } from '../types'
import { parseDate, weekday } from '../time'
import { thumbnailUrl } from '../youtube'
import type { ResolvedPlace } from '../place'
import ConfirmDialog from './ConfirmDialog'
import PartTally from './PartTally'
import ParticipationSheet from './ParticipationSheet'
import SetlistPlayer from './SetlistPlayer'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

/**
 * 공연 일정 카드를 탭하면 열리는 '연결된 재생목록' 시트.
 * 공연은 곡을 하나씩 담는 합주곡 대신, 재생목록 하나를 통째로 연결해 셋리스트로 쓴다.
 * 연결/변경/해제는 관리자만. 곡별 파트 참여는 원본 재생목록의 곡을 그대로 편집한다.
 */
export default function ShowPlaylistSheet({
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
  const { member } = useAuth()
  const isAdmin = !!member?.admin
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)

  const [att, setAtt] = useState<Attendance[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [picking, setPicking] = useState(false) // 재생목록 고르기 화면
  const [unlinking, setUnlinking] = useState(false)
  const [participatingId, setParticipatingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  // 뒤로가기: 고르기 화면이면 시트로, 아니면 닫기 (참여/확인창은 각자 먼저 받음)
  useBackHandler(() => (picking ? setPicking(false) : onClose()))

  useEffect(() => watchAttendance(ev.id, setAtt, () => {}), [ev.id])
  useEffect(() => watchPlaylists(setPlaylists, () => {}), [])

  const playlistId = ev.playlistId
  const linked = playlistId ? playlists.find((p) => p.id === playlistId) : undefined
  useEffect(() => {
    if (!playlistId) {
      setTracks([])
      return
    }
    return watchTracks(playlistId, setTracks, () => {})
  }, [playlistId])

  const memberMap = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members])
  const d = parseDate(ev.date)

  async function link(p: Playlist) {
    try {
      await setEventPlaylist(ev, p.id)
      setPicking(false)
      toast.show(`'${p.name}' 재생목록을 연결했어요`)
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '연결 권한이 없어요.' : '연결에 실패했어요.')
      console.error(e)
    }
  }
  async function unlink() {
    setUnlinking(false)
    try {
      await setEventPlaylist(ev, null)
      setPlayingId(null)
      toast.show('재생목록 연결을 해제했어요')
    } catch (e) {
      toast.show('해제에 실패했어요.')
      console.error(e)
    }
  }

  const playingIndex = tracks.findIndex((t) => t.id === playingId)
  const playing = playingIndex >= 0 ? tracks[playingIndex] : null

  /* ----- 재생목록 고르기 ----- */
  if (picking) {
    return (
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}>
            <div className="grab" />
          </div>
          <div className="picker-bar">
            <button type="button" className="detail-back" onClick={() => setPicking(false)} aria-label="뒤로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <h2 className="detail-title">재생목록 연결</h2>
          </div>
          {playlists.length === 0 ? (
            <p className="setlist-empty">재생목록이 없어요. 음악 탭에서 먼저 만들어 주세요.</p>
          ) : (
            <div className="picker-list">
              {playlists.map((p) => (
                <button key={p.id} type="button" className="picker-row" onClick={() => void link(p)}>
                  <span className="picker-name">{p.name}</span>
                  {p.id === playlistId && <span className="setlist-joined">연결됨</span>}
                  <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              ))}
            </div>
          )}
          <div className="actions">
            <button type="button" className="btn subtle block" onClick={() => setPicking(false)}>돌아가기</button>
          </div>
        </div>
      </div>
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

          <PartTally members={members} att={att} className="setlist-part-tally" />

          <div className="setlist-count">
            <span className="part-bar-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </span>
            {linked ? `재생목록 · ${linked.name}` : '연결된 재생목록 없음'}
            {isAdmin && linked && (
              <button type="button" className="edit-btn setlist-edit" onClick={() => setPicking(true)} aria-label="재생목록 변경">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
          </div>

          {!linked ? (
            <p className="setlist-empty">
              {isAdmin
                ? '아직 연결된 재생목록이 없어요. 아래 ‘재생목록 연결’로 골라 연결하세요.'
                : '아직 연결된 재생목록이 없어요.'}
            </p>
          ) : (
            <>
              {playing && (
                <SetlistPlayer
                  track={playing}
                  index={playingIndex}
                  total={tracks.length}
                  hasPrev={playingIndex > 0}
                  hasNext={playingIndex < tracks.length - 1}
                  onPrev={() => playingIndex > 0 && setPlayingId(tracks[playingIndex - 1].id)}
                  onNext={() => playingIndex < tracks.length - 1 && setPlayingId(tracks[playingIndex + 1].id)}
                  onEnded={() => playingIndex < tracks.length - 1 && setPlayingId(tracks[playingIndex + 1].id)}
                  onClose={() => setPlayingId(null)}
                />
              )}
              {tracks.length === 0 ? (
                <p className="setlist-empty">이 재생목록에 담긴 곡이 없어요.</p>
              ) : (
                <ol className="setlist-list">
                  {tracks.map((t, i) => {
                    const joined = Object.keys(t.participants ?? {}).length
                    return (
                      <li key={t.id} className={'setlist-row' + (t.id === playingId ? ' playing' : '')}>
                        <div className="setlist-rowhead">
                          <span className="setlist-no">{i + 1}</span>
                          <button type="button" className="track-thumb-btn" onClick={() => setPlayingId(t.id)} aria-label="재생">
                            <div className="track-thumb sm">
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
                          <button type="button" className="track-open" onClick={() => setParticipatingId(t.id)} aria-label="파트 참여 보기">
                            <div className="track-info">
                              <h3>{t.title || '(제목 없음)'}</h3>
                              {t.artist && <p>{t.artist}</p>}
                            </div>
                            {joined > 0 && (
                              <span className="track-partcount" title={`참여 ${joined}명`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                {joined}
                              </span>
                            )}
                            <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )}

          <div className="actions">
            {isAdmin && !linked && (
              <button type="button" className="btn primary" onClick={() => setPicking(true)}>재생목록 연결</button>
            )}
            {isAdmin && linked ? (
              <>
                <button type="button" className="btn danger" onClick={() => setUnlinking(true)}>연결 해제</button>
                <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
              </>
            ) : (
              <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
            )}
          </div>
        </div>
      </div>

      {participatingId &&
        (() => {
          const t = tracks.find((x) => x.id === participatingId)
          if (!linked || !t) return null
          return (
            <ParticipationSheet
              playlistId={linked.id}
              track={t}
              memberMap={memberMap}
              me={member ?? null}
              toast={toast}
              onClose={() => setParticipatingId(null)}
            />
          )
        })()}

      {unlinking && (
        <ConfirmDialog
          message={`'${linked?.name ?? ''}' 재생목록 연결을 해제할까요?`}
          confirmLabel="해제"
          cancelLabel="닫기"
          danger
          onConfirm={() => void unlink()}
          onCancel={() => setUnlinking(false)}
        />
      )}
    </>
  )
}
