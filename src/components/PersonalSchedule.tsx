import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import { deleteEvent, deleteEventType, newId, saveEvent, saveEventType, watchEventTypes, watchEvents } from '../data'
import { PASTEL_PALETTE, type BandEvent, type CustomEventType, type EventType } from '../types'
import { parseDate, todayStr, weekday } from '../time'
import { EventIcon, searchIcons } from '../eventIcons'
import CalendarView from './CalendarView'
import ConfirmDialog from './ConfirmDialog'
import { useSheetSwipe } from './useSheetSwipe'
import type { ToastState } from './Toast'

/** 개인 채널 일정 — 밴드 캘린더 뷰를 재사용하되, 유형(플래그)은 사용자가 직접 정의(이모지+파스텔). */
export default function PersonalSchedule({ toast }: { toast: ToastState }) {
  const { user } = useAuth()
  const [events, setEvents] = useState<BandEvent[]>([])
  const [types, setTypes] = useState<CustomEventType[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState(todayStr())
  const [editing, setEditing] = useState<BandEvent | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => watchEvents(setEvents, () => setLoadErr('일정을 불러오지 못했어요.')), [])
  useEffect(() => watchEventTypes(setTypes, () => {}), [])

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
  const shown = filter === 'all' ? events : events.filter((e) => e.type === filter)

  function calShift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  function openAdd() { setEditing(null); setFormOpen(true) }
  function openEdit(ev: BandEvent) { setEditing(ev); setFormOpen(true) }

  const resolveType = (t: string) => ({ color: typeMap.get(t)?.color ?? 'var(--ink-faint)' })

  return (
    <>
      {types.length > 0 && (
        <div className="filters">
          <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            <span className="dot" />전체
          </button>
          {types.map((t) => (
            <button key={t.id} className="chip" aria-pressed={filter === t.id} style={{ ['--k' as string]: t.color }} onClick={() => setFilter(t.id)}>
              <EventIcon id={t.emoji} className="type-ico" />{t.name}
            </button>
          ))}
        </div>
      )}

      <div className="home-topbar">
        <div className="cal-navbar">
          <button className="cal-nav" onClick={() => calShift(-1)} aria-label="이전 달">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button className="cal-title" onClick={() => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelected(todayStr()) }}>{cursor.y}년 {cursor.m + 1}월</button>
          <button className="cal-nav" onClick={() => calShift(1)} aria-label="다음 달">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}
        <CalendarView
          events={shown}
          placesMap={new Map()}
          members={[]}
          toast={toast}
          onEdit={openEdit}
          cursor={cursor}
          selected={selected}
          onSelect={setSelected}
          resolveType={resolveType}
          renderEvent={(ev) => <PersonalEventCard ev={ev} type={typeMap.get(ev.type)} onEdit={() => openEdit(ev)} toast={toast} />}
        />
      </main>

      <button className="fab" onClick={openAdd} disabled={!user}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        일정 추가
      </button>

      {formOpen && (
        <PersonalEventForm
          editing={editing}
          types={types}
          defaultDate={selected}
          creatorUid={user?.uid ?? ''}
          toast={toast}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  )
}

