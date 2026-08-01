import { useEffect, useState } from 'react'
import { deletePlace, newId, saveFcmToken, savePlace, watchPlaces } from '../data'
import { useAuth } from '../auth'
import { notificationPermission, pushConfigured, requestPushToken } from '../messaging'
import type { Place } from '../types'
import { CopyButton } from './CopyButton'
import Toast, { useToast } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'

type Editing = Place | 'new' | null

export default function Settings({ onClose }: { onClose: () => void }) {
  const [places, setPlaces] = useState<Place[]>([])
  const [editing, setEditing] = useState<Editing>(null)
  const [loadErr, setLoadErr] = useState('')
  const toast = useToast()

  useEffect(
    () =>
      watchPlaces(setPlaces, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '장소를 불러올 권한이 없어요. Firestore 보안 규칙을 다시 게시해 주세요.'
            : '장소를 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )

  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <button className="ghost-btn icon" onClick={onClose} aria-label="뒤로">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="brand">
            <h1>장소 관리</h1>
            <p>일정 장소를 등록해두면 일정에서 선택할 수 있어요</p>
          </div>
        </div>
      </header>

      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        <NotifCard />

        {places.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            <p>등록된 장소가 없어요.<br />아래 <b>+ 장소 추가</b>로 시작하세요.</p>
          </div>
        ) : (
          <div className="list place-list">
            {places.map((p) => (
              <div key={p.id} className="place-row">
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
            ))}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setEditing('new')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        장소 추가
      </button>

      {editing !== null && (
        <PlaceForm
          editing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <Toast state={toast} />
    </div>
  )
}

function NotifCard() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'enabling' | 'on' | 'off' | 'denied' | 'unavailable'>(
    !pushConfigured()
      ? 'unavailable'
      : notificationPermission() === 'granted'
        ? 'on'
        : notificationPermission() === 'denied'
          ? 'denied'
          : 'idle',
  )

  async function enable() {
    if (!user) return
    setState('enabling')
    try {
      const token = await requestPushToken()
      if (token) {
        await saveFcmToken(user.uid, token)
        setState('on')
      } else {
        setState(notificationPermission() === 'denied' ? 'denied' : 'off')
      }
    } catch {
      setState('off')
    }
  }

  const msg =
    state === 'on'
      ? '이 기기에서 알림을 받는 중이에요.'
      : state === 'denied'
        ? '브라우저에서 알림이 차단됐어요. 사이트 설정에서 허용해 주세요.'
        : state === 'unavailable'
          ? '이 환경에서는 알림을 사용할 수 없어요. (설정 필요 또는 미지원 브라우저)'
          : '새 일정·투표 요청 알림을 이 기기에서 받으려면 켜주세요.'

  return (
    <div className="notif-card">
      <div className="notif-info">
        <h3>알림</h3>
        <p>{msg}</p>
      </div>
      {state === 'on' ? (
        <span className="notif-on">✓ 켜짐</span>
      ) : state === 'idle' || state === 'off' || state === 'enabling' ? (
        <button className="btn primary" onClick={enable} disabled={state === 'enabling'}>
          {state === 'enabling' ? '설정 중…' : '알림 켜기'}
        </button>
      ) : null}
    </div>
  )
}

function PlaceForm({ editing, onClose }: { editing: Place | null; onClose: () => void }) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [name, setName] = useState(editing?.name ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
        createdAt: editing?.createdAt ?? Date.now(),
      }
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
          <label htmlFor="p-addr">주소</label>
          <textarea id="p-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예) 서울 마포구 와우산로 00, 지하 1층" maxLength={120} />
          <p className="hint">메인 화면의 복사 버튼이 이 주소를 복사합니다.</p>
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
