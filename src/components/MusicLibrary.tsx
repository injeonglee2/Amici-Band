import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { classifyMusicPlaylist, getMusicEventReferences, savePlaylist, watchAllMusicTracks, watchEvents, watchPlaylists } from '../data'
import type { Playlist } from '../types'
import FolderModule from './FolderModule'
import { PlaylistDetail } from './Music'
import { MUSIC_FOLDER_CONFIG, playlistRepository } from './musicRepository'
import type { ToastState } from './Toast'
import { REHEARSAL_PLAYLIST_ID, REHEARSAL_PLAYLIST_NAME } from '../musicCatalog'

export default function MusicLibrary({ toast }: { toast: ToastState }) {
  const { member } = useAuth()
  const [lists, setLists] = useState<Playlist[]>([])
  const [linked, setLinked] = useState<Set<string> | null>(null)

  useEffect(() => watchPlaylists(setLists, () => {}), [])
  useEffect(() => {
    if (!member || lists.some((playlist) => playlist.id === REHEARSAL_PLAYLIST_ID)) return
    void savePlaylist({ id: REHEARSAL_PLAYLIST_ID, name: REHEARSAL_PLAYLIST_NAME, templateId: 'rehearsal', createdBy: member.uid, createdAt: 0 }).catch(() => {})
  }, [lists, member])
  // 기존 프로젝트는 추천곡 템플릿으로 승계한다. 요청된 2026 11월 공연도 이름 기준으로 함께 전환한다.
  useEffect(() => {
    if (!member) return
    lists.filter((playlist) => playlist.templateId === 'project' || (playlist.name.trim() === '2026 11월 공연' && playlist.templateId !== 'recommendation'))
      .forEach((playlist) => { void savePlaylist({ ...playlist, templateId: 'recommendation' }).catch(() => {}) })
    lists.filter((playlist) => playlist.name.trim() === '2026 9월 공연' && playlist.templateId !== 'performance')
      .forEach((playlist) => { void savePlaylist({ ...playlist, templateId: 'performance' }).catch(() => {}) })
  }, [lists, member])
  useEffect(() => {
    let alive = true
    const unsub = watchEvents((events) => {
      void getMusicEventReferences(events).then((ids) => { if (alive) setLinked(ids) }).catch(() => {})
    }, () => {})
    return () => { alive = false; unsub() }
  }, [])

  // 기존 재생목록은 내용과 일정 연결을 기준으로 최초 한 번만 템플릿을 자동 지정한다.
  const legacyIds = lists.filter((playlist) => !playlist.templateId).map((playlist) => playlist.id).sort().join(',')
  useEffect(() => {
    if (!linked || !member || !legacyIds) return
    const saving = new Set<string>()
    const unsubscribers = lists.filter((playlist) => !playlist.templateId).map((playlist) => watchAllMusicTracks(playlist.id, (tracks) => {
      if (saving.has(playlist.id)) return
      saving.add(playlist.id)
      const project = linked.has(playlist.id)
        || /공연|합주|셋리스트|setlist/i.test(playlist.name)
        || tracks.some((track) => Object.keys(track.participants ?? {}).length > 0)
      void classifyMusicPlaylist(playlist, project).catch(() => { saving.delete(playlist.id) })
    }, () => {}))
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  // 목록의 미분류 상태나 일정 연결이 달라질 때만 재구독한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyIds, linked, member?.uid])

  return <FolderModule
    config={MUSIC_FOLDER_CONFIG}
    repository={playlistRepository}
    initialOpenId={typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('playlist')}
    renderDetail={(playlist, onBack) => <PlaylistDetail key={playlist.id + playlist.templateId} playlist={playlist} toast={toast} onBack={onBack} />}
  />
}
