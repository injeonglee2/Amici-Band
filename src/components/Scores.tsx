import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth'
import {
  deleteScore,
  newId,
  saveScore,
  uploadScoreFile,
  watchPlaylists,
  watchScores,
  watchTracks,
} from '../data'
import {
  isFixedPart,
  PART_META,
  PART_ORDER,
  type Part,
  type Playlist,
  type Score,
  type ScoreFile,
  type Track,
  type TrackPart,
} from '../types'
import { thumbnailUrl } from '../youtube'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import ConfirmDialog from './ConfirmDialog'
import ThemeSelect from './ThemeSelect'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

/** 악보 파일을 지정된 이름으로 내려받기 (CORS 설정돼 blob 로 받아 파일명 제어) */
async function downloadFile(f: ScoreFile) {
  try {
    const res = await fetch(f.url)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = f.name || 'score'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
  } catch (e) {
    console.error('download', e)
    window.open(f.url, '_blank', 'noopener')
  }
}

const partLabel = (p: TrackPart) => (isFixedPart(p) ? PART_META[p].label : p)
// 다운로드 파일명용 — 파일명에 못 쓰는 문자만 정리(한글은 그대로 둔다)
const cleanName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
const extOf = (name: string) => name.match(/\.([a-zA-Z0-9]+)$/)?.[1].toLowerCase() ?? ''
// 악보 제목 기본값 — 파트별 매칭
const PART_TITLE: Record<string, string> = { drum: 'Drum', bass: 'Base', guitar: 'Guitar', keyboard: 'Piano', vocal: 'Vocal' }
const defaultTitleFor = (p: string) => PART_TITLE[p] ?? ''

export type Song = { trackId: string; title: string; artist?: string; thumbnail?: string; scores: Score[] }

/**
 * 악보 탭 — 재생목록의 곡에 파트별 악보(PDF/이미지)를 붙여 본다.
 * 곡 중심(곡을 열면 파트별로 악보), 상단 '내 파트만' 필터. 파일은 Firebase Storage.
 */
