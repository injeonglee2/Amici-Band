import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { classifyMusicPlaylist, deleteEvent, getMusicEventReferences, savePlaylist, watchAllMusicTracks, watchEvents, watchPlaylists } from '../data'
import type { BandEvent, Playlist } from '../types'
import FolderModule from './FolderModule'
import { PlaylistDetail } from './Music'
import { MUSIC_FOLDER_CONFIG, playlistRepository } from './musicRepository'
import type { ToastState } from './Toast'
import { MUSIC_PHASE_LABEL, musicPlaylistPhases, REHEARSAL_PLAYLIST_ID, REHEARSAL_PLAYLIST_NAME } from '../musicCatalog'

export default function MusicLibrary({ toast }: { toast: ToastState }) {
  const { member } = useAuth()
  const [lists, setLists] = useState<Playlist[]>([])
  const [linked, setLinked] = useState<Set<string> | null>(null)
  const [events, setEvents] = useState<BandEvent[]>([])
  /**
   * 일정의 '이동 ›' 이 붙여 준 ?playlist= 는 한 번 열고 나면 지운다.
   * 남겨 두면 이후 음악 탭에 들어올 때마다 그 재생목록이 계속 먼저 열린다.
   */
  const [deepPlaylistId] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('playlist')))
  useEffect(() => {
    if (!deepPlaylistId) return
    const url = new URL(window.location.href)
    url.searchParams.delete('playlist')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [deepPlaylistId])

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
      if (alive) setEvents(events)
      void getMusicEventReferences(events).then((ids) => { if (alive) setLinked(ids) }).catch(() => {})
    }, () => {})
    return () => { alive = false; unsub() }
  }, [])

  // 투표가 열린 추천곡 폴더에 추가 마감 일정이 남아 있으면 정리한다.
  const votingPlaylistIds = lists.filter((playlist) => playlist.voteOpen).map((playlist) => playlist.id).sort().join(',')
  useEffect(() => {
    if (!member?.admin || !votingPlaylistIds) return
    const stale = new Set(votingPlaylistIds.split(',').map((id) => `recommendation-deadline-${id}`))
    return watchEvents((events) => {
      events.forEach((event) => { if (stale.has(event.id)) void deleteEvent(event.id).catch(() => {}) })
    }, () => {})
  }, [votingPlaylistIds, member?.admin])

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

  // 추천곡 폴더는 일정에 올라온 마감 일정을 따라 '추가중 / 투표중'을 목록에서 바로 보여준다.
  const phases = useMemo(() => musicPlaylistPhases(events), [events])
  const config = useMemo(() => ({
    ...MUSIC_FOLDER_CONFIG,
    rowBadge: (folder: { id: string }) => {
      const phase = phases.get(folder.id)
      return phase ? <span className={`playlist-phase ${phase}`}>{MUSIC_PHASE_LABEL[phase]}</span> : null
    },
    // 합주곡은 자체 헤더가 없어 편집 버튼을 칩 줄 오른쪽 끝에 둔다
    detailEditable: (folder: { templateId?: string }) => folder.templateId === 'rehearsal',
  }), [phases])

  return <FolderModule
    config={config}
    repository={playlistRepository}
    initialOpenId={deepPlaylistId}
    stateKey="music"
    renderDetail={(playlist, onBack, edit) => <PlaylistDetail key={playlist.id + playlist.templateId} playlist={playlist} toast={toast} onBack={onBack} edit={edit} />}
  />
}
