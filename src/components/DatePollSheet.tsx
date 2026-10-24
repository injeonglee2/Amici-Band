import { useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import { saveEvent, setDateVote } from '../data'
import { shareVoteRequest } from '../eventShare'
import { shortDate } from '../time'
import type { BandEvent, DateVote, Member } from '../types'
import { getActiveWorkspaceTemplate } from '../workspaceTemplates'
import ConfirmDialog from './ConfirmDialog'
import Sheet from './Sheet'
import ThemeSelect from './ThemeSelect'
import type { ToastState } from './Toast'

/**
 * 날짜 미정 약속의 "날짜 투표 현황" 시트 — 카드를 누르면 열린다.
 * 후보 날짜마다 누가 갈 수 있는지 보고, 내 가능 여부를 켜고 끈다. 후보 날짜 자체는 일정 수정에서만 바꾼다.
 * 운영 권한(친구 채널은 모두)이 있으면 한 날로 확정한다. 확정하면 보통 일정이 되어 참석 투표가 이어진다.
 */
export default function DatePollSheet({ ev, votes, members, toast, onClose }: {
  ev: BandEvent
  votes: DateVote[]
  members: Member[]
  toast: ToastState
  onClose: () => void
}) {
  const { user, member } = useAuth()
  useBackHandler(onClose)
  const template = getActiveWorkspaceTemplate()
  const canManage = !!member?.admin || !!template.equalMembers || ev.createdBy === user?.uid
  const options = ev.dateOptions ?? []
  const myVote = votes.find((v) => v.uid === user?.uid)
  const [pickDate, setPickDate] = useState('')
  const [confirmDate, setConfirmDate] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)

  // 후보 날짜별 가능한 사람 이름(현재 멤버 이름 우선, 없으면 투표 당시 스냅샷)
  const availableBy = useMemo(() => {
    const nameOf = (uid: string, fallback: string) => members.find((m) => m.uid === uid)?.name ?? fallback
    const map = new Map<string, string[]>()
    for (const vote of votes) {
      for (const day of vote.available) {
        const names = map.get(day) ?? []
        names.push(nameOf(vote.uid, vote.name))
        map.set(day, names)
      }
    }
    return map
  }, [votes, members])
  const best = useMemo(() => [...options].sort((a, b) => (availableBy.get(b)?.length ?? 0) - (availableBy.get(a)?.length ?? 0))[0] ?? '', [options, availableBy])
  const chosen = pickDate && options.includes(pickDate) ? pickDate : best // 후보 밖의 값은 쓰지 않는다

  async function toggle(day: string) {
    if (!user || !member) return
    const next = new Set(myVote?.available ?? [])
    if (next.has(day)) next.delete(day)
    else next.add(day)
    try {
      await setDateVote(ev.id, { uid: user.uid, name: member.name, available: [...next].sort(), updatedAt: Date.now() })
    } catch {
      toast.show('저장하지 못했어요')
    }
  }

  async function confirm() {
    if (!confirmDate || busy) return
    setBusy(true)
    try {
      // 확정: 자리표시 날짜를 실제 날짜로 바꾸고 미정 필드를 비운다(saveEvent 는 undefined 필드를 저장하지 않고 문서를 덮어쓴다)
      await saveEvent({ ...ev, date: confirmDate, undated: undefined, period: undefined, dateOptions: undefined })
      toast.show(`${shortDate(confirmDate)}로 확정했어요`)
      onClose()
    } catch {
      toast.show('확정하지 못했어요')
      setBusy(false)
    }
  }

  async function share() {
    if (sharing) return
    setSharing(true)
    const result = await shareVoteRequest(ev, null, 0)
    if (result === 'copied') toast.show('요청 문구를 복사했어요. 카카오톡에 붙여넣어 주세요.')
    else if (result === 'shared') toast.show('공유를 완료했어요.')
    setSharing(false)
  }

  return (
    <>
      <Sheet onClose={onClose}>
        <h2>날짜 투표 현황</h2>
        <p className="poll-period">{ev.title}{ev.period ? ` · ${ev.period}` : ''}</p>

        {options.length === 0 ? (
          <p className="muted">후보 날짜가 없어요.</p>
        ) : (
          <div className="poll-list">
            {options.map((day) => {
              const names = availableBy.get(day) ?? []
              const mine = !!myVote?.available.includes(day)
              return (
                <div className="poll-row" key={day}>
                  <div className="poll-day">
                    <b>{shortDate(day)}</b>
                    <small><em>{names.length}명</em>{names.length > 0 ? ` · ${names.join(', ')}` : ''}</small>
                  </div>
                  <button type="button" className={'part-chip' + (mine ? ' on' : '')} aria-pressed={mine} onClick={() => void toggle(day)} disabled={!user}>가능</button>
                </div>
              )
            })}
          </div>
        )}

        {canManage && options.length > 0 && (
          /* 확정은 후보 날짜 중에서만 — 가장 많이 모인 날이 기본 선택 */
          <div className="field poll-confirm">
            <label>확정할 날짜</label>
            <div className="poll-add">
              <ThemeSelect
                title="확정할 날짜"
                value={chosen}
                onChange={setPickDate}
                options={options.map((day) => ({ value: day, label: `${shortDate(day)} · ${availableBy.get(day)?.length ?? 0}명` }))}
              />
              <button type="button" className="btn primary sm" onClick={() => setConfirmDate(chosen)} disabled={!chosen || busy}>이 날로 확정</button>
            </div>
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={() => void share()} disabled={sharing}>{sharing ? '여는 중…' : '요청 보내기'}</button>
          <button type="button" className="btn subtle grow" onClick={onClose}>닫기</button>
        </div>
      </Sheet>

      {confirmDate && (
        <ConfirmDialog
          message={`${shortDate(confirmDate)}로 확정할까요? 확정하면 참석 투표가 열려요.`}
          confirmLabel="확정"
          cancelLabel="닫기"
          onConfirm={() => void confirm()}
          onCancel={() => setConfirmDate(null)}
        />
      )}
    </>
  )
}
