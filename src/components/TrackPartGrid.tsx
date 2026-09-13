import { isFixedPart, PART_META, PART_ORDER, type Member, type Track } from '../types'

/** 곡을 펼쳤을 때 표시하는 파트별 참여자 표. */
export default function TrackPartGrid({
  track,
  memberMap,
  attendingUids = new Set<string>(),
  myUid,
}: {
  track: Track | undefined
  memberMap: Map<string, Member>
  attendingUids?: Set<string>
  myUid: string | undefined
}) {
  if (!track) return <p className="song-empty">원본 곡을 찾을 수 없어요</p>

  const parts = track.participants ?? {}
  const uids = Object.keys(parts)
  const fixed = PART_ORDER.map((part) => ({
    key: part as string,
    label: PART_META[part].label,
    uids: uids.filter((uid) => parts[uid] === part),
  }))
  const labels: string[] = []
  uids.forEach((uid) => {
    const value = parts[uid]
    if (!isFixedPart(value) && !labels.includes(value)) labels.push(value)
  })
  const custom = labels.map((label) => ({
    key: `custom:${label}`,
    label,
    uids: uids.filter((uid) => parts[uid] === label),
  }))

  return (
    <div className="song-parts">
      {[...fixed, ...custom].map((group) => (
        <div key={group.key} className="song-part-cell">
          <div className="sp-lbl">{group.label} <b>{group.uids.length}</b></div>
          <ul>
            {group.uids.length === 0 && <li className="muted">-</li>}
            {group.uids.map((uid) => {
              const className =
                (attendingUids.has(uid) ? 'attending' : '') + (uid === myUid ? ' me' : '')
              return (
                <li key={uid} className={className.trim() || undefined}>
                  {memberMap.get(uid)?.name ?? '(탈퇴)'}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
