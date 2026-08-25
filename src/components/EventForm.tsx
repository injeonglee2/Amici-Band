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
import ThemeSelect from './ThemeSelect'
import Sheet from './Sheet'
import { useBackHandler } from '../backnav'
import { searchPlaces, type PlaceHit } from '../mapsearch'

export default function EventForm({
  editing,
  places,
  onClose,
}: {
  editing: BandEvent | null
  places: Place[]
  onClose: () => void
}) {
  const { user, member } = useAuth()
  useBackHandler(onClose) // 뒤로가기로 일정 폼 닫기
  const grapePlaceId = places.find((p) => p.name === '포도나무 합주실')?.id
  // 유형별 기본값: 합주 → 포도나무 합주실·18:00~22:00, 그 외 → 초기화
  function presetFor(t: EventType) {
    if (t === 'practice') {
      return { placeId: grapePlaceId ?? '', loc: grapePlaceId ? '' : '포도나무 합주실', rehStart: '18:00', rehEnd: '22:00' }
    }
    return { placeId: '', loc: '', rehStart: DEFAULT_REH_START, rehEnd: DEFAULT_REH_END }
  }
  // 수정: 저장된 값 그대로 / 추가: 기본 유형(합주) 프리셋으로 시작
  const seed = editing
    ? {
        placeId: editing.placeId ?? '',
        loc: editing.placeId ? '' : editing.loc ?? '',
        rehStart: editing.rehStart ?? DEFAULT_REH_START,
        rehEnd: editing.rehEnd ?? DEFAULT_REH_END,
      }
    : presetFor('practice')

  const [type, setType] = useState<EventType>(editing?.type ?? 'practice')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(editing?.date ?? todayStr())
  const [rehStart, setRehStart] = useState(seed.rehStart)
  const [rehEnd, setRehEnd] = useState(seed.rehEnd)
  const [placeId, setPlaceId] = useState(seed.placeId)
  // 직접 입력 장소(이 일정만, 장소 목록에는 저장 안 함). 등록 장소 미선택일 때만 사용
  const [loc, setLoc] = useState(seed.loc)

  // 유형 버튼을 누르면 그 유형의 기본값을 채운다(합주=포도나무·18~22, 나머지=초기화)
  function chooseType(t: EventType) {
    setType(t)
    const p = presetFor(t)
    setPlaceId(p.placeId)
    setLoc(p.loc)
    setRehStart(p.rehStart)
    setRehEnd(p.rehEnd)
  }
  const [note, setNote] = useState(editing?.note ?? '')
  const [adminOnly, setAdminOnly] = useState(editing?.adminOnly ?? false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 직접 입력 장소 지도 검색 (일회성 — 골라도 장소 목록에는 저장하지 않고 이 일정의 loc 로만 씀)
  const [placeResults, setPlaceResults] = useState<PlaceHit[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)

  async function runPlaceSearch() {
    const q = loc.trim()
    if (!q || placeSearching) return
    setPlaceSearching(true)
    try {
      setPlaceResults(await searchPlaces(q))
    } catch {
      setPlaceResults([])
    } finally {
      setPlaceSearching(false)
    }
  }
  function pickPlace(h: PlaceHit) {
    setLoc(h.name)
    setPlaceResults([])
  }

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
        // 등록 장소를 골랐으면 placeId, 아니면 직접 입력(loc). 둘 중 하나만 저장
        placeId: placeId || undefined,
        loc: placeId ? undefined : loc.trim() || undefined,
        note: note.trim(),
        // 관리자만 설정 가능. 일반 일정은 필드를 생략해 기존 데이터와 같은 공개 상태로 저장한다.
        adminOnly: member?.admin && adminOnly ? true : undefined,
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
    <Sheet onClose={onClose}>
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
                onClick={() => chooseType(k)}
              >
                <TypeGlyph type={k} className="type-ico" />
                {TYPE_META[k].label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 + 날짜 한 줄: 제목이 남는 공간, 날짜는 내용 너비 */}
        <div className="evt-title-date">
          <div className="field evt-title">
            <label htmlFor="f-title">제목</label>
            <input id="f-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} autoFocus />
          </div>
          <div className="field evt-date">
            <label htmlFor="f-date">날짜</label>
            <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {/* 진행 시간 (제목·날짜 바로 아래) */}
        <div className="field">
          <label>진행 시간</label>
          <div className="time-range">
            <input type="time" step={1800} value={rehStart} onChange={(e) => setRehStart(e.target.value)} />
            <span>–</span>
            <input type="time" step={1800} value={rehEnd} onChange={(e) => setRehEnd(e.target.value)} />
          </div>
          {!timeValid && <p className="err small">종료 시간이 시작 시간보다 늦어야 해요.</p>}
        </div>

        {/* 장소: 등록 장소 선택 + 직접 지도 검색(한 줄). 검색 후 고르면 이 일정에만 쓰이고 목록엔 저장 안 함 */}
        <div className="field">
          <label htmlFor="f-place">장소</label>
          <div className="evt-place-row">
            <ThemeSelect
              title="장소"
              value={placeId}
              onChange={(v) => {
                setPlaceId(v)
                if (v) {
                  setLoc('')
                  setPlaceResults([])
                }
              }}
              options={[
                { value: '', label: '직접 입력 / 없음' },
                ...places.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            {!placeId && (
              <div className="place-search">
                <input
                  type="text"
                  value={loc}
                  onChange={(e) => setLoc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runPlaceSearch() } }}
                  placeholder="장소 검색"
                  maxLength={60}
                />
                <button type="button" className="btn primary place-search-btn" onClick={() => void runPlaceSearch()} disabled={!loc.trim() || placeSearching}>
                  {placeSearching ? '…' : '검색'}
                </button>
              </div>
            )}
          </div>
          {!placeId && placeResults.length > 0 && (
            <ul className="place-results">
              {placeResults.map((r, i) => (
                <li key={i}>
                  <button type="button" onClick={() => pickPlace(r)}>
                    <b>{r.name}</b>
                    <span>{r.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <label htmlFor="f-note">메모 (선택)</label>
          <textarea id="f-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={5} />
        </div>

        {!!member?.admin && (
          <div className="event-visibility-row">
            <div>
              <b>관리자만 보기</b>
              <span>관리자 일정 목록과 캘린더에만 표시</span>
            </div>
            <button
              type="button"
              className={'switch' + (adminOnly ? ' on' : '')}
              aria-label="관리자만 보기"
              aria-pressed={adminOnly}
              onClick={() => setAdminOnly((v) => !v)}
            >
              <span className="switch-knob" />
            </button>
          </div>
        )}

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          {canDelete && <button type="button" className="btn danger" onClick={remove} disabled={busy}>삭제</button>}
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
    </Sheet>
  )
}
