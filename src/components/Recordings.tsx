import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { deleteRecording, newId, saveRecording, watchEvents, watchRecordings } from '../data'
import { TYPE_META, type BandEvent, type Recording } from '../types'
import { fetchYouTubeMeta, parseVideoId, thumbnailUrl } from '../youtube'
import { parseDate, todayStr, weekday } from '../time'
import ConfirmDialog from './ConfirmDialog'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

function fmtDate(date: string): string {
  const d = parseDate(date)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${weekday(date)})`
}

/** 구글 드라이브 파일 링크에서 파일 ID 추출 (…/file/d/{ID}/… 또는 ?id={ID}) */
function parseDriveId(url: string): string | null {
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
  return m ? m[1] : null
}
const driveThumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w640`
const drivePreview = (id: string) => `https://drive.google.com/file/d/${id}/preview`
const ytEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`

/** 기록의 썸네일 URL (유튜브·드라이브 자동, 저장된 값 우선). 없으면 null */
function recThumb(r: Recording): string | null {
  if (r.thumbnail) return r.thumbnail
  if (r.videoId) return thumbnailUrl(r.videoId)
  const dId = parseDriveId(r.url)
  return dId ? driveThumb(dId) : null
}

/** 기록 탭 — 합주 녹음/영상 갤러리 (링크 기반). 지금은 관리자에게만 노출(다듬는 중) */
export default function RecordingsView({ toast }: { toast: ToastState }) {
  const [items, setItems] = useState<Recording[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingRec, setEditingRec] = useState<Recording | null>(null)
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
                  {recThumb(r) ? (
                    <img src={recThumb(r) ?? ''} alt="" loading="lazy" />
                  ) : (
                    <span className="rec-thumb-none" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  )}
                </div>
                <div className="rec-meta">
                  <h3>{r.title || '(제목 없음)'}</h3>
                  <p>{fmtDate(r.date)}</p>
                  {r.eventTitle && <p className="rec-event">🗓 {r.eventTitle}</p>}
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

      {adding && <RecordingForm editing={null} toast={toast} onClose={() => setAdding(false)} />}
      {editingRec && <RecordingForm editing={editingRec} toast={toast} onClose={() => setEditingRec(null)} />}
      {open && (
        <RecordingPlayer
          rec={open}
          toast={toast}
          onEdit={() => {
            setEditingRec(open)
            setOpenId(null)
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}

/* ---------------- 기록 추가/수정 시트 ---------------- */
function RecordingForm({ editing, toast, onClose }: { editing: Recording | null; toast: ToastState; onClose: () => void }) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(editing?.date ?? todayStr())
  const [url, setUrl] = useState(editing?.url ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [eventId, setEventId] = useState(editing?.eventId ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lastFetchedId = useRef<string | null>(null)

  // 일자를 먼저 정하고, 그 날짜에 등록된 일정이 있으면 골라서 연결할 수 있게 한다.
  const [events, setEvents] = useState<BandEvent[]>([])
  useEffect(() => watchEvents(setEvents, () => {}), [])
  const eventsOnDate = events
    .filter((e) => e.date === date)
    .sort((a, b) => (a.rehStart ?? '').localeCompare(b.rehStart ?? ''))
  const linkedEvent = eventId ? events.find((e) => e.id === eventId) ?? null : null

  // 날짜를 바꿔 연결한 일정이 더 이상 그 날짜와 맞지 않으면 연결을 해제한다.
  // (일정이 삭제돼 목록에 없을 때는 스냅샷을 지키기 위해 그대로 둔다)
  useEffect(() => {
    if (!eventId) return
    const ev = events.find((e) => e.id === eventId)
    if (ev && ev.date !== date) setEventId('')
  }, [date, eventId, events])

  // 일정을 연결하면 제목이 비어 있을 때만 일정 제목을 미리 채운다(일자는 사용자가 정한 값 유지).
  function onPickEvent(id: string) {
    setEventId(id)
    const ev = events.find((e) => e.id === id)
    if (ev) setTitle((prev) => (prev.trim() ? prev : ev.title))
  }

  const videoId = parseVideoId(url)
  const driveId = videoId ? null : parseDriveId(url)
  const previewThumb = videoId ? thumbnailUrl(videoId) : driveId ? driveThumb(driveId) : null
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
        id: editing?.id ?? newId(),
        title: title.trim(),
        date,
        url: url.trim(),
        videoId: videoId ?? undefined,
        thumbnail: videoId ? thumbnailUrl(videoId) : driveId ? driveThumb(driveId) : undefined,
        note: note.trim() || undefined,
        eventId: eventId || undefined,
        eventTitle: eventId ? linkedEvent?.title ?? editing?.eventTitle : undefined,
        addedBy: editing?.addedBy ?? member?.uid ?? '',
        addedByName: editing?.addedByName ?? member?.name,
        createdAt: editing?.createdAt ?? now,
      }
      await saveRecording(r)
      toast.show(editing ? '기록을 수정했어요' : '기록을 추가했어요')
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
        <h2>{editing ? '기록 수정' : '기록 추가'}</h2>

        <div className="field">
          <label htmlFor="rec-title">제목</label>
          <input id="rec-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="rec-date">일자</label>
          <input id="rec-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {eventsOnDate.length > 0 ? (
          <div className="field">
            <label htmlFor="rec-event">일정 연결 (선택)</label>
            <select id="rec-event" value={eventId} onChange={(e) => onPickEvent(e.target.value)}>
              <option value="">연결 안 함</option>
              {eventsOnDate.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  [{TYPE_META[ev.type].label}] {ev.title}
                  {ev.rehStart ? ` · ${ev.rehStart}` : ''}
                </option>
              ))}
            </select>
            <p className="hint">이 날짜에 등록된 일정이 있어요. 연결하면 기록에 함께 표시돼요.</p>
          </div>
        ) : (
          <p className="hint rec-noevent">이 날짜에 등록된 일정이 없어요 · 일자만 저장돼요.</p>
        )}

        <div className="field">
          <label htmlFor="rec-url">링크 (유튜브·구글 드라이브 등)</label>
          <input id="rec-url" type="url" inputMode="url" value={url} onChange={(e) => onUrlChange(e.target.value)} placeholder="https://youtu.be/… 또는 드라이브 링크" />
          <p className="hint">유튜브는 제목 자동 채움, 유튜브·드라이브 영상은 앱에서 바로 재생돼요.</p>
        </div>

        {previewThumb && (
          <div className="track-preview">
            <img src={previewThumb} alt="" />
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
function RecordingPlayer({ rec, toast, onEdit, onClose }: { rec: Recording; toast: ToastState; onEdit: () => void; onClose: () => void }) {
  const { user, member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [confirmDel, setConfirmDel] = useState(false)
  const canManage = !!user && (rec.addedBy === user.uid || !!member?.admin)
  const driveId = rec.videoId ? null : parseDriveId(rec.url)

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
            {rec.eventTitle && <p className="rec-event">🗓 {rec.eventTitle}</p>}
          </div>

          {rec.videoId ? (
            <div className="rec-embed">
              <iframe
                src={ytEmbed(rec.videoId)}
                title={rec.title || '기록'}
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          ) : driveId ? (
            <div className="rec-embed">
              <iframe
                src={drivePreview(driveId)}
                title={rec.title || '기록'}
                allow="autoplay"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="rec-extlink">
              <p className="hint">앱에서 바로 재생할 수 없는 링크예요. 새 탭에서 열립니다.</p>
              <button type="button" className="btn primary block" onClick={() => window.open(rec.url, '_blank', 'noopener')}>
                링크 열기
              </button>
            </div>
          )}

          {rec.note && <p className="rec-note">{rec.note}</p>}

          <div className={'actions' + (canManage ? ' rec-actions' : '')}>
            {canManage ? (
              <>
                <button type="button" className="btn danger" onClick={() => setConfirmDel(true)}>삭제</button>
                <button type="button" className="btn subtle" onClick={onEdit}>수정</button>
                <button type="button" className="btn subtle rec-close" onClick={onClose}>닫기</button>
              </>
            ) : (
              <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
            )}
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
