import { copyText } from './clipboard'
import type { ResolvedPlace } from './place'
import { parseDate, weekday } from './time'
import { TYPE_META, type BandEvent } from './types'
import { getCurrentBand } from './band'

const APP_URL = 'https://amicicalender.web.app/'

function eventUrl(eventId: string): string {
  const url = new URL(APP_URL)
  url.searchParams.set('event', eventId)
  const bandId = getCurrentBand()
  if (bandId) url.searchParams.set('band', bandId)
  return url.toString()
}

export function voteRequestMessage(event: BandEvent, place: ResolvedPlace | null, undecidedCount: number): string {
  const date = parseDate(event.date)
  return [
    '[Amici 참석 투표 요청]',
    `${TYPE_META[event.type].label} · ${event.title}`,
    `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday(event.date)}) · ${event.rehStart}–${event.rehEnd}`,
    ...(place ? [`장소 · ${place.name}`] : []),
    `현재 미정 ${undecidedCount}명`,
    '',
    '아래 Amici 앱에서 참석 여부를 선택해 주세요.',
    eventUrl(event.id),
  ].join('\n')
}

export async function shareVoteRequest(event: BandEvent, place: ResolvedPlace | null, undecidedCount: number): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = voteRequestMessage(event, place, undecidedCount)
  if (navigator.share) {
    try {
      await navigator.share({ title: `${event.title} 참석 투표`, text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  return new Promise((resolve) => copyText(text, () => resolve('copied'), () => resolve('cancelled')))
}
