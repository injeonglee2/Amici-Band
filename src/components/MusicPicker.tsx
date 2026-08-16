import { useEffect, useState } from 'react'
import { watchPlaylists, watchTracks } from '../data'
import type { Playlist, Track } from '../types'
import { thumbnailUrl } from '../youtube'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

export type MusicSel = {
  playlistId: string
  playlistName: string
  trackId?: string
  trackTitle?: string
  trackArtist?: string
}

/**
 * 음악 연결용 곡 고르기 시트 — 재생목록을 먼저 고르고, 그 안의 곡(또는 '재생목록 전체')을 고른다.
 * 악보 탭의 곡 고르기와 같은 루틴/디자인(.picker-*)을 재사용한다.
 */
export default function MusicPicker({
  onPick,
  onClose,
}: {
  onPick: (sel: MusicSel) => void
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [open, setOpen] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])

  useEffect(() => watchPlaylists(setPlaylists), [])
  useEffect(() => {
    if (!open) {
      setTracks([])
      return
    }
    return watchTracks(open.id, setTracks)
  }, [open])
  useBackHandler(() => (open ? setOpen(null) : onClose()))

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>음악 연결 — 곡 고르기</h2>

        {!open ? (
          <div className="picker-list">
            {playlists.length === 0 && (
              <p className="setlist-empty">재생목록이 없어요. 음악 탭에서 먼저 만들어 주세요.</p>
            )}
            {playlists.map((p) => (
              <button key={p.id} type="button" className="picker-row" onClick={() => setOpen(p)}>
                <span className="track-info">
                  <h3>{p.name}</h3>
                </span>
                <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="picker-bar">
              <button type="button" className="btn subtle" onClick={() => setOpen(null)}>← 재생목록</button>
              <b>{open.name}</b>
            </div>
            <div className="picker-list">
              <button
                type="button"
                className="picker-row"
                onClick={() => onPick({ playlistId: open.id, playlistName: open.name })}
              >
                <span className="track-info">
                  <h3>재생목록 전체 연결</h3>
                  <p>특정 곡 없이 이 재생목록에 연결</p>
                </span>
              </button>
              {tracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="picker-row"
                  onClick={() => onPick({ playlistId: open.id, playlistName: open.name, trackId: t.id, trackTitle: t.title, trackArtist: t.artist || undefined })}
                >
                  <span className="track-thumb sm">
                    {t.thumbnail || t.videoId ? <img src={t.thumbnail || thumbnailUrl(t.videoId ?? '')} alt="" loading="lazy" /> : null}
                  </span>
                  <span className="track-info">
                    <h3>{t.title}</h3>
                    {t.artist && <p>{t.artist}</p>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="actions">
          <button type="button" className="btn subtle block" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}
