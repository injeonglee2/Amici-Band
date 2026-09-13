import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { classifyMusicPlaylist, getMusicEventReferences, watchAllMusicTracks, watchEvents, watchPlaylists } from '../data'
import type { Playlist } from '../types'
import FolderModule from './FolderModule'
import { PlaylistDetail } from './Music'
import { MUSIC_FOLDER_CONFIG, playlistRepository } from './musicRepository'
import type { ToastState } from './Toast'

export default function MusicLibrary({ toast }: { toast: ToastState }) {
  const { member } = useAuth()
  const [lists, setLists] = useState<Playlist[]>([])
  const [linked, setLinked] = useState<Set<string> | null>(null)

  useEffect(() => watchPlaylists(setLists, () => {}), [])
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
    renderDetail={(playlist, onBack) => <PlaylistDetail key={playlist.id + playlist.templateId} playlist={playlist} toast={toast} onBack={onBack} />}
  />
}
