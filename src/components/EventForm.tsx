import { useState } from 'react'
import { useAuth } from '../auth'
import { deleteEvent, newId, saveEvent } from '../data'
import {
  DEFAULT_REH_END,
  DEFAULT_REH_START,
  TYPE_META,
  type BandEvent,
  type EventType,
  type Place,
} from '../types'
import { todayStr, toMin } from '../time'
import { TypeGlyph } from './TypeGlyph'
import { useSheetSwipe } from './useSheetSwipe'

export default function EventForm({
  editing,
  places,
  onClose,
}: {
  editing: BandEvent | null
  places: Place[]
  onClose: () => void
}) {
  const { user } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [type, setType] = useState<EventType>(editing?.type ?? 'practice')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(editing?.date ?? todayStr())
  const [rehStart, setRehStart] = useState(editing?.rehStart ?? DEFAULT_REH_START)
  const [rehEnd, setRehEnd] = useState(editing?.rehEnd ?? DEFAULT_REH_END)
  const [placeId, setPlaceId] = useState(editing?.placeId ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 레거시(직접 입력) 장소: placeId 없이 loc 텍스트만 있던 기존 일정
  const legacyLoc = editing && !editing.placeId ? (editing.loc ?? '') : ''

  const canDelete = editing && user && editing.createdBy === user.uid
  const timeValid = toMin(rehEnd) > toMin(rehStart)
  const valid = title.trim() && date && timeValid

  async function submit() {
    if (!valid || !user || busy) return
    setBusy(true)
    setErr('')
    try {
      const ev: BandEvent = {
        id: editing?.id ?? newId(),
        type,
        title: title.trim(),
        date,
        rehStart,
        rehEnd,
        // 장소를 골랐으면 placeId, 아니면 레거시 직접입력(loc)을 유지 (둘 중 하나만)
        placeId: placeId || undefined,
        loc: placeId ? undefined : legacyLoc || undefined,
        note: note.trim(),
        createdBy: editing?.createdBy ?? user.uid,
        createdAt: editing?.createdAt ?? Date.now(),
      }
      await saveEvent(ev)
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '저장 권한이 없어요. Firestore 보안 규칙이 게시됐는지 확인해 주세요.'
          : '저장에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing || !canDelete) return
    if (!confirm('이 일정을 삭제할까요? 참석 투표도 함께 사라집니다.')) return
    setBusy(true)
    try {
      await deleteEvent(editing.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>{editing ? '일정 수정' : '일정 추가'}</h2>

        <div className="field">
          <label>유형</label>
          <div className="type-pick">
            {(Object.keys(TYPE_META) as EventType[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={type === k}
                style={{ ['--k' as string]: TYPE_META[k].color }}
                onClick={() => setType(k)}
              >
                <TypeGlyph type={k} className="type-ico" />
                {TYPE_META[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-title">제목</label>
          <input id="f-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 8월 정기 모임" maxLength={60} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="f-date">날짜</label>
          <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label>진행 시간</label>
          <div className="time-range">
            <input type="time" step={1800} value={rehStart} onChange={(e) => setRehStart(e.target.value)} />
            <span>–</span>
            <input type="time" step={1800} value={rehEnd} onChange={(e) => setRehEnd(e.target.value)} />
          </div>
          {!timeValid && <p className="err small">종료 시간이 시작 시간보다 늦어야 해요.</p>}
          <p className="hint">기본 18:00–22:00. 늦참·조퇴 시각은 이 범위 안에서만 선택됩니다.</p>
        </div>

        <div className="field">
          <label htmlFor="f-place">장소</label>
          <select id="f-place" className="place-select" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">장소 없음</option>
            {legacyLoc && !places.some((p) => p.name === legacyLoc) && (
              <option value="" disabled>
                (현재: {legacyLoc} — 직접 입력)
              </option>
            )}
            {places.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {places.length === 0 ? (
            <p className="hint">등록된 장소가 없어요. 헤더의 톱니(⚙) 아이콘 → 장소 관리에서 먼저 추가하세요.</p>
          ) : (
            <p className="hint">장소는 헤더의 톱니(⚙) 아이콘 → 장소 관리에서 추가·수정해요.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="f-note">메모 (선택)</label>
          <textarea id="f-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="준비물, 곡 목록 등" maxLength={400} />
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          {canDelete && <button type="button" className="btn danger" onClick={remove} disabled={busy}>삭제</button>}
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
