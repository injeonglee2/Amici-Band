import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { deleteRecording, newId, saveRecording, setRecImportAuto, watchEvents, watchPlaylists, watchRecordings, watchTracks } from '../data'
import { TYPE_META, type BandEvent, type Recording, type Track } from '../types'
import { fetchPlaylistItems, fetchVideoDescription, fetchYouTubeMeta, parsePlaylistId, parseVideoId, PlaylistImportError, thumbnailUrl } from '../youtube'
import { parseDate, todayStr, weekday } from '../time'
import { translateText } from '../translate'
import { parseCredits } from '../gemini'
import ConfirmDialog from './ConfirmDialog'
import MusicPicker from './MusicPicker'
import ThemeSelect from './ThemeSelect'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

function fmtDate(date: string): string {
  const d = parseDate(date)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${weekday(date)})`
}

/** 제목 속 날짜 숫자(YYYYMMDD 또는 YYMMDD)를 YYYY-MM-DD 로. 없거나 이상하면 null */
function dateFromTitle(title: string): string | null {
  const m = title.match(/\d{8}|\d{6}/)
  if (!m) return null
  const s = m[0]
  const y = s.length === 8 ? +s.slice(0, 4) : 2000 + +s.slice(0, 2)
  const mo = +s.slice(s.length - 4, s.length - 2)
  const d = +s.slice(s.length - 2)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')

type MatchTrack = { id: string; title: string; artist: string; playlistId: string; playlistName: string }

/** 제목에 곡명이 들어있으면 그 곡을 찾아 반환(가장 긴 일치 우선). 번역/음차 제목은 못 잡음 */
function musicFromTitle(title: string, tracks: MatchTrack[]): MatchTrack | null {
  const t = normTitle(title.replace(/\d{8}|\d{6}/, ''))
  if (t.length < 2) return null
  let best: MatchTrack | null = null
  let bestLen = 0
  for (const tr of tracks) {
    const tn = normTitle(tr.title)
    if (tn.length >= 2 && t.includes(tn) && tn.length > bestLen) {
      best = tr
      bestLen = tn.length
    }
  }
  return best
}

/** 문자열로 못 찾으면 제목을 en·ko 로 번역해 다시 매칭한다(언어가 달라도 유추). 실패 시 문자열 결과만 */
async function musicFromTitleAsync(title: string, tracks: MatchTrack[]): Promise<MatchTrack | null> {
  const direct = musicFromTitle(title, tracks)
  if (direct) return direct
  const base = title.replace(/\d{8}|\d{6}/, '').trim()
  if (base.length < 2 || tracks.length === 0) return null
  const [en, ko] = await Promise.all([translateText(base, 'en'), translateText(base, 'ko')])
  for (const v of [en, ko]) {
    if (!v) continue
    const m = musicFromTitle(v, tracks)
    if (m) return m
  }
  return null
}

/** 구글 드라이브 파일 링크에서 파일 ID 추출 (…/file/d/{ID}/… 또는 ?id={ID}) */
function parseDriveId(url: string): string | null {
  const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
  return m ? m[1] : null
}
const driveThumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w640`
const ytEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`

/** 기록의 썸네일 URL (유튜브·드라이브 자동, 저장된 값 우선). 없으면 null */
export function recThumb(r: Recording): string | null {
  if (r.thumbnail) return r.thumbnail
  if (r.videoId) return thumbnailUrl(r.videoId)
  const dId = parseDriveId(r.url)
  return dId ? driveThumb(dId) : null
}

/** 기록 탭 — 합주 녹음/영상 갤러리 (링크 기반). 전체 멤버 공개(보기·추가 가능, 삭제·수정은 올린 사람/관리자) */
export default function RecordingsView({ toast }: { toast: ToastState }) {
  const [items, setItems] = useState<Recording[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingRec, setEditingRec] = useState<Recording | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // 필터: 음악(곡) 또는 멤버(파트 참여). 둘은 상호배타. 합주별 묶기는 폴더가 대체. · 정렬: 최신순 / 오래된순
  const [musicFilter, setMusicFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<'new' | 'old'>('new')
  // 필터가 없을 때는 일자별 폴더로 묶어 보여준다. openFolder = 펼친 폴더 키(일자 YYYY-MM-DD)
  const [openFolder, setOpenFolder] = useState<string | null>(null)

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

  // 필터 옵션은 실제 기록에 연결된 합주·음악만 모아서 만든다
  // 음악 연결된 곡의 이름·가수를 원본 곡(음악 탭)에서 실시간으로 끌어온다 → 필터가 항상 현재 이름과 동기화
  const [trackInfo, setTrackInfo] = useState<Map<string, { title: string; artist: string }>>(new Map())
  const linkedPlaylistIds = useMemo(
    () => [...new Set(items.filter((r) => r.playlistId && r.trackId).map((r) => r.playlistId!))].sort().join(','),
    [items],
  )
  useEffect(() => {
    if (!linkedPlaylistIds) {
      setTrackInfo(new Map())
      return
    }
    const byList = new Map<string, Track[]>()
    const unsubs = linkedPlaylistIds.split(',').map((pid) =>
      watchTracks(pid, (list) => {
        byList.set(pid, list)
        const m = new Map<string, { title: string; artist: string }>()
        byList.forEach((ts) => ts.forEach((t) => m.set(t.id, { title: t.title, artist: t.artist || '' })))
        setTrackInfo(m)
      }),
    )
    return () => unsubs.forEach((u) => u())
  }, [linkedPlaylistIds])

  const musicOpts = useMemo(() => {
    const m = new Map<string, { label: string; sub: string }>()
    items.forEach((r) => {
      if (r.playlistId) {
        const key = r.trackId || r.playlistId
        if (!m.has(key)) {
          // 음악 탭의 현재 이름·가수를 우선(항상 동기화), 없으면(삭제됐으면) 기록의 스냅샷으로 폴백
          const live = r.trackId ? trackInfo.get(r.trackId) : undefined
          const label = live?.title || r.trackTitle || r.playlistName || '(음악)'
          const artist = live?.artist || r.trackArtist || ''
          m.set(key, { label, sub: artist })
        }
      }
    })
    return [...m].map(([key, v]) => ({ key, label: v.label, sub: v.sub }))
  }, [items, trackInfo])

  // 멤버 필터 옵션 — 기록 credits(파트별 멤버)에 등장하는 사람 + 어느 파트로 참여했는지 요약
  const memberOpts = useMemo(() => {
    const parts = new Map<string, Set<string>>() // 멤버 → 참여 파트들
    items.forEach((r) => {
      if (!r.credits) return
      for (const [part, names] of Object.entries(r.credits)) {
        for (const name of names) {
          if (!parts.has(name)) parts.set(name, new Set())
          parts.get(name)!.add(part)
        }
      }
    })
    return [...parts.entries()]
      .map(([name, ps]) => ({ key: name, label: name, sub: [...ps].join('·') }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [items])

  const activeMusic = musicFilter ? musicOpts.find((o) => o.key === musicFilter) ?? null : null
  const activeMember = memberFilter ? memberOpts.find((o) => o.key === memberFilter) ?? null : null

  const filtering = !!(musicFilter || memberFilter)

  const byDateSort = (a: Recording, b: Recording) => {
    const d = a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)
    return sort === 'new' ? -d : d
  }

  // 멤버가 어느 파트로든 credits 에 있으면 매칭
  const inCredits = (r: Recording, name: string) =>
    !!r.credits && Object.values(r.credits).some((names) => names.includes(name))

  // 필터 모드: 전체 기록 대상으로 결과를 flat 하게 보여준다(폴더로 묶지 않음)
  const shown = useMemo(() => {
    const list = musicFilter
      ? items.filter((r) => (r.trackId || r.playlistId) === musicFilter)
      : memberFilter
        ? items.filter((r) => inCredits(r, memberFilter))
        : items
    return [...list].sort(byDateSort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, musicFilter, memberFilter, sort])

  // 필터가 없을 때: 일자별 폴더로 묶는다(폴더 이름 = 일자).
  const folders = useMemo(() => {
    const m = new Map<string, Recording[]>()
    items.forEach((r) => {
      const arr = m.get(r.date) || []
      arr.push(r)
      m.set(r.date, arr)
    })
    const arr = [...m.entries()].map(([date, recs]) => ({ key: date, title: fmtDate(date), date, recs: [...recs].sort(byDateSort) }))
    arr.sort((a, b) => {
      const d = a.date.localeCompare(b.date)
      return sort === 'new' ? -d : d
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort])

  const currentFolder = openFolder ? folders.find((f) => f.key === openFolder) ?? null : null

  const recCard = (r: Recording) => (
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
      </div>
    </button>
  )

  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}

        {items.length === 0 && !loadErr ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>
            <p>기록이 없어요.<br />아래 <b>+ 기록 추가</b>로 유튜브·드라이브 링크나 재생목록을 올려보세요.</p>
          </div>
        ) : (
          <>
            {!currentFolder && (
            <div className="rec-toolbar">
              <div className="rec-filters">
                {(musicOpts.length > 0 || memberOpts.length > 0) && (
                  <button
                    type="button"
                    className={'rec-filter-btn' + (musicFilter || memberFilter ? ' on' : '')}
                    onClick={() => setFilterOpen(true)}
                    aria-label="필터"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
                  </button>
                )}
                {activeMusic && (
                  <span className="rec-filter-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    <span className="rec-filter-badge-label">{activeMusic.label}</span>
                    <button type="button" onClick={() => setMusicFilter('')} aria-label="음악 필터 해제">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                )}
                {activeMember && (
                  <span className="rec-filter-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <span className="rec-filter-badge-label">{activeMember.label}</span>
                    <button type="button" onClick={() => setMemberFilter('')} aria-label="멤버 필터 해제">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                )}
              </div>
              <div className="rec-toolbar-right">
                <button
                  type="button"
                  className="rec-sort"
                  onClick={() => setSort((s) => (s === 'new' ? 'old' : 'new'))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11M3 12h8M3 18h5" /><path d="m17 6 4 4M17 6l-4 4M17 6v12" /></svg>
                  {sort === 'new' ? '최신순' : '오래된순'}
                </button>
              </div>
            </div>
            )}

            {filtering ? (
              // 필터 모드 — 전체 기록 대상 결과(폴더로 묶지 않고 그대로)
              shown.length === 0 ? (
                <p className="setlist-empty">이 조건의 기록이 없어요.</p>
              ) : (
                <div className="rec-grid">{shown.map(recCard)}</div>
              )
            ) : currentFolder ? (
              // 폴더 열림 — 재생목록과 같은 형식(구분선 있는 헤더) + 그 날의 기록들
              <>
                <div className="detail-bar rec-folder-bar">
                  <button type="button" className="detail-back" onClick={() => setOpenFolder(null)} aria-label="폴더 목록으로">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                  <b>{currentFolder.title}</b>
                </div>
                <div className="rec-grid">{currentFolder.recs.map(recCard)}</div>
              </>
            ) : (
              // 폴더 목록 — 일정별
              <div className="rec-grid">
                {folders.map((f) => (
                  <button key={f.key} type="button" className="rec-card rec-folder" onClick={() => setOpenFolder(f.key)}>
                    <div className="rec-thumb">
                      {recThumb(f.recs[0]) ? (
                        <img src={recThumb(f.recs[0]) ?? ''} alt="" loading="lazy" />
                      ) : (
                        <span className="rec-thumb-none" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                      )}
                      <span className="rec-folder-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                        {f.recs.length}
                      </span>
                    </div>
                    <div className="rec-meta">
                      <h3>{f.title}</h3>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        기록 추가
      </button>

      {adding && (
        <RecordingForm
          editing={null}
          existingVideoIds={new Set(items.filter((r) => r.videoId).map((r) => r.videoId as string))}
          toast={toast}
          onClose={() => setAdding(false)}
        />
      )}
      {editingRec && (
        <RecordingForm
          editing={editingRec}
          existingVideoIds={new Set(items.filter((r) => r.videoId).map((r) => r.videoId as string))}
          toast={toast}
          onClose={() => setEditingRec(null)}
        />
      )}
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
      {filterOpen && (
        <RecFilterSheet
          musicOpts={musicOpts}
          memberOpts={memberOpts}
          musicFilter={musicFilter}
          memberFilter={memberFilter}
          onPickMusic={(key) => {
            setMusicFilter(key)
            setMemberFilter('')
            setOpenFolder(null)
            setFilterOpen(false)
          }}
          onPickMember={(key) => {
            setMemberFilter(key)
            setMusicFilter('')
            setOpenFolder(null)
            setFilterOpen(false)
          }}
          onClear={() => {
            setMusicFilter('')
            setMemberFilter('')
            setFilterOpen(false)
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </>
  )
}

/* ---------------- 기록 필터 시트 (음악·멤버로 거르기) ---------------- */
function RecFilterSheet({
  musicOpts,
  memberOpts,
  musicFilter,
  memberFilter,
  onPickMusic,
  onPickMember,
  onClear,
  onClose,
}: {
  musicOpts: { key: string; label: string; sub: string }[]
  memberOpts: { key: string; label: string; sub: string }[]
  musicFilter: string
  memberFilter: string
  onPickMusic: (key: string) => void
  onPickMember: (key: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const hasActive = !!(musicFilter || memberFilter)

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>거르기</h2>
        {musicOpts.length > 0 && (
          <>
            <p className="tsel-group">음악</p>
            <ul className="tsel-list">
              {musicOpts.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    className={'tsel-opt' + (musicFilter === o.key ? ' on' : '')}
                    onClick={() => onPickMusic(o.key)}
                  >
                    <span className="tsel-opt-label">{o.label}</span>
                    {o.sub && <span className="tsel-opt-sub">{o.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {memberOpts.length > 0 && (
          <>
            <p className="tsel-group">멤버</p>
            <ul className="tsel-list">
              {memberOpts.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    className={'tsel-opt' + (memberFilter === o.key ? ' on' : '')}
                    onClick={() => onPickMember(o.key)}
                  >
                    <span className="tsel-opt-label">{o.label}</span>
                    {o.sub && <span className="tsel-opt-sub">{o.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className={'actions' + (hasActive ? ' rec-filter-actions' : '')}>
          {hasActive ? (
            <>
              <button type="button" className="btn danger" onClick={onClear}>필터 해제</button>
              <button type="button" className="btn subtle grow" onClick={onClose}>닫기</button>
            </>
          ) : (
            <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- 기록 추가/수정 시트 ---------------- */
function RecordingForm({ editing, existingVideoIds, toast, onClose }: { editing: Recording | null; existingVideoIds: Set<string>; toast: ToastState; onClose: () => void }) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [date, setDate] = useState(editing?.date ?? todayStr())
  const [url, setUrl] = useState(editing?.url ?? '')
  // 메모 입력창은 제거했지만, 수정 시 기존 메모는 보존해서 그대로 저장한다
  const [note] = useState(editing?.note ?? '')
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

  // 사용자가 일정을 직접 고르면(‘연결 안 함’ 포함) 자동 선택이 덮어쓰지 않게 잠근다
  const eventAuto = useRef(!editing?.eventId)

  // 날짜가 바뀌면: 연결된 일정이 새 날짜와 안 맞으면 해제(삭제돼 목록에 없으면 스냅샷 유지).
  // 연결이 비어 있고 그 날짜에 일정이 하나뿐이면 자동으로 연결한다.
  useEffect(() => {
    if (eventId) {
      const ev = events.find((e) => e.id === eventId)
      if (ev && ev.date !== date) {
        setEventId('')
        eventAuto.current = true // 새 날짜에서는 다시 자동 선택 허용
      }
      return
    }
    if (eventAuto.current && eventsOnDate.length === 1) setEventId(eventsOnDate[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, eventId, events])

  // 일정을 연결하면 제목이 비어 있을 때만 일정 제목을 미리 채운다(일자는 사용자가 정한 값 유지).
  function onPickEvent(id: string) {
    setEventId(id)
    eventAuto.current = false // 직접 골랐으니 이후 자동 선택 잠금
    const ev = events.find((e) => e.id === id)
    if (ev) setTitle((prev) => (prev.trim() ? prev : ev.title))
  }

  // 음악 연결(선택) — 악보 탭과 같은 곡 고르기(MusicPicker)로 재생목록/곡을 고른다
  const [playlistId, setPlaylistId] = useState(editing?.playlistId ?? '')
  const [playlistName, setPlaylistName] = useState(editing?.playlistName ?? '')
  const [trackId, setTrackId] = useState(editing?.trackId ?? '')
  const [trackTitle, setTrackTitle] = useState(editing?.trackTitle ?? '')
  const [trackArtist, setTrackArtist] = useState(editing?.trackArtist ?? '')
  const [musicPickerOpen, setMusicPickerOpen] = useState(false)
  function clearMusic() {
    setPlaylistId('')
    setPlaylistName('')
    setTrackId('')
    setTrackTitle('')
    setTrackArtist('')
    musicAuto.current = false // 직접 해제했으면 제목 유추로 다시 채우지 않음
  }

  // 제목→일자·음악 유추용: 모든 재생목록의 곡 목록 로드 (ImportPlaylistSheet 와 동일)
  const [matchTracks, setMatchTracks] = useState<MatchTrack[]>([])
  useEffect(() => {
    const trackUnsubs: (() => void)[] = []
    const byPl = new Map<string, MatchTrack[]>()
    const plUnsub = watchPlaylists((pls) => {
      trackUnsubs.splice(0).forEach((u) => u())
      byPl.clear()
      pls.forEach((p) =>
        trackUnsubs.push(
          watchTracks(p.id, (list) => {
            byPl.set(p.id, list.map((t) => ({ id: t.id, title: t.title, artist: t.artist, playlistId: p.id, playlistName: p.name })))
            setMatchTracks([...byPl.values()].flat())
          }),
        ),
      )
    })
    return () => {
      plUnsub()
      trackUnsubs.forEach((u) => u())
    }
  }, [])

  // 사용자가 일자를 직접 고르면 제목 유추가 덮어쓰지 않게 잠근다
  const dateTouched = useRef(false)
  // 음악은 비었거나 유추로 채운 상태에서만 제목 유추로 바꾼다(직접 고르거나 해제하면 잠금)
  const musicAuto = useRef(!editing?.trackId)

  function setMusicFromMatch(m: MatchTrack) {
    setPlaylistId(m.playlistId)
    setPlaylistName(m.playlistName)
    setTrackId(m.id)
    setTrackTitle(m.title)
    setTrackArtist(m.artist || '')
  }

  // 주어진 제목으로 일자·음악을 유추해 채운다(직접 정한 값은 유지, 음악은 비었을 때만).
  // 제목을 타이핑할 때마다가 아니라, 폼이 열릴 때·유튜브에서 제목이 채워질 때 한 번씩 호출한다.
  function inferFrom(t: string, tracks: MatchTrack[]) {
    if (!dateTouched.current) {
      const d = dateFromTitle(t)
      if (d) setDate(d)
    }
    if (!musicAuto.current || playlistId) return
    const direct = musicFromTitle(t, tracks)
    if (direct) {
      setMusicFromMatch(direct)
      return
    }
    // 문자열로 못 잡으면 번역해서 유추(언어가 달라도)
    void musicFromTitleAsync(t, tracks).then((m) => {
      if (m && musicAuto.current && !playlistId) setMusicFromMatch(m)
    })
  }

  // 폼이 열리는 즉시 제목으로 일자를 유추한다(수정 버튼을 누르자마자 반영). 곡 목록은 필요 없음.
  const didInferOnOpen = useRef(false)
  useEffect(() => {
    if (didInferOnOpen.current) return
    didInferOnOpen.current = true
    if (!dateTouched.current) {
      const d = dateFromTitle(title)
      if (d) setDate(d)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 곡 목록이 준비되면 한 번, 제목으로 음악을 유추한다(문자열→번역, 비어 있고 자동 허용일 때만)
  const didInferMusic = useRef(false)
  useEffect(() => {
    if (didInferMusic.current || matchTracks.length === 0) return
    didInferMusic.current = true
    if (!musicAuto.current || playlistId) return
    const direct = musicFromTitle(title, matchTracks)
    if (direct) {
      setMusicFromMatch(direct)
      return
    }
    void musicFromTitleAsync(title, matchTracks).then((m) => {
      if (m && musicAuto.current && !playlistId) setMusicFromMatch(m)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTracks])

  const videoId = parseVideoId(url)
  const driveId = videoId ? null : parseDriveId(url)
  const previewThumb = videoId ? thumbnailUrl(videoId) : driveId ? driveThumb(driveId) : null
  // 링크가 '재생목록' URL(단일 영상 v= 없이 list=만)이면 추가 폼이 '가져오기'로 전환된다(새 컨트롤 없이)
  const importPid = !editing && !videoId ? parsePlaylistId(url) : null
  const [importProgress, setImportProgress] = useState('')
  const valid = importPid ? true : title.trim().length > 0 && !!date && url.trim().length > 0

  // 링크가 유튜브면 제목을 자동으로 채운다(사용자가 이미 입력한 제목은 건드리지 않음). 드라이브 등은 수동.
  function onUrlChange(v: string) {
    setUrl(v)
    const id = parseVideoId(v)
    if (!id || id === lastFetchedId.current) return
    lastFetchedId.current = id
    const hadTitle = title.trim().length > 0
    fetchYouTubeMeta(id)
      .then((meta) => {
        if (!meta.title) return
        setTitle((prev) => (prev.trim() ? prev : meta.title))
        // 제목이 비어 있어 유튜브 제목으로 채운 경우엔 그 제목으로 일자·음악도 유추
        if (!hadTitle) inferFrom(meta.title, matchTracks)
      })
      .catch(() => {})
  }

  // 재생목록 링크면 일괄 가져오기(제목→일자·음악 유추, 이미 있는 영상 건너뜀) + 주간 자동 동기화 등록
  async function runImport(pid: string) {
    setBusy(true)
    setErr('')
    setImportProgress('')
    try {
      await setRecImportAuto(pid, true).catch(() => {}) // 가져온 재생목록은 매주 자동 동기화에도 등록
      setImportProgress('재생목록 불러오는 중…')
      const songs = await fetchPlaylistItems(pid)
      const fresh = songs.filter((s) => !existingVideoIds.has(s.videoId))
      if (fresh.length === 0) {
        toast.show('이미 모두 가져온 재생목록이에요')
        onClose()
        return
      }
      let added = 0
      for (const s of fresh) {
        setImportProgress(`추가 중 ${added + 1}/${fresh.length}`)
        const m = await musicFromTitleAsync(s.title, matchTracks)
        const recDate = dateFromTitle(s.title) || s.publishedAt || todayStr()
        const onDate = events.filter((e) => e.date === recDate)
        const ev = onDate.length === 1 ? onDate[0] : null // 그 날짜에 일정이 하나면 자동 연결
        const credits = await parseCredits(s.description) // 설명글에서 파트별 멤버 해석
        await saveRecording({
          id: newId(),
          title: s.title || '(제목 없음)',
          date: recDate,
          url: s.url,
          videoId: s.videoId,
          thumbnail: s.thumbnail,
          ...(ev ? { eventId: ev.id, eventTitle: ev.title } : {}),
          ...(m
            ? { playlistId: m.playlistId, playlistName: m.playlistName, trackId: m.id, trackTitle: m.title, trackArtist: m.artist || undefined }
            : {}),
          ...(credits ? { credits } : {}),
          addedBy: member?.uid ?? '',
          addedByName: member?.name,
          createdAt: Date.now(),
        })
        added++
      }
      toast.show(`${added}개 가져왔어요`)
      onClose()
    } catch (e) {
      const code = e instanceof PlaylistImportError ? e.code : ''
      setErr(
        code === 'NO_KEY'
          ? '유튜브 API 키가 설정돼 있지 않아요.'
          : code === 'NOT_FOUND'
            ? '재생목록을 찾을 수 없어요. 공개/일부공개인지 확인해 주세요.'
            : code === 'QUOTA'
              ? '오늘 유튜브 조회 한도를 초과했어요. 내일 다시 시도해 주세요.'
              : '가져오기에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
      setImportProgress('')
    }
  }

  async function submit() {
    if (!valid || busy) return
    if (importPid) {
      await runImport(importPid)
      return
    }
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
        playlistId: playlistId || undefined,
        playlistName: playlistId ? playlistName || undefined : undefined,
        trackId: playlistId && trackId ? trackId : undefined,
        trackTitle: playlistId && trackId ? trackTitle || undefined : undefined,
        trackArtist: playlistId && trackId ? trackArtist || undefined : undefined,
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
    <>
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        <h2>{editing ? '기록 수정' : importPid ? '재생목록 가져오기' : '기록 추가'}</h2>

        {!importPid && (
          <div className="field">
            <label htmlFor="rec-title">제목</label>
            <input id="rec-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
          </div>
        )}

        <div className="field">
          <label htmlFor="rec-url">링크 (유튜브·드라이브·재생목록)</label>
          <input id="rec-url" type="url" inputMode="url" value={url} onChange={(e) => onUrlChange(e.target.value)} placeholder="https://youtu.be/… · 드라이브 · 재생목록(list=…)" />
        </div>

        {previewThumb && (
          <div className="track-preview">
            <img src={previewThumb} alt="" />
          </div>
        )}

        {!importPid &&
          (eventsOnDate.length > 0 ? (
            <div className="field-row">
              <div className="field rec-date-field">
                <label htmlFor="rec-date">일자</label>
                <input id="rec-date" type="date" value={date} onChange={(e) => { dateTouched.current = true; setDate(e.target.value) }} required />
              </div>
              <div className="field rec-event-field">
                <label>일정 연결 (선택)</label>
                <ThemeSelect
                  title="일정 연결"
                  value={eventId}
                  onChange={onPickEvent}
                  options={[
                    { value: '', label: '연결 안 함' },
                    ...eventsOnDate.map((ev) => ({
                      value: ev.id,
                      label: `[${TYPE_META[ev.type].label}] ${ev.title}`,
                    })),
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="rec-date">일자</label>
              <input id="rec-date" type="date" value={date} onChange={(e) => { dateTouched.current = true; setDate(e.target.value) }} required />
            </div>
          ))}

        {!importPid && (
          <div className="field">
            <label>음악 연결 (선택)</label>
            {playlistId ? (
              (() => {
                // 현재 등록된 곡 정보(음악 탭) 우선 표시, 없으면 저장된 값 폴백
                const liveT = trackId ? matchTracks.find((t) => t.id === trackId) : undefined
                const showTitle = liveT?.title || trackTitle || playlistName
                const showArtist = liveT?.artist || trackArtist
                return (
                  <div className="rec-music-sel">
                    <span className="rec-music-label">
                      🎵 {showTitle}
                      {showArtist && <span className="rec-music-artist">{showArtist}</span>}
                    </span>
                    <button type="button" className="btn subtle" onClick={() => setMusicPickerOpen(true)}>변경</button>
                    <button type="button" className="btn subtle" onClick={clearMusic}>해제</button>
                  </div>
                )
              })()
            ) : (
              <button type="button" className="btn subtle block" onClick={() => setMusicPickerOpen(true)}>
                재생목록에서 곡 고르기
              </button>
            )}
          </div>
        )}

        {err && <p className="err small">{err}</p>}

        <div className="actions">
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={submit} disabled={!valid || busy}>
            {busy ? (importPid ? importProgress || '가져오는 중…' : '저장 중…') : importPid ? '가져오기' : '저장'}
          </button>
        </div>
      </div>
    </div>
    {musicPickerOpen && (
      <MusicPicker
        onClose={() => setMusicPickerOpen(false)}
        onPick={(sel) => {
          setPlaylistId(sel.playlistId)
          setPlaylistName(sel.playlistName)
          setTrackId(sel.trackId ?? '')
          setTrackTitle(sel.trackTitle ?? '')
          setTrackArtist(sel.trackArtist ?? '')
          musicAuto.current = false // 직접 골랐으면 제목 유추로 덮어쓰지 않음
          setMusicPickerOpen(false)
        }}
      />
    )}
    </>
  )
}

/* ---------------- 기록 재생/보기 시트 ---------------- */
export function RecordingPlayer({ rec, toast, onEdit, onClose, readOnly }: { rec: Recording; toast: ToastState; onEdit?: () => void; onClose: () => void; readOnly?: boolean }) {
  const { user, member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [confirmDel, setConfirmDel] = useState(false)
  // readOnly 이면(예: 지난 일정의 합주곡 시트에서 열람) 삭제·수정 없이 보기만 가능
  const canManage = !readOnly && !!user && (rec.addedBy === user.uid || !!member?.admin)
  const driveId = rec.videoId ? null : parseDriveId(rec.url)

  // 표시용 참조 데이터는 항상 현재 등록된 값 기준(스냅샷은 삭제됐을 때만 폴백)
  const [liveEventTitle, setLiveEventTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!rec.eventId) return
    return watchEvents((evs) => {
      const e = evs.find((x) => x.id === rec.eventId)
      setLiveEventTitle(e ? e.title : null)
    }, () => {})
  }, [rec.eventId])
  const [liveTrackTitle, setLiveTrackTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!rec.playlistId || !rec.trackId) return
    return watchTracks(rec.playlistId, (list) => {
      const t = list.find((x) => x.id === rec.trackId)
      setLiveTrackTitle(t ? t.title : null)
    })
  }, [rec.playlistId, rec.trackId])
  const shownEvent = liveEventTitle ?? rec.eventTitle
  const shownTrack = liveTrackTitle ?? rec.trackTitle ?? rec.playlistName

  // credits 가 아직 없는 기존 기록은 열 때 설명글을 해석해 한 번 채운다(권한 있는 사람이 열면 저장됨)
  useEffect(() => {
    if (!rec.videoId || rec.credits) return
    let cancelled = false
    void fetchVideoDescription(rec.videoId)
      .then((desc) => parseCredits(desc))
      .then((credits) => {
        if (cancelled || !credits) return
        void saveRecording({ ...rec, credits }).catch(() => {}) // 권한 없으면 조용히 무시
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.id])

  const creditEntries = rec.credits ? Object.entries(rec.credits) : []

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
          <div className="setlist-head rec-view-head">
            {canManage && (
              <div className="rec-head-actions">
                {onEdit && (
                  <button type="button" onClick={onEdit} aria-label="수정">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                )}
                <button type="button" className="del" onClick={() => setConfirmDel(true)} aria-label="삭제">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                </button>
              </div>
            )}
            <h2>{rec.title || '(제목 없음)'}</h2>
            <p>{fmtDate(rec.date)}</p>
            {(shownEvent || shownTrack) && (
              <div className="rec-links">
                {shownEvent && (
                  <span className="rec-event">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                    {shownEvent}
                  </span>
                )}
                {shownTrack && (
                  <span className="rec-event">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    {shownTrack}
                  </span>
                )}
              </div>
            )}
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
            <button
              type="button"
              className="rec-poster"
              onClick={() => window.open(rec.url, '_blank', 'noopener')}
              aria-label="드라이브에서 영상 열기"
            >
              <img
                src={driveThumb(driveId)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
              <span className="rec-play" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <span className="rec-openhint">드라이브에서 보기 ↗</span>
            </button>
          ) : (
            <div className="rec-extlink">
              <p className="hint">앱에서 바로 재생할 수 없는 링크예요. 새 탭에서 열립니다.</p>
              <button type="button" className="btn primary block" onClick={() => window.open(rec.url, '_blank', 'noopener')}>
                링크 열기
              </button>
            </div>
          )}

          {rec.note && <p className="rec-note">{rec.note}</p>}

          {creditEntries.length > 0 && (
            <ul className="rec-credits">
              {creditEntries.map(([part, names]) => (
                <li key={part}>
                  <span className="rec-credit-part">{part}</span>
                  <span className="rec-credit-names">{names.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="actions">
            <button type="button" className="btn subtle block" onClick={onClose}>닫기</button>
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
