import { copyText } from './clipboard'
import type { ResolvedPlace } from './place'
import { longWhen } from './time'
import type { BandEvent } from './types'
import { getCurrentBand } from './band'
import { eventTypeLabel } from './workspaceTemplates'

const APP_URL = 'https://amicicalender.web.app/'

function eventUrl(eventId: string): string {
  const url = new URL(APP_URL)
  url.searchParams.set('event', eventId)
  const bandId = getCurrentBand()
  if (bandId) url.searchParams.set('band', bandId)
  return url.toString()
}

export function voteRequestMessage(event: BandEvent, place: ResolvedPlace | null, undecidedCount: number): string {
  // 날짜 미정 약속: 참석이 아니라 가능한 날을 골라 달라는 요청
  if (event.undated) {
    return [
      '[Amici 날짜 투표 요청]',
      `${eventTypeLabel(event.type)} · ${event.title}`,
      ...(event.period ? [`시기 · ${event.period}`] : []),
      `후보 ${event.dateOptions?.length ?? 0}일 중 갈 수 있는 날과 참석 여부를 골라 주세요.`,
      '',
      '아래 Amici 앱에서 가능한 날과 참·불참을 선택해 주세요.',
      eventUrl(event.id),
    ].join('\n')
  }
  return [
    '[Amici 참석 투표 요청]',
    `${eventTypeLabel(event.type)} · ${event.title}`,
    longWhen(event),
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
      await navigator.share({ title: `${event.title} ${event.undated ? '날짜 투표' : '참석 투표'}`, text })
      return 'shared'
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  return new Promise((resolve) => copyText(text, () => resolve('copied'), () => resolve('cancelled')))
}
