import { todayStr } from './time'
import type { BandEvent } from './types'

export const REHEARSAL_PLAYLIST_ID = 'rehearsal-library'
export const REHEARSAL_PLAYLIST_NAME = '합주곡'

/** 추천곡 폴더가 지금 어느 단계인지 — 곡을 모으는 중(recommendation)인지 투표 중(vote)인지 */
export type MusicPlaylistPhase = 'recommendation' | 'vote'

export const MUSIC_PHASE_LABEL: Record<MusicPlaylistPhase, string> = {
  recommendation: '추가중',
  vote: '투표중',
}

/**
 * 지금 일정에 올라와 있는 추천곡 마감 일정에서 폴더별 현재 단계를 읽는다.
 *
 * 마감일이 지난 일정은 '올라와 있는' 일정이 아니므로 세지 않는다. 이걸 빼면
 * 예전에 끝난 추가 마감이 남아 계속 '추가중'으로 보인다.
 * 두 일정이 함께 남아 있는 예전 데이터에서는 투표를 우선한다.
 */
export function musicPlaylistPhases(events: BandEvent[]): Map<string, MusicPlaylistPhase> {
  const today = todayStr()
  const phases = new Map<string, MusicPlaylistPhase>()
  for (const event of events) {
    const playlistId = event.recommendationPlaylistId
    if (!playlistId || !event.musicDeadlineKind || event.date < today) continue
    if (event.musicDeadlineKind === 'vote' || !phases.has(playlistId)) phases.set(playlistId, event.musicDeadlineKind)
  }
  return phases
}
