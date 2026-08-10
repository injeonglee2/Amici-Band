import { PART_META, PART_ORDER, type Attendance, type Member } from '../types'

/** 늦참·조퇴면 이름 옆에 붙일 시각 (예: '19:30 참', '21:00 퇴'). 그 외에는 빈 문자열 */
function whenLabel(a: Attendance | undefined): string {
  if (!a) return ''
  if (a.status === 'late' && a.arriveTime) return `${a.arriveTime} 참`
  if (a.status === 'leave' && a.leaveTime) return `${a.leaveTime} 퇴`
  return ''
}

/**
 * 파트별 참석 표 — 참석 현황 모달과 합주곡 시트가 같은 표를 써야 해서 공용으로 뺐다.
 * 오는 사람 기준은 참석·늦참·조퇴. 늦참·조퇴는 이름 옆에 시각을 연하게 덧붙인다.
 */
export default function PartTally({
  members,
  att,
  className,
}: {
  members: Member[]
  att: Attendance[]
  className?: string
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
                  const when = whenLabel(attMap.get(m.uid))
                  return (
                    <li key={m.uid}>
                      {m.name}
                      {when && <span className="part-when">{when}</span>}
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
