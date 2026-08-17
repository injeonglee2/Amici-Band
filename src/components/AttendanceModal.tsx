import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { clearAttendance, remindUndecided, setAttendance } from '../data'
import {
  STATUS_META,
  TYPE_META,
  type Attendance,
  type AttendStatus,
  type BandEvent,
  type Member,
} from '../types'
import { lateOptions, leaveOptions, parseDate, weekday } from '../time'
import { TypeGlyph } from './TypeGlyph'
import ConfirmDialog from './ConfirmDialog'
import PartTally from './PartTally'
import ThemeSelect from './ThemeSelect'
import Sheet from './Sheet'
import { useBackHandler } from '../backnav'

const ORDER: AttendStatus[] = ['present', 'late', 'leave', 'absent']

/** 이 길이를 넘는 사유는 좁은 반 칸에 안 들어감 → 그 항목만 한 행 전체를 쓴다 */
const WIDE_NOTE_LEN = 8

export default function AttendanceModal({
  ev,
  list,
  members,
  mode,
  readOnly = false,
  onClose,
}: {
  ev: BandEvent
  list: Attendance[]
  members: Member[]
  /** 'vote' = 투표 입력창, 'summary' = 참석 현황 요약 */
  mode: 'vote' | 'summary'
  readOnly?: boolean
  onClose: () => void
}) {
  const { user, member } = useAuth()
  useBackHandler(onClose) // 뒤로가기로 참석 모달 닫기 (내부 취소 확인창은 ConfirmDialog 가 먼저 받는다)
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [reminding, setReminding] = useState(false)
  const [remindMsg, setRemindMsg] = useState('')

  const mine = useMemo(() => list.find((a) => a.uid === user?.uid), [list, user])
  // 저장된 사유가 바뀌면 입력값 동기화 (투표 취소·재투표 포함)
  useEffect(() => setNoteText(mine?.note ?? ''), [mine?.uid, mine?.note])
  const lateOpts = useMemo(() => lateOptions(ev.rehStart, ev.rehEnd), [ev.rehStart, ev.rehEnd])
  const leaveOpts = useMemo(() => leaveOptions(ev.rehStart, ev.rehEnd), [ev.rehStart, ev.rehEnd])

  async function choose(status: AttendStatus) {
    if (!user || !member || saving) return
    // 이미 선택한 항목을 다시 누르면 → 취소 확인창
    if (mine?.status === status) {
      setConfirmCancel(true)
      return
    }
    setSaving(true)
    try {
      const att: Attendance = {
        uid: user.uid,
        name: member.name,
        status,
        updatedAt: Date.now(),
      }
      if (status === 'late') att.arriveTime = mine?.arriveTime && lateOpts.includes(mine.arriveTime) ? mine.arriveTime : lateOpts[0]
      if (status === 'leave') att.leaveTime = mine?.leaveTime && leaveOpts.includes(mine.leaveTime) ? mine.leaveTime : leaveOpts[leaveOpts.length - 1]
      // 상태 바꿔도 사유는 유지
      if (mine?.note) att.note = mine.note
      await setAttendance(ev.id, att)
    } finally {
      setSaving(false)
    }
  }

  async function doCancel() {
    setConfirmCancel(false)
    if (!user) return
    setSaving(true)
    try {
      await clearAttendance(ev.id, user.uid)
    } finally {
      setSaving(false)
    }
  }

  async function setTime(field: 'arriveTime' | 'leaveTime', value: string) {
    if (!user || !member || !mine) return
    await setAttendance(ev.id, { ...mine, [field]: value, updatedAt: Date.now() })
  }

  async function saveNote() {
    if (!user || !member || !mine) return
    const v = noteText.trim()
    if (v === (mine.note ?? '')) return
    await setAttendance(ev.id, { ...mine, note: v, updatedAt: Date.now() })
  }

  const byStatus = (s: AttendStatus) => list.filter((a) => a.status === s)
  const votedUids = new Set(list.map((a) => a.uid))
  // 투표자 이름은 현재 멤버 프로필(라이브)을 우선, 없으면 투표 당시 스냅샷
  const memberMap = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members])
  const nameOf = (uid: string, snapshot: string) => memberMap.get(uid)?.name ?? snapshot
  // 미정 = 명시적으로 '미정' 선택(사유를 남길 수 있음) + 아직 투표 안 한 멤버
  const undecided = [
    ...list
      .filter((a) => a.status === 'undecided')
      .map((a) => ({ uid: a.uid, name: nameOf(a.uid, a.name), note: a.note })),
    ...members
      .filter((m) => !votedUids.has(m.uid))
      .map((m) => ({ uid: m.uid, name: m.name, note: undefined as string | undefined })),
  ]
  const d = parseDate(ev.date)

  // 리마인더: 합주·공연 일정에서, 관리자에게만, 미정이 있을 때만
  const canRemind =
    !readOnly &&
    !!member?.admin &&
    (ev.type === 'practice' || ev.type === 'show') &&
    undecided.length > 0

  async function sendReminder() {
    if (reminding) return
    setReminding(true)
    setRemindMsg('')
    try {
      const sent = await remindUndecided(ev.id)
      setRemindMsg(sent > 0 ? `${sent}건 발송했어요` : '보낼 대상이 없어요 (알림 켠 미정 멤버 없음)')
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? ''
      setRemindMsg('발송 실패' + (msg ? ` — ${msg}` : ''))
    } finally {
      setReminding(false)
    }
  }

  const heading = mode === 'vote' ? '참석 투표' : readOnly ? '참석 결과' : '참석 현황'

  return (
    <>
      <Sheet onClose={onClose}>
          <h2>{heading}</h2>

          <div className="modal-evhead" style={{ ['--k' as string]: TYPE_META[ev.type].color }}>
            <div className="tag"><TypeGlyph type={ev.type} className="type-ico" />{TYPE_META[ev.type].label}</div>
            <h3>{ev.title}</h3>
            <p>{d.getMonth() + 1}월 {d.getDate()}일 ({weekday(ev.date)}) · {ev.rehStart}–{ev.rehEnd}</p>
          </div>

          {/* ── 투표 모드 ── */}
          {mode === 'vote' && (
            <>
              <div className="vote-row">
                {ORDER.map((s) => (
                  <button
                    key={s}
                    className={'vote-btn' + (mine?.status === s ? ' on' : '')}
                    style={{ ['--k' as string]: STATUS_META[s].color }}
                    onClick={() => choose(s)}
                    disabled={saving}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <button
                className={'vote-btn vote-undecided' + (mine?.status === 'undecided' ? ' on' : '')}
                style={{ ['--k' as string]: STATUS_META.undecided.color }}
                onClick={() => choose('undecided')}
                disabled={saving}
              >
                미정
              </button>

              {mine?.status === 'late' && (
                <div className="time-pick">
                  <label>도착 예정 시각</label>
                  <ThemeSelect
                    title="도착 예정 시각"
                    value={mine.arriveTime ?? lateOpts[0]}
                    onChange={(v) => setTime('arriveTime', v)}
                    options={lateOpts.map((t) => ({ value: t, label: t }))}
                  />
                </div>
              )}
              {mine?.status === 'leave' && (
                <div className="time-pick">
                  <label>조퇴 시각</label>
                  <ThemeSelect
                    title="조퇴 시각"
                    value={mine.leaveTime ?? leaveOpts[leaveOpts.length - 1]}
                    onChange={(v) => setTime('leaveTime', v)}
                    options={leaveOpts.map((t) => ({ value: t, label: t }))}
                  />
                </div>
              )}

              {mine && (
                <textarea
                  className="note-input"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onBlur={saveNote}
                  placeholder="사유·한마디 (선택)"
                  rows={2}
                  maxLength={100}
                />
              )}

              <div className="actions">
                <button type="button" className="btn primary block" onClick={onClose}>확인</button>
              </div>
            </>
          )}

          {/* ── 요약 모드 ── */}
          {mode === 'summary' && (
            <>
              {/* 인원 · 시간 상세 집계 */}
              <div className="tally">
                {ORDER.map((s) => {
                  const people = byStatus(s)
                  return (
                    <div key={s} className="tally-col">
                      <div className="tally-head" style={{ ['--k' as string]: STATUS_META[s].color }}>
                        <span className="dot" />
                        {STATUS_META[s].label}
                        <b>{people.length}</b>
                      </div>
                      <ul>
                        {people.length === 0 && <li className="muted">-</li>}
                        {people.map((p) => (
                          <li key={p.uid} className={(p.note?.length ?? 0) > WIDE_NOTE_LEN ? 'wide' : undefined}>
                            {nameOf(p.uid, p.name)}
                            {p.status === 'late' && p.arriveTime && <em> · {p.arriveTime}</em>}
                            {p.status === 'leave' && p.leaveTime && <em> · {p.leaveTime}</em>}
                            {p.note && <span className="li-note">{p.note}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
                {undecided.length > 0 && (
                  <div className="tally-col undecided" style={{ ['--k' as string]: 'var(--undecided)' }}>
                    <div className="tally-head">
                      <span className="dot" />
                      미정
                      <b>{undecided.length}</b>
                    </div>
                    <ul>
                      {undecided.map((m) => (
                        <li key={m.uid} className={m.note ? 'has-note' : undefined}>
                          {m.name}
                          {m.note && <span className="u-note"> · {m.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 파트별 참석 (참석·늦참·조퇴 기준) — 합주곡 시트와 같은 컴포넌트 */}
              <PartTally members={members} att={list} />

              {canRemind && (
                <button type="button" className="btn primary block remind-btn" onClick={sendReminder} disabled={reminding}>
                  {reminding ? '보내는 중…' : `미정 ${undecided.length}명에게 투표 요청`}
                </button>
              )}
              {remindMsg && <p className="remind-msg">{remindMsg}</p>}

              <div className="actions">
                <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
              </div>
            </>
          )}
      </Sheet>

      {confirmCancel && (
        <ConfirmDialog
          message={`'${mine ? STATUS_META[mine.status].label : ''}' 투표를 취소할까요?`}
          confirmLabel="투표 취소"
          cancelLabel="닫기"
          danger
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  )
}
