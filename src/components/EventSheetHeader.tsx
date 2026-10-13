import { longWhen } from '../time'
import type { BandEvent } from '../types'
import type { ResolvedPlace } from '../place'

/**
 * 시트 상단 일정 헤더 — 제목 + "N월 N일 (요일) · 시작–끝 · 장소".
 * SetlistSheet·ShowPlaylistSheet 등에서 공용으로 쓴다.
 */
export default function EventSheetHeader({
  ev,
  place,
  showDetails = true,
  inlineDateTime = false,
}: {
  ev: BandEvent
  place: ResolvedPlace | null
  showDetails?: boolean
  inlineDateTime?: boolean
}) {
  const dateTime = <>{longWhen(ev)}</>
  return (
    <div className="setlist-head">
      <div className="setlist-head-title">
        <h2>{ev.title}</h2>
        {inlineDateTime && <span className="setlist-head-datetime">{dateTime}</span>}
      </div>
      {showDetails && <p>
          {dateTime}
          {place && <> · {place.name}</>}
        </p>}
    </div>
  )
}
