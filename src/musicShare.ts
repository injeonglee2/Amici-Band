import { getCurrentBand } from './band'
import { copyText } from './clipboard'
import type { Playlist } from './types'

function recommendationUrl(playlistId: string): string {
  const url = new URL('https://amicicalender.web.app/')
  url.searchParams.set('nav', 'music')
  url.searchParams.set('playlist', playlistId)
  const bandId = getCurrentBand()
  if (bandId) url.searchParams.set('band', bandId)
  return url.toString()
}

export function recommendationRequestMessage(playlist: Playlist, perPersonLimit: number, deadline: string): string {
  const deadlineDate = new Date(`${deadline}T00:00:00`)
  const deadlineLabel = Number.isNaN(deadlineDate.getTime())
    ? deadline
    : deadlineDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  return [
    '[Amici 합주 추천곡 추가 요청]',
    playlist.name,
    `인당 최대 ${perPersonLimit}곡 · ${deadlineLabel} 마감`,
    '',
    '함께 연주하고 싶은 곡을 추천해 주세요.',
    recommendationUrl(playlist.id),
  ].join('\n')
}

export async function shareRecommendationRequest(playlist: Playlist, perPersonLimit: number, deadline: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = recommendationRequestMessage(playlist, perPersonLimit, deadline)
  if (navigator.share) {
    try {
      await navigator.share({ title: `${playlist.name} 추천곡 추가 요청`, text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  return new Promise((resolve) => copyText(text, () => resolve('copied'), () => resolve('cancelled')))
}

export function recommendationVoteRequestMessage(playlist: Playlist): string {
  const deadlineDate = playlist.voteDeadline ? new Date(`${playlist.voteDeadline}T00:00:00`) : null
  const deadlineLabel = deadlineDate && !Number.isNaN(deadlineDate.getTime())
    ? deadlineDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    : playlist.voteDeadline || ''
  return [
    '[Amici 추천곡 투표 요청]',
    playlist.name,
    `보컬 투표 · 인당 최대 ${playlist.voteSelectionCount ?? 1}곡 선택`,
    ...(deadlineLabel ? [`${deadlineLabel} 마감`] : []),
    '',
    '아래 Amici 앱에서 추천곡을 선택해 주세요.',
    recommendationUrl(playlist.id),
  ].join('\n')
}

export async function shareRecommendationVoteRequest(playlist: Playlist): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = recommendationVoteRequestMessage(playlist)
  if (navigator.share) {
    try {
      await navigator.share({ title: `${playlist.name} 추천곡 투표 요청`, text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  return new Promise((resolve) => copyText(text, () => resolve('copied'), () => resolve('cancelled')))
}