/** 개인 일정 카드 (밴드 EventCard 대신 단순 표시: 이모지·제목·시간·메모·수정/삭제) */
function PersonalEventCard({ ev, type, onEdit, toast }: { ev: BandEvent; type?: CustomEventType; onEdit: () => void; toast: ToastState }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const d = parseDate(ev.date)
  const color = type?.color ?? 'var(--ink-faint)'
  async function doDelete() {
    setConfirmDel(false)
    try { await deleteEvent(ev.id); toast.show('일정을 삭제했어요') } catch { toast.show('삭제에 실패했어요') }
  }
  return (
    <div className="event ps-event" style={{ ['--k' as string]: color }}>
      <div className="event-row">
        <div className="datebox">
          <div className="m">{d.getMonth() + 1}월</div>
          <div className="d">{d.getDate()}</div>
          <div className="w">({weekday(ev.date)})</div>
        </div>
        <div className="einfo">
          <div className="etitle">
            <EventIcon id={type?.emoji} className="type-ico ps-emoji" />
            <h3>{ev.title}</h3>
          </div>
          <div className="sub">
            {(ev.rehStart || ev.rehEnd) && (
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                {ev.rehStart}{ev.rehEnd ? `–${ev.rehEnd}` : ''}
              </span>
            )}
            {type && <span className="ps-type-tag">{type.name}</span>}
          </div>
        </div>
        <div className="card-actions">
          <div className="ca-top">
            <button className="edit-btn" onClick={onEdit} aria-label="수정">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button className="edit-btn del" onClick={() => setConfirmDel(true)} aria-label="삭제">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
      {ev.note && <div className="event-note open"><p className="event-note-text">{ev.note}</p></div>}
      {confirmDel && (
        <ConfirmDialog message={`'${ev.title}' 일정을 삭제할까요?`} confirmLabel="삭제" cancelLabel="닫기" danger onConfirm={() => void doDelete()} onCancel={() => setConfirmDel(false)} />
      )}
    </div>
  )
}

