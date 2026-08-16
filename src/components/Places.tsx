import { useState } from 'react'
import { useAuth } from '../auth'
import type { Place } from '../types'
import { CopyButton } from './CopyButton'
import type { ToastState } from './Toast'
import PlaceForm from './PlaceForm'

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
