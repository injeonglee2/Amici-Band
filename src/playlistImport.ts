import { fetchPlaylistItems, fetchPlaylistTitle, parsePlaylistId, PlaylistImportError, type ImportedSong } from './youtube'

export interface PlaylistImportProgress {
  current: number
  total: number
}

/** 밴드 기록과 개인 영상 폴더가 함께 사용하는 재생목록 가져오기 파이프라인. */
export async function importYouTubePlaylist({
  input,
  existingVideoIds = new Set<string>(),
  save,
  onProgress,
}: {
  input: string
  existingVideoIds?: ReadonlySet<string>
  save: (song: ImportedSong, index: number) => Promise<void>
  onProgress?: (progress: PlaylistImportProgress) => void
}): Promise<{ added: number; skipped: number }> {
  const playlistId = parsePlaylistId(input)
  if (!playlistId) throw new PlaylistImportError('INVALID_URL')
  const songs = await fetchPlaylistItems(playlistId)
  const fresh = songs.filter((song) => !existingVideoIds.has(song.videoId))
  for (let index = 0; index < fresh.length; index++) {
    onProgress?.({ current: index + 1, total: fresh.length })
    await save(fresh[index], index)
  }
  return { added: fresh.length, skipped: songs.length - fresh.length }
}

export async function resolveYouTubePlaylistTitle(input: string): Promise<string> {
  const playlistId = parsePlaylistId(input)
  if (!playlistId) throw new PlaylistImportError('INVALID_URL')
  return fetchPlaylistTitle(playlistId)
}

export function playlistImportErrorMessage(error: unknown): string {
  const code = error instanceof PlaylistImportError ? error.code : ''
  if (code === 'INVALID_URL') return '올바른 유튜브 재생목록 링크를 입력해 주세요.'
  if (code === 'NO_KEY') return '유튜브 API 키가 설정돼 있지 않아요.'
  if (code === 'NOT_FOUND') return '재생목록을 찾을 수 없어요. 공개/일부공개인지 확인해 주세요.'
  if (code === 'QUOTA') return '오늘 유튜브 조회 한도를 초과했어요. 내일 다시 시도해 주세요.'
  if (code === 'FORBIDDEN') return '이 재생목록을 불러올 권한이 없어요.'
  return '재생목록을 가져오지 못했어요.' + (code ? ` (${code})` : '')
}
