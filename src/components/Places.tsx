import { useState } from 'react'
import { useAuth } from '../auth'
import { deletePlace, newId, savePlace } from '../data'
import type { Place } from '../types'
import { isMockSearch, searchPlaces, type PlaceHit } from '../mapsearch'
import { CopyButton } from './CopyButton'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

type Editing = Place | 'new' | null

/** 장소 관리 뷰 — 하단 네비의 '장소' 탭 본문 (목록 + 추가/수정 + 메모) */
export default function PlacesView({
  places,
  loadErr,
  toast,
}: {
  places: Place[]
  loadErr: string
  toast: ToastState
}) {
  const { member } = useAuth()
  const isAdmin = !!member?.admin
  const [editing, setEditing] = useState<Editing>(null)

  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {places.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            <p>
              등록된 장소가 없어요.
              {isAdmin && (
                <>
                  <br />
                  아래 <b>+ 장소 추가</b>로 시작하세요.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="list place-list">
            {places.map((p) => (
              <div key={p.id} className="place-row">
                <div className="place-head">
                  <div className="place-info">
                    <h3>{p.name}</h3>
                    {p.address && (
                      <div className="place-addr">
                        <span>{p.address}</span>
                        <CopyButton text={p.address} onCopied={() => toast.show('주소가 복사되었어요')} />
                      </div>
                    )}
                  </div>
                  <button className="edit-btn" onClick={() => setEditing(p)} aria-label="수정">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                </div>
                {p.memo && <p className="place-memo">{p.memo}</p>}
              </div>
            ))}
          </div>
        )}
      </main>

      {isAdmin && (
        <button className="fab" onClick={() => setEditing('new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          장소 추가
        </button>
      )}

      {editing !== null && (
        <PlaceForm editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function PlaceForm({ editing, onClose }: { editing: Place | null; onClose: () => void }) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose) // 뒤로가기로 장소 폼 닫기 (일정 탭으로 튀지 않고 장소에 머무름)
  const [name, setName] = useState(editing?.name ?? '')
  const [memo, setMemo] = useState(editing?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 주소는 지도 검색으로 선택된 값만 허용 (임의 입력 불가)
  const [address, setAddress] = useState(editing?.address ?? '')
  const [coord, setCoord] = useState<{ lat?: number; lng?: number }>({ lat: editing?.lat, lng: editing?.lng })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchErr, setSearchErr] = useState('')

  async function runSearch() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchErr('')
    try {
      const hits = await searchPlaces(q)
      setResults(hits)
      setSearched(true)
    } catch {
      setSearchErr('검색에 실패했어요. 지도 키 설정을 확인해 주세요.')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function pick(h: PlaceHit) {
    setAddress(h.address)
    setCoord({ lat: h.lat, lng: h.lng })
    if (!name.trim()) setName(h.name) // 이름이 비어 있으면 검색 장소명으로 채움
    setResults([])
    setSearched(false)
    setQuery('')
  }

  function clearPicked() {
    setAddress('')
    setCoord({})
  }

  const valid = name.trim().length > 0

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setErr('')
    try {
      const p: Place = {
        id: editing?.id ?? newId(),
        name: name.trim(),
        address: address.trim(),
        lat: coord.lat,
        lng: coord.lng,
        memo: memo.trim(),
        createdAt: editing?.createdAt ?? Date.now(),
      }
      if (!p.memo) delete p.memo // 빈 메모는 저장하지 않음
      if (!p.address) { p.address = ''; delete p.lat; delete p.lng } // 주소 미선택 시 좌표 제거
      if (p.lat === undefined) delete p.lat // Firestore는 undefined 거부
      if (p.lng === undefined) delete p.lng
      await savePlace(p)
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '저장 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
          : '저장에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!confirm('이 장소를 삭제할까요? 이 장소를 쓰던 일정에서는 장소가 비워집니다.')) return
    setBusy(true)
    try {
      await deletePlace(editing.id)
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
        <h2>{editing ? '장소 수정' : '장소 추가'}</h2>

        <div className="field">
          <label htmlFor="p-name">장소 이름</label>
          <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 사운드리 3스튜디오" maxLength={40} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="p-search">주소 (지도 검색)</label>
          {address ? (
            <div className="place-picked">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              <span>{address}</span>
              <button type="button" className="btn text small" onClick={clearPicked}>변경</button>
            </div>
          ) : (
            <>
              <div className="place-search">
                <input
                  id="p-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                  placeholder="장소명·주소로 검색 (예: 영화동 합주실)"
                  maxLength={60}
                  autoFocus={!editing}
                />
                <button type="button" className="btn primary place-search-btn" onClick={runSearch} disabled={!query.trim() || searching}>
                  {searching ? '…' : '검색'}
                </button>
              </div>
              {results.length > 0 && (
                <ul className="place-results">
                  {results.map((r, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => pick(r)}>
                        <b>{r.name}</b>
                        <span>{r.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searched && !searching && results.length === 0 && !searchErr && (
                <p className="hint">검색 결과가 없어요. 다른 이름·주소로 검색해 보세요.</p>
              )}
              {searchErr && <p className="err small">{searchErr}</p>}
            </>
          )}
          <p className="hint">
            지도에서 검색되는 실제 장소만 추가할 수 있어요. 복사 버튼이 이 주소를 복사합니다.
            {isMockSearch() && <><br /><b>※ 지도 키 미설정 — 지금은 예시(목업) 검색입니다.</b></>}
          </p>
        </div>

        <div className="field">
          <label htmlFor="p-memo">메모 (선택)</label>
          <textarea id="p-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예) 주차: 건물 뒤편 무료 / 현관 비밀번호 1234*" maxLength={300} rows={3} />
          <p className="hint">주차장·현관 비밀번호 등 도착에 필요한 정보를 남겨두세요.</p>
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          {editing && <button type="button" className="btn danger" onClick={remove} disabled={busy}>삭제</button>}
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
