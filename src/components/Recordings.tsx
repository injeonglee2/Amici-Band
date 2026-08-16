import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { deleteRecording, newId, saveRecording, watchRecordings } from '../data'
import type { Recording, Track } from '../types'
import { fetchYouTubeMeta, parseVideoId, thumbnailUrl } from '../youtube'
import { parseDate, todayStr, weekday } from '../time'
import SetlistPlayer from './SetlistPlayer'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

function fmtDate(date: string): string {
  const d = parseDate(date)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${weekday(date)})`
}

/** 기록 탭 — 합주 녹음/영상 갤러리 (링크 기반). 지금은 관리자에게만 노출(다듬는 중) */
export default function RecordingsView({ toast }: { toast: ToastState }) {
  const [items, setItems] = useState<Recording[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(
    () =>
      watchRecordings(setItems, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '기록을 불러올 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.'
            : '기록을 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )

  const open = openId ? items.find((r) => r.id === openId) ?? null : null

  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {items.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>
            <p>기록이 없어요.<br />아래 <b>+ 기록 추가</b>로 유튜브·드라이브 링크를 올려보세요.</p>
          </div>
        ) : (
          <div className="rec-grid">
            {items.map((r) => (
              <button key={r.id} type="button" className="rec-card" onClick={() => setOpenId(r.id)}>
                <div className="rec-thumb">
                  {r.thumbnail || r.videoId ? (
                    <img src={r.thumbnail || thumbnailUrl(r.videoId ?? '')} alt="" loading="lazy" />
                  ) : (
                    <span className="rec-thumb-none" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  )}
                </div>
                <div className="rec-meta">
                  <h3>{r.title || '(제목 없음)'}</h3>
                  <p>{fmtDate(r.date)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        기록 추가
      </button>

      {adding && <RecordingForm toast={toast} onClose={() => setAdding(false)} />}
      {open && <RecordingPlayer rec={open} toast={toast} onClose={() => setOpenId(null)} />}
    </>
  )
}

/* ---------------- 기록 추가 시트 ---------------- */
function RecordingForm({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lastFetchedId = useRef<string | null>(null)

  const videoId = parseVideoId(url)
  const valid = title.trim().length > 0 && !!date && url.trim().length > 0

  // 링크가 유튜브면 제목을 자동으로 채운다(사용자가 이미 입력한 제목은 건드리지 않음). 드라이브 등은 수동.
  function onUrlChange(v: string) {
    setUrl(v)
    const id = parseVideoId(v)
    if (!id || id === lastFetchedId.current) return
    lastFetchedId.current = id
    fetchYouTubeMeta(id)
      .then((meta) => {
        if (meta.title) setTitle((prev) => (prev.trim() ? prev : meta.title))
      })
      .catch(() => {})
  }

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setErr('')
    try {
      const now = Date.now()
      const r: Recording = {
        id: newId(),
        title: title.trim(),
        date,
        url: url.trim(),
        videoId: videoId ?? undefined,
        thumbnail: videoId ? thumbnailUrl(videoId) : undefined,
        note: note.trim() || undefined,
        addedBy: member?.uid ?? '',
        addedByName: member?.name,
        createdAt: now,
      }
      await saveRecording(r)
      toast.show('기록을 추가했어요')
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

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>기록 추가</h2>

        <div className="field">
          <label htmlFor="rec-title">제목</label>
          <input id="rec-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="rec-date">일자</label>
          <input id="rec-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="rec-url">링크 (유튜브·구글 드라이브 등)</label>
          <input id="rec-url" type="url" inputMode="url" value={url} onChange={(e) => onUrlChange(e.target.value)} placeholder="https://youtu.be/… 또는 드라이브 링크" />
          <p className="hint">유튜브 링크를 넣으면 제목을 자동으로 채워줘요.</p>
        </div>

        {videoId && (
          <div className="track-preview">
            <img src={thumbnailUrl(videoId)} alt="" />
          </div>
        )}

        <div className="field">
          <label htmlFor="rec-note">메모 (선택)</label>
          <textarea id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 기록 재생/보기 시트 ---------------- */
function RecordingPlayer({ rec, toast, onClose }: { rec: Recording; toast: ToastState; onClose: () => void }) {
  const { user, member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [confirmDel, setConfirmDel] = useState(false)
  const canDelete = !!user && (rec.addedBy === user.uid || !!member?.admin)

  const track: Track = {
    id: rec.id,
    url: rec.url,
    videoId: rec.videoId ?? '',
    title: rec.title,
    artist: '',
    thumbnail: rec.thumbnail,
    addedBy: rec.addedBy,
    addedAt: rec.createdAt,
  }

  async function doDelete() {
    setConfirmDel(false)
    try {
      await deleteRecording(rec.id)
      toast.show('기록을 삭제했어요')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(code === 'permission-denied' ? '삭제 권한이 없어요.' : '삭제에 실패했어요.')
      console.error(e)
    }
  }

  return (
    <>
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}>
            <div className="grab" />
          </div>
          <div className="setlist-head">
            <h2>{rec.title || '(제목 없음)'}</h2>
            <p>{fmtDate(rec.date)}</p>
          </div>

          {rec.videoId ? (
            <SetlistPlayer
              track={track}
              index={0}
              total={1}
              hasPrev={false}
              hasNext={false}
              onPrev={() => {}}
              onNext={() => {}}
              onEnded={() => {}}
              onClose={onClose}
            />
          ) : (
            <div className="rec-extlink">
              <p className="hint">유튜브가 아닌 링크예요. 새 탭에서 열립니다.</p>
              <button type="button" className="btn primary block" onClick={() => window.open(rec.url, '_blank', 'noopener')}>
                링크 열기
              </button>
            </div>
          )}

          {rec.note && <p className="rec-note">{rec.note}</p>}

          <div className="actions">
            {canDelete && <button type="button" className="btn danger" onClick={() => setConfirmDel(true)}>삭제</button>}
            <button type="button" className={'btn subtle' + (canDelete ? '' : ' block')} onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          message={`'${rec.title}' 기록을 삭제할까요?`}
          confirmLabel="삭제"
          cancelLabel="닫기"
          danger
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  )
}