export default function ScoresView({ toast }: { toast: ToastState }) {
  const { member } = useAuth()
  const myPart = member?.part
  const [scores, setScores] = useState<Score[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [openTrackId, setOpenTrackId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(
    () =>
      watchScores(setScores, (e) => {
        const code = (e as { code?: string })?.code ?? ''
        setLoadErr(
          code === 'permission-denied'
            ? '악보를 불러올 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.'
            : '악보를 불러오지 못했어요.' + (code ? ` (${code})` : ''),
        )
      }),
    [],
  )

  // 곡(trackId)별로 묶기. scores 는 최신순이라 first-seen = 최신 곡 순서 유지.
  const songs = useMemo(() => {
    const m = new Map<string, Song>()
    for (const s of scores) {
      let g = m.get(s.trackId)
      if (!g) {
        g = { trackId: s.trackId, title: s.songTitle, artist: s.songArtist, thumbnail: s.thumbnail, scores: [] }
        m.set(s.trackId, g)
      }
      g.scores.push(s)
    }
    let list = [...m.values()]
    if (mineOnly && myPart) list = list.filter((g) => g.scores.some((s) => s.part === myPart))
    return list
  }, [scores, mineOnly, myPart])

  const myCount = useMemo(
    () => (myPart ? new Set(scores.filter((s) => s.part === myPart).map((s) => s.trackId)).size : 0),
    [scores, myPart],
  )

  // 열린 곡: 필터와 무관하게 전체 scores 에서 다시 구성(필터로 사라져도 유지)
  const openSong: Song | null = useMemo(() => {
    if (!openTrackId) return null
    const ss = scores.filter((s) => s.trackId === openTrackId)
    if (!ss.length) return null
    return { trackId: openTrackId, title: ss[0].songTitle, artist: ss[0].songArtist, thumbnail: ss[0].thumbnail, scores: ss }
  }, [openTrackId, scores])

  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {myPart && myCount > 0 && (
          <div className="track-filter">
            <button
              type="button"
              className={'chip mine-filter' + (mineOnly ? ' on' : '')}
              aria-pressed={mineOnly}
              onClick={() => setMineOnly((v) => !v)}
            >
              내 파트만 · {PART_META[myPart].label} <b>{myCount}</b>
            </button>
          </div>
        )}

        {songs.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M10.5 11v6.2" /><circle cx="9" cy="17.4" r="1.7" /></svg>
            <p>
              {mineOnly ? '내 파트 악보가 아직 없어요.' : '아직 등록된 악보가 없어요.'}
              <br />아래 <b>+ 악보 추가</b>로 재생목록의 곡에 악보를 올려보세요.
            </p>
          </div>
        ) : (
          <div className="rec-grid">
            {songs.map((g) => {
              const parts = [...new Set(g.scores.map((s) => s.part))]
              return (
                <button key={g.trackId} type="button" className="rec-card" onClick={() => setOpenTrackId(g.trackId)}>
                  <div className="rec-thumb">
                    {g.thumbnail ? (
                      <img src={g.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <span className="rec-thumb-none" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /></svg>
                      </span>
                    )}
                  </div>
                  <div className="rec-meta">
                    <h3>{g.title || '(제목 없음)'}</h3>
                    {g.artist && <p>{g.artist}</p>}
                    <div className="score-partchips">
                      {parts.map((p) => (
                        <span key={String(p)} className={'score-partchip' + (p === myPart ? ' me' : '')}>
                          {partLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        악보 추가
      </button>

      {adding && <AddScoreFlow toast={toast} onClose={() => setAdding(false)} />}
      {openSong && <ScoreSongSheet song={openSong} myPart={myPart} toast={toast} onClose={() => setOpenTrackId(null)} />}
    </>
  )
}

/* ---------------- 곡 상세: 파트별 악보 목록 ---------------- */
export function ScoreSongSheet({
  song,
  myPart,
  toast,
  onClose,
}: {
  song: Song
  myPart?: Part
  toast: ToastState
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [viewing, setViewing] = useState<Score | null>(null)
  const [adding, setAdding] = useState(false)
  useBackHandler(() => (viewing ? setViewing(null) : onClose()))

  // 이 곡에 바로 악보 추가 — 곡 고르기를 건너뛰도록 preset 으로 넘긴다
  const presetTrack: Track = {
    id: song.trackId,
    url: '',
    videoId: '',
    title: song.title,
    artist: song.artist ?? '',
    thumbnail: song.thumbnail,
    addedBy: '',
    addedAt: 0,
  }
  const presetPlaylistId = song.scores[0]?.playlistId ?? ''

  // 파트별 묶음: 고정 5파트 순서 먼저, 커스텀 라벨은 뒤에
  const groups = useMemo(() => {
    const map = new Map<string, Score[]>()
    for (const s of song.scores) {
      const k = String(s.part)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    const out: { part: TrackPart; scores: Score[] }[] = []
    for (const p of PART_ORDER) if (map.has(p)) out.push({ part: p, scores: map.get(p)! })
    for (const [k, arr] of map) if (!PART_ORDER.includes(k as Part)) out.push({ part: k, scores: arr })
    return out
  }, [song])

  return (
    <>
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}>
            <div className="grab" />
          </div>
          <div className="setlist-head">
            <h2>{song.title || '(제목 없음)'}</h2>
            {song.artist && <p>{song.artist}</p>}
          </div>

          {groups.map((g) => (
            <div key={String(g.part)} className="score-part-group">
              <div className={'score-part-hd' + (g.part === myPart ? ' me' : '')}>
                {partLabel(g.part)} <b>{g.scores.length}</b>
              </div>
              <div className="score-cards">
                {g.scores.map((s) => (
                  <div key={s.id} className="score-card">
                    <button type="button" className="score-card-main" onClick={() => setViewing(s)}>
                      <span className="score-kind">{s.kind === 'pdf' ? 'PDF' : `IMG ${s.files.length}`}</span>
                      <span className="score-card-title">{s.title || '악보'}</span>
                      {s.addedByName && <span className="score-by">{s.addedByName}</span>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="actions">
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>악보 추가</button>
            <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>

      {adding && (
        <AddScoreFlow
          toast={toast}
          presetTrack={presetTrack}
          presetPlaylistId={presetPlaylistId}
          onClose={() => setAdding(false)}
        />
      )}
      {viewing && <ScoreViewer score={viewing} toast={toast} onClose={() => setViewing(null)} />}
    </>
  )
}

/* 세션 캐시: 같은 PDF를 다시 열 때 재다운로드·재렌더를 건너뛴다(Storage egress·CPU 절감) */
const pdfPageCache = new Map<string, string[]>()

/* PDF를 앱 안에서 페이지별로 렌더 (pdf.js — 버킷 CORS 설정 필요). 실패 시 새 탭 안내 */
function PdfPages({ url }: { url: string }) {
  const cached = pdfPageCache.get(url)
  const [pages, setPages] = useState<string[]>(cached ?? [])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>(cached ? 'done' : 'loading')
  useEffect(() => {
    if (pdfPageCache.has(url)) {
      setPages(pdfPageCache.get(url) as string[])
      setStatus('done')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        const doc = await pdfjs.getDocument({ url }).promise
        const scale = Math.min(2, (window.devicePixelRatio || 1) * 1.5)
        const imgs: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break
          const page = await doc.getPage(i)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const ctx = canvas.getContext('2d')
          if (ctx) {
            await page.render({ canvas, canvasContext: ctx, viewport }).promise
            imgs.push(canvas.toDataURL('image/jpeg', 0.85))
          }
          page.cleanup()
        }
        if (!cancelled) {
          pdfPageCache.set(url, imgs)
          setPages(imgs)
          setStatus('done')
        }
      } catch (e) {
        console.error('pdf render', e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  if (status === 'loading') return <p className="hint score-pdf-loading">PDF 불러오는 중…</p>
  if (status === 'error')
    return (
      <div className="score-pdf-err">
        <p className="err small">앱에서 PDF를 표시하지 못했어요.</p>
        <button type="button" className="btn subtle" onClick={() => window.open(url, '_blank', 'noopener')}>
          새 탭에서 열기 ↗
        </button>
      </div>
    )
  return (
    <div className="score-gallery">
      {pages.map((p, i) => (
        <img key={i} src={p} alt={`${i + 1}페이지`} />
      ))}
    </div>
  )
}

/* ---------------- 악보 뷰어 (이미지 세로 스크롤 / PDF 인앱 렌더) ---------------- */
function ScoreViewer({ score, toast, onClose }: { score: Score; toast: ToastState; onClose: () => void }) {
  const { user, member } = useAuth()
  const canManage = !!user && (score.addedBy === user.uid || !!member?.admin)
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const isPdf = score.kind === 'pdf'
  const [title, setTitle] = useState(score.title || '악보')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)

  async function saveTitle() {
    const t = draft.trim()
    if (!t || t === title) { setEditing(false); return }
    setBusy(true)
    try {
      await saveScore({ ...score, title: t })
      setTitle(t)
      setEditing(false)
      toast.show('제목을 바꿨어요')
    } catch {
      toast.show('수정에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    setConfirmDel(false)
    setBusy(true)
    try {
      await deleteScore(score.id, score.files)
      toast.show('악보를 삭제했어요')
      onClose()
    } catch {
      toast.show('삭제에 실패했어요')
      setBusy(false)
    }
  }

  async function download() {
    for (const f of score.files) {
      await downloadFile(f)
      if (score.files.length > 1) await new Promise((r) => setTimeout(r, 400))
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet score-viewer-sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <div className="setlist-head">
          {editing ? (
            <div className="score-title-edit">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} autoFocus placeholder="악보 제목" />
              <button type="button" className="btn primary sm" onClick={() => void saveTitle()} disabled={busy || !draft.trim()}>저장</button>
              <button type="button" className="btn subtle sm" onClick={() => { setEditing(false); setDraft(title) }}>취소</button>
            </div>
          ) : (
            <h2 className="score-title-row">
              <span className="score-title-text">{title}</span>
              {canManage && (
                <span className="score-title-actions">
                  <button type="button" className="score-title-edit-btn" onClick={() => { setDraft(title); setEditing(true) }} aria-label="제목 수정">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button type="button" className="score-title-edit-btn danger" onClick={() => setConfirmDel(true)} disabled={busy} aria-label="악보 삭제">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                  </button>
                </span>
              )}
            </h2>
          )}
          <p>{score.songTitle} · {partLabel(score.part)}</p>
        </div>

        <div className="score-viewer-scroll">
          {isPdf ? (
            <PdfPages url={score.files[0]?.url ?? ''} />
          ) : (
            <div className="score-gallery">
              {score.files.map((f, i) => (
                <img key={i} src={f.url} alt={`${i + 1}페이지`} loading="lazy" />
              ))}
            </div>
          )}
        </div>

        <div className="actions score-viewer-actions">
          <button type="button" className="btn primary" onClick={() => void download()}>
            다운로드
          </button>
          <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          message={`'${title}'을(를) 삭제할까요?`}
          confirmLabel="삭제"
          cancelLabel="닫기"
          danger
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  )
}

/* ---------------- 악보 추가: 재생목록→곡 고르고 → 파트·제목·파일 업로드 ---------------- */
/** presetTrack/presetPlaylistId 를 주면 곡 고르기를 건너뛰고 바로 그 곡에 악보를 올린다(곡 상세에서 '악보 추가'). */
function AddScoreFlow({
  toast,
  onClose,
  presetTrack,
  presetPlaylistId,
}: {
  toast: ToastState
  onClose: () => void
  presetTrack?: Track
  presetPlaylistId?: string
}) {
  const { user, member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [openPl, setOpenPl] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [track, setTrack] = useState<Track | null>(presetTrack ?? null)
  const presetPl = presetPlaylistId ?? ''

  const initialPart = member?.part ?? 'vocal'
  const [partSel, setPartSel] = useState<string>(initialPart)
  const [customPart, setCustomPart] = useState('')
  const [title, setTitle] = useState(defaultTitleFor(initialPart))
  const autoTitleRef = useRef(defaultTitleFor(initialPart))
  // 파트를 바꾸면 제목이 (비었거나 이전 자동값 그대로면) 그 파트 기본값으로 따라간다
  function onPart(v: string) {
    setPartSel(v)
    const next = v === 'custom' ? '' : defaultTitleFor(v)
    const prevAuto = autoTitleRef.current // ref 를 갱신하기 전에 캡처(업데이터가 나중에 실행되므로)
    setTitle((prev) => (prev.trim() === '' || prev === prevAuto ? next : prev))
    autoTitleRef.current = next
  }
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => watchPlaylists(setPlaylists), [])
  useEffect(() => {
    if (!openPl) {
      setTracks([])
      return
    }
    return watchTracks(openPl.id, setTracks)
  }, [openPl])
  // 뒤로가기: 곡 선택됨→곡 해제, 재생목록 선택됨→해제, 아니면 닫기
  useBackHandler(() => (track ? setTrack(null) : openPl ? setOpenPl(null) : onClose()))

  const pdfs = files.filter((f) => f.type === 'application/pdf')
  const imgs = files.filter((f) => f.type.startsWith('image/'))
  const kindOk = files.length > 0 && ((pdfs.length === 1 && imgs.length === 0) || (pdfs.length === 0 && imgs.length > 0))
  const partOk = partSel !== 'custom' || customPart.trim().length > 0
  const valid = !!track && title.trim().length > 0 && kindOk && partOk

  function onPickFiles(list: FileList | null) {
    if (!list) return
    setFiles(Array.from(list))
  }
  function move(i: number, dir: -1 | 1) {
    setFiles((arr) => {
      const next = arr.slice()
      const j = i + dir
      if (j < 0 || j >= next.length) return arr
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function removeAt(i: number) {
    setFiles((arr) => arr.filter((_, k) => k !== i))
  }

  async function submit() {
    const plId = openPl?.id || presetPl
    if (!valid || !user || !track || !plId || busy) return
    setBusy(true)
    setErr('')
    try {
      const id = newId()
      const isPdf = pdfs.length === 1
      const use = isPdf ? pdfs.slice(0, 1) : imgs
      const base = cleanName(`${track.title} - ${title.trim()}`) || '악보'
      const uploaded: ScoreFile[] = []
      for (let i = 0; i < use.length; i++) {
        setProgress(`업로드 중 ${i + 1}/${use.length}`)
        const ext = extOf(use[i].name) || (isPdf ? 'pdf' : 'png')
        const dl = isPdf ? `${base}.${ext}` : `${base}_${String(i + 1).padStart(2, '0')}.${ext}`
        uploaded.push(await uploadScoreFile(id, use[i], i, dl))
      }
      const part: TrackPart = partSel === 'custom' ? customPart.trim() : (partSel as Part)
      const s: Score = {
        id,
        trackId: track.id,
        playlistId: plId,
        songTitle: track.title,
        songArtist: track.artist || undefined,
        thumbnail: track.thumbnail || (track.videoId ? thumbnailUrl(track.videoId) : undefined),
        part,
        title: title.trim(),
        kind: isPdf ? 'pdf' : 'images',
        files: uploaded,
        addedBy: user.uid,
        addedByName: member?.name,
        createdAt: Date.now(),
      }
      await saveScore(s)
      toast.show('악보를 올렸어요')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied' || code === 'storage/unauthorized'
          ? '업로드 권한이 없어요. 보안 규칙을 확인해 주세요.'
          : '업로드에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  // 1) 곡 고르기 (재생목록 → 곡)
  if (!track) {
    return (
      <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" ref={sheetRef}>
          <div className="grab-zone" {...grabHandlers}>
            <div className="grab" />
          </div>
          <h2>악보 추가 — 곡 고르기</h2>
          {!openPl ? (
            <div className="picker-list">
              {playlists.length === 0 && <p className="setlist-empty">재생목록이 없어요. 음악 탭에서 먼저 만들어 주세요.</p>}
              {playlists.map((p) => (
                <button key={p.id} type="button" className="picker-row" onClick={() => setOpenPl(p)}>
                  <span className="track-info"><h3>{p.name}</h3></span>
                  <svg className="track-open-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="picker-bar">
                <button type="button" className="detail-back" onClick={() => setOpenPl(null)} aria-label="재생목록으로">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <b>{openPl.name}</b>
              </div>
              <div className="picker-list">
                {tracks.length === 0 && <p className="setlist-empty">이 재생목록에 곡이 없어요.</p>}
                {tracks.map((t) => (
                  <button key={t.id} type="button" className="picker-row" onClick={() => { setTrack(t); if (!title) setTitle(defaultTitleFor(partSel)) }}>
                    <span className="track-thumb sm">
                      {t.thumbnail || t.videoId ? <img src={t.thumbnail || thumbnailUrl(t.videoId ?? '')} alt="" loading="lazy" /> : null}
                    </span>
                    <span className="track-info"><h3>{t.title}</h3>{t.artist && <p>{t.artist}</p>}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn subtle block" onClick={onClose}>취소</button>
          </div>
        </div>
      </div>
    )
  }

  // 2) 파트·제목·파일
  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>악보 추가</h2>

        <div className="score-picked">
          <span className="track-thumb sm">
            {track.thumbnail || track.videoId ? <img src={track.thumbnail || thumbnailUrl(track.videoId ?? '')} alt="" /> : null}
          </span>
          <div className="track-info"><h3>{track.title}</h3>{track.artist && <p>{track.artist}</p>}</div>
          <button type="button" className="btn subtle" onClick={() => setTrack(null)}>곡 변경</button>
        </div>

        <div className="field">
          <label htmlFor="sc-part">파트</label>
          <ThemeSelect
            title="파트"
            value={partSel}
            onChange={onPart}
            options={[
              ...PART_ORDER.map((p) => ({ value: p as string, label: PART_META[p].label })),
              { value: 'custom', label: '직접 입력…' },
            ]}
          />
          {partSel === 'custom' && (
            <input type="text" value={customPart} onChange={(e) => setCustomPart(e.target.value)} placeholder="예: 코러스, MC" maxLength={20} style={{ marginTop: 8 }} />
          )}
        </div>

        <div className="field">
          <label htmlFor="sc-title">악보 제목</label>
          <input id="sc-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="예: 풀 스코어 · 1절 · 코드" />
        </div>

        <div className="field">
          <label htmlFor="sc-files">파일 (PDF 1개 또는 이미지 여러 장)</label>
          {/* MIME(image/*)이면 삼성이 카메라 촬영을 우선 띄운다. 확장자 기반 accept 는
              문서 선택기(갤러리/내 파일)로 열리는 경우가 많아 확장자로 지정한다. */}
          <input id="sc-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={(e) => onPickFiles(e.target.files)} />
          {files.length > 0 && (
            <ul className="score-files">
              {files.map((f, i) => (
                <li key={i}>
                  <span className="score-file-name">{f.name}</span>
                  <span className="score-file-btns">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="아래로">↓</button>
                    <button type="button" onClick={() => removeAt(i)} aria-label="빼기">×</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && !kindOk && (
            <p className="err small">PDF 1개, 또는 이미지 여러 장 중 하나로 올려주세요 (섞을 수 없어요).</p>
          )}
          {kindOk && <p className="hint">{pdfs.length ? 'PDF 1개' : `이미지 ${imgs.length}장`}로 등록됩니다. 이미지는 위 순서대로 보여요.</p>}
        </div>

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>
            {busy ? progress || '저장 중…' : '올리기'}
          </button>
        </div>
      </div>
    </div>
  )
}