/** 개인 일정 추가/수정 시트 */
function PersonalEventForm({ editing, types, defaultDate, creatorUid, toast, onClose }: {
  editing: BandEvent | null
  types: CustomEventType[]
  defaultDate: string
  creatorUid: string
  toast: ToastState
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(editing?.date ?? defaultDate)
  const [start, setStart] = useState(editing?.rehStart ?? '')
  const [end, setEnd] = useState(editing?.rehEnd ?? '')
  const [typeId, setTypeId] = useState<string>(editing?.type ?? types[0]?.id ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [typeForm, setTypeForm] = useState<CustomEventType | 'new' | null>(null)

  // 유형이 새로 생기면 자동 선택
  useEffect(() => {
    if (!typeId && types[0]) setTypeId(types[0].id)
  }, [types, typeId])

  async function submit() {
    if (!title.trim() || !date || !typeId || busy) { setErr(!typeId ? '유형을 선택하거나 만들어 주세요.' : ''); return }
    setBusy(true); setErr('')
    try {
      const ev: BandEvent = {
        id: editing?.id ?? newId(),
        type: typeId as unknown as EventType, // 개인 채널은 커스텀 유형 id 저장
        title: title.trim(),
        date,
        rehStart: start,
        rehEnd: end,
        note: note.trim(),
        createdBy: editing?.createdBy ?? creatorUid,
        createdAt: editing?.createdAt ?? Date.now(),
      }
      await saveEvent(ev)
      toast.show(editing ? '일정을 수정했어요' : '일정을 추가했어요')
      onClose()
    } catch {
      setErr('저장하지 못했어요.'); setBusy(false)
    }
  }

  return (
    <>
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}><div className="grab" /></div>
          <h2>{editing ? '일정 수정' : '일정 추가'}</h2>
          <div className="field"><label htmlFor="pe-title">제목</label><input id="pe-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus /></div>
          <div className="field-row">
            <div className="field"><label htmlFor="pe-date">날짜</label><input id="pe-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="field"><label htmlFor="pe-start">시작</label><input id="pe-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="field"><label htmlFor="pe-end">종료</label><input id="pe-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>유형</label>
            <div className="ps-type-pick">
              {types.map((t) => (
                <button key={t.id} type="button" className="ps-type-opt" aria-pressed={typeId === t.id} style={{ ['--k' as string]: t.color }} onClick={() => setTypeId(t.id)} onDoubleClick={() => setTypeForm(t)}>
                  <EventIcon id={t.emoji} className="type-ico" />{t.name}
                </button>
              ))}
              <button type="button" className="ps-type-opt ps-type-new" onClick={() => setTypeForm('new')}>＋ 새 유형</button>
            </div>
            {types.length > 0 && <p className="hint ps-type-hint">유형을 길게(더블클릭) 누르면 수정할 수 있어요.</p>}
          </div>
          <div className="field"><label htmlFor="pe-note">메모</label><textarea id="pe-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} /></div>
          {err && <p className="err small">{err}</p>}
          <div className="actions">
            <button className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
            <button className="btn primary" onClick={() => void submit()} disabled={!title.trim() || !date || !typeId || busy}>{busy ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      </div>
      {typeForm && (
        <TypeForm
          editing={typeForm === 'new' ? null : typeForm}
          nextOrder={types.length ? Math.max(...types.map((t) => t.order ?? t.createdAt ?? 0)) + 1 : 0}
          creatorUid={creatorUid}
          toast={toast}
          onSaved={(id) => { setTypeId(id); setTypeForm(null) }}
          onDeleted={() => { if (typeForm !== 'new' && typeId === typeForm.id) setTypeId(''); setTypeForm(null) }}
          onClose={() => setTypeForm(null)}
        />
      )}
    </>
  )
}

/** 사용자 정의 유형 만들기/수정 — 이름 + 이모지 검색 + 파스텔 색상 */
function TypeForm({ editing, nextOrder, creatorUid, toast, onSaved, onDeleted, onClose }: {
  editing: CustomEventType | null
  nextOrder: number
  creatorUid: string
  toast: ToastState
  onSaved: (id: string) => void
  onDeleted: () => void
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? 'bookmark')
  const [color, setColor] = useState(editing?.color ?? PASTEL_PALETTE[0].color)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const results = searchIcons(query)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    const id = editing?.id ?? newId()
    try {
      await saveEventType({
        id, name: name.trim(), emoji, color,
        order: editing?.order ?? nextOrder,
        createdBy: editing?.createdBy ?? creatorUid,
        createdAt: editing?.createdAt ?? Date.now(),
      })
      toast.show(editing ? '유형을 수정했어요' : '유형을 만들었어요')
      onSaved(id)
    } catch { toast.show('저장하지 못했어요'); setBusy(false) }
  }
  async function doDelete() {
    if (!editing) return
    setConfirmDel(false); setBusy(true)
    try { await deleteEventType(editing.id); toast.show('유형을 삭제했어요'); onDeleted() } catch { toast.show('삭제하지 못했어요'); setBusy(false) }
  }

  return (
    <>
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}><div className="grab" /></div>
          <h2>{editing ? '유형 수정' : '새 유형'}</h2>
          <div className="tf-preview">
            <span className="tf-chip" style={{ ['--k' as string]: color }}><EventIcon id={emoji} className="type-ico" />{name.trim() || '유형 이름'}</span>
          </div>
          <div className="field"><label htmlFor="tf-name">이름</label><input id="tf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus placeholder="예) 운동, 공부, 약속" /></div>
          <div className="field">
            <label>색상</label>
            <div className="tf-colors">
              {PASTEL_PALETTE.map((p) => (
                <button key={p.color} type="button" className={'tf-color' + (color === p.color ? ' on' : '')} style={{ background: p.color }} onClick={() => setColor(p.color)} aria-label={p.name} title={p.name} />
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="tf-emoji-q">아이콘</label>
            <input id="tf-emoji-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="아이콘 검색 (예: 운동, 공부, 여행…)" />
            <div className="tf-emoji-grid">
              {results.map((item) => (
                <button key={item.id} type="button" className={'tf-icon' + (emoji === item.id ? ' on' : '')} style={{ ['--k' as string]: color }} onClick={() => setEmoji(item.id)} aria-label={item.id}>
                  <EventIcon id={item.id} className="type-ico" />
                </button>
              ))}
              {results.length === 0 && <p className="hint" style={{ margin: '4px 2px' }}>검색 결과가 없어요.</p>}
            </div>
          </div>
          <div className="actions">
            {editing && <button className="btn danger" onClick={() => setConfirmDel(true)} disabled={busy}>삭제</button>}
            <button className="btn subtle grow" onClick={onClose} disabled={busy}>취소</button>
            <button className="btn primary" onClick={() => void submit()} disabled={!name.trim() || busy}>{busy ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      </div>
      {confirmDel && (
        <ConfirmDialog message={`'${editing?.name}' 유형을 삭제할까요? 이 유형을 쓰던 일정은 기본 색으로 표시돼요.`} confirmLabel="삭제" cancelLabel="닫기" danger onConfirm={() => void doDelete()} onCancel={() => setConfirmDel(false)} />
      )}
    </>
  )
}
