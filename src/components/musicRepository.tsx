import { deletePlaylist, newId, savePlaylist, saveTrack, watchPlaylists } from '../data'
import type { Playlist } from '../types'
import type { FolderModuleConfig, FolderRepository } from './FolderModule'
import { importYouTubePlaylist, playlistImportErrorMessage, resolveYouTubePlaylistTitle } from '../playlistImport'
export const MUSIC_FOLDER_CONFIG: FolderModuleConfig = {
  templates: [
    { id: 'general', label: '일반 곡목록', description: '음악 수집·감상·공유', symbol: '🎧' },
    { id: 'project', label: '공연·합주 프로젝트', description: '추천 → 검토 → 투표 → 선정', symbol: '🎸' },
  ],
  labels: {
    folder: '재생목록', empty: '재생목록이 없어요.', add: '재생목록',
    createTitle: '새 재생목록', editTitle: '재생목록 수정', name: '재생목록 이름',
    placeholder: '예) 이번 공연 셋리스트',
    deleteConfirm: () => '이 재생목록을 삭제할까요? 담아둔 곡도 함께 사라집니다.',
  },
  emptyIcon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  rowIcon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
}

export const playlistRepository: FolderRepository<Playlist> = {
  watch: watchPlaylists,
  create: (name, creatorUid, templateId) => ({ id: newId(), name, templateId: templateId === 'project' ? 'project' : 'general', createdBy: creatorUid, createdAt: Date.now() }),
  save: savePlaylist,
  remove: (playlist) => deletePlaylist(playlist.id),
  // 새 재생목록을 만들 때 유튜브 재생목록 링크를 넣으면 제목·곡을 그대로 가져온다(선택).
  playlistImport: {
    templateIds: ['general', 'project'],
    resolveName: resolveYouTubePlaylistTitle,
    errorMessage: playlistImportErrorMessage,
    run: (playlist, url, onProgress) => importYouTubePlaylist({
      input: url,
      save: (song, index) => saveTrack(playlist.id, {
        id: newId(),
        url: song.url,
        videoId: song.videoId,
        title: song.title,
        artist: song.artist,
        thumbnail: song.thumbnail,
        order: Date.now() + index,
        addedBy: playlist.createdBy,
        addedAt: Date.now() + index,
      }),
      onProgress: ({ current, total }) => onProgress(`${current}/${total}곡 담는 중…`),
    }),
  },
}
