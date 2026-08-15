import { PART_META, PART_ORDER, STATUS_META, type Attendance, type Member } from '../types'

/**
 * 늦참·조퇴면 이름 옆에 붙일 시각. '참'·'퇴' 글자 없이 시각만 쓰고 상태를 색으로 구분한다
 * (늦참=노랑, 조퇴=주황 — 위 집계의 상태 색과 같은 값). 글자가 짧아야 이름과 한 줄에 들어간다.
 */
function whenTime(a: Attendance | undefined): { text: string; color: string } | null {
  if (a?.status === 'late' && a.arriveTime) return { text: a.arriveTime, color: STATUS_META.late.color }
  if (a?.status === 'leave' && a.leaveTime) return { text: a.leaveTime, color: STATUS_META.leave.color }
  return null
}

/**
 * 파트별 참석 표 — 참석 현황 모달과 합주곡 시트가 같은 표를 써야 해서 공용으로 뺐다.
 * 오는 사람 기준은 참석·늦참·조퇴. 늦참·조퇴는 이름 옆에 시각을 연하게 덧붙인다.
 */
export default function PartTally({
  members,
  att,
  className,
  highlightUids,
}: {
  members: Member[]
  att: Attendance[]
  className?: string
  /** 볼드로 강조할 uid(예: 펼친 합주곡의 참여자). 없으면 강조 없음 */
  highlightUids?: Set<string>
}) {
  const attMap = new Map(att.map((a) => [a.uid, a]))
  const attendingUids = new Set(
    att
      .filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'leave')
      .map((a) => a.uid),
  )

  return (
    <div className={'part-tally' + (className ? ' ' + className : '')}>
      <div className="part-tally-title">파트별 참석</div>
      <div className="part-tally-grid">
        {PART_ORDER.map((p) => {
          const inPart = members.filter((m) => m.part === p)
          const attendees = inPart.filter((m) => attendingUids.has(m.uid))
          return (
            <div key={p} className="part-cell">
              <div className="part-head">{PART_META[p].label} <b>{attendees.length}</b><span>/{inPart.length}</span></div>
              <ul>
                {attendees.length === 0 && <li className="muted">-</li>}
                {attendees.map((m) => {
                  const when = whenTime(attMap.get(m.uid))
                  return (
                    <li key={m.uid} className={highlightUids?.has(m.uid) ? 'hl' : undefined}>
                      {m.name}
                      {when && (
                        <span className="part-when" style={{ color: when.color }}>{when.text}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
