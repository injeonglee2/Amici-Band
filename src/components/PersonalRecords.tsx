import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import { createSamsungHealthSyncSession, deletePersonalRecordEntry, deletePersonalRecordFolder, newId, savePersonalRecordEntry, savePersonalRecordFolder, uploadPersonalRecordFile, watchPersonalRecordEntries, watchPersonalRecordFolders, watchRunningEntries, type SamsungHealthSyncRange } from '../data'
import type { PersonalRecordEntry, RecordingFolder, RunningEntry, ScoreFile } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import FolderModule, { FolderForm, type FolderModuleConfig, type FolderRepository } from './FolderModule'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import RunningDashboard from './RunningDashboard'
import { isSamsungHealthSyncEnvironment, launchSamsungHealthSync } from '../samsungHealth'

const RECORD_FOLDER_CONFIG: FolderModuleConfig = {
  labels: { folder: '기록 폴더', empty: '기록 폴더가 없어요.', add: '폴더', createTitle: '새 기록 폴더', editTitle: '기록 폴더 수정', name: '폴더 이름', placeholder: '예) 일상, 공부, 생각 정리', deleteConfirm: (name) => `'${name}' 기록 폴더와 안의 파일을 모두 삭제할까요?` },
  rowIcon: (folder) => (folder.templateId === 'running' ? <RunIcon /> : <RecordIcon />),
}
// 폴더 종류(템플릿) — 소유자의 개인 채널에서 '러닝' 폴더를 만들 수 있게 함
const RECORD_TEMPLATES = [
  { id: 'record', label: '기록', symbol: '📁', description: '이미지·PDF 파일 보관' },
  { id: 'running', label: '러닝', symbol: '🏃', description: '러닝 데이터를 전체 표시' },
]
const recordFolderRepository: FolderRepository<RecordingFolder> = {
  watch: watchPersonalRecordFolders,
  create: (name, creatorUid, templateId) => ({ id: newId(), name, createdBy: creatorUid, createdAt: Date.now(), order: Date.now(), ...(templateId === 'running' ? { templateId: 'running' as const } : {}) }),
  save: savePersonalRecordFolder,
  remove: (folder) => deletePersonalRecordFolder(folder.id),
}

export default function PersonalRecords({ toast }: { toast: ToastState }) {
  const { user, workspace } = useAuth()
  const isOwner = !!user && workspace?.ownerUid === user.uid
  // 소유자만 '러닝' 폴더 템플릿 선택 가능
  const config: FolderModuleConfig = isOwner ? { ...RECORD_FOLDER_CONFIG, templates: RECORD_TEMPLATES } : RECORD_FOLDER_CONFIG
  return <FolderModule config={config} repository={recordFolderRepository} renderDetail={(folder, onBack) => <RecordFolderDetail folder={folder} onBack={onBack} toast={toast} config={config} />} />
}

function RecordFolderDetail({ folder, onBack, toast, config }: { folder: RecordingFolder; onBack: () => void; toast: ToastState; config: FolderModuleConfig }) {
  if (folder.templateId === 'running') return <RunningFolderDetail folder={folder} onBack={onBack} config={config} toast={toast} />
  return <RecordFilesDetail folder={folder} onBack={onBack} toast={toast} config={config} />
}

function RecordFilesDetail({ folder, onBack, toast, config }: { folder: RecordingFolder; onBack: () => void; toast: ToastState; config: FolderModuleConfig }) {
  const [entries, setEntries] = useState<PersonalRecordEntry[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<PersonalRecordEntry | null>(null)
  useBackHandler(onBack)
  useEffect(() => watchPersonalRecordEntries(folder.id, setEntries, () => setLoadErr('기록을 불러오지 못했어요.')), [folder.id])
  async function remove(entry: PersonalRecordEntry) {
    if (!confirm(`'${entry.title}' 기록과 첨부 파일을 삭제할까요?`)) return
    try { await deletePersonalRecordEntry(entry); toast.show('기록을 삭제했어요') } catch { toast.show('기록을 삭제하지 못했어요') }
  }
  return <>
    <main className="scroll">
      <div className="detail-bar rec-folder-bar">
        <button type="button" className="detail-back" onClick={onBack} aria-label="폴더 목록으로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
        <b>{folder.name}</b>
        <button type="button" className="edit-btn" onClick={() => setEditing(true)} aria-label="폴더 수정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg></button>
      </div>
      {loadErr && <div className="banner-err">{loadErr}</div>}
      {!entries.length && !loadErr ? <div className="empty-state"><RecordIcon /><p>아직 기록이 없어요.<br />아래 <b>+ 기록 추가</b>로 이미지나 PDF를 올려보세요.</p></div> : <div className="rec-grid">{entries.map((entry) => <article key={entry.id} className="rec-card personal-video-card">
        <button type="button" className="personal-video-open" onClick={() => setViewing(entry)}><div className="rec-thumb">{entry.kind === 'images' && entry.files[0]?.url ? <img src={entry.files[0].url} alt="" loading="lazy" /> : <span className="rec-thumb-none"><PdfIcon /></span>}</div><div className="rec-meta"><h3>{entry.title}</h3><p>{entry.kind === 'pdf' ? 'PDF' : `이미지 ${entry.files.length}장`}</p></div></button>
        <button type="button" className="personal-video-delete" onClick={() => void remove(entry)} aria-label="기록 삭제">×</button>
      </article>)}</div>}
    </main>
    <button className="fab" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>기록 추가</button>
    {adding && <RecordEntryForm folderId={folder.id} toast={toast} onClose={() => setAdding(false)} />}
    {viewing && <RecordViewer entry={viewing} onClose={() => setViewing(null)} />}
    {editing && <FolderForm config={config} repository={recordFolderRepository} editing={folder} onClose={() => setEditing(false)} />}
  </>
}

/** 러닝 폴더: 엔트리의 모든 필드를 그대로 덤프해 표시 (Health Connect 연동 시 데이터가 채워짐) */
function RunningFolderDetail({ folder, onBack, config, toast }: { folder: RecordingFolder; onBack: () => void; config: FolderModuleConfig; toast: ToastState }) {
  const [entries, setEntries] = useState<RunningEntry[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncRange, setSyncRange] = useState<SamsungHealthSyncRange>('90d')
  const canSync = isSamsungHealthSyncEnvironment()
  useBackHandler(onBack)
  useEffect(() => watchRunningEntries(folder.id, setEntries, () => setLoadErr('러닝 데이터를 불러오지 못했어요.')), [folder.id])

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get('healthSync')
    const imported = Number(url.searchParams.get('healthImported'))
    if (!result) return
    url.searchParams.delete('healthSync')
    url.searchParams.delete('healthImported')
    window.history.replaceState({}, '', url)
    if (result === 'success') toast.show(`삼성 헬스 러닝 기록 ${Number.isFinite(imported) ? imported : 0}건을 확인했어요`)
    else if (result === 'permission-denied') toast.show('삼성 헬스에서 운동 데이터 읽기를 허용해 주세요')
    else if (result === 'sdk-missing') toast.show('Samsung Health Data SDK가 포함된 최신 앱이 필요해요')
    else toast.show('삼성 헬스 동기화를 시작하려면 Android 앱을 업데이트해 주세요')
  }, [toast])

  async function syncSamsungHealth() {
    if (!canSync || syncing) return
    setSyncing(true)
    try {
      const session = await createSamsungHealthSyncSession(folder.id, syncRange)
      launchSamsungHealthSync({ ...session, folderId: folder.id })
    } catch (error) {
      const message = (error as { message?: string })?.message
      toast.show(message || '동기화 준비에 실패했어요')
      setSyncing(false)
    }
  }
  return <>
    <main className="scroll">
      <div className="detail-bar rec-folder-bar">
        <button type="button" className="detail-back" onClick={onBack} aria-label="폴더 목록으로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
        <b>{folder.name}</b>
        <button type="button" className="edit-btn" onClick={() => setEditing(true)} aria-label="폴더 수정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg></button>
      </div>
      <section className="run-sync-card">
        <div className="run-sync-copy">
          <b>Samsung Health</b>
          <p>{syncRange === 'all' ? '전체 기록을 처음 가져온 뒤에는 변경분만 빠르게 동기화합니다.' : `${syncRange === '1y' ? '최근 1년' : '최근 90일'} 러닝 기록을 가져옵니다.`}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => void syncSamsungHealth()} disabled={!canSync || syncing}>
          {syncing ? '연결 중…' : '동기화'}
        </button>
        <div className="run-sync-ranges" role="radiogroup" aria-label="동기화 기간">
          {([['90d', '90일'], ['1y', '1년'], ['all', '전체']] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={syncRange === value} className={syncRange === value ? 'on' : ''} onClick={() => setSyncRange(value)} disabled={syncing}>{label}</button>
          ))}
        </div>
        {!canSync && <p className="run-sync-note">삼성 헬스 동기화는 Android Amici 앱에서 사용할 수 있어요.</p>}
      </section>
      {loadErr && <div className="banner-err">{loadErr}</div>}
      {!loadErr && <RunningDashboard entries={entries} />}
      {!!entries.length && (
        <details className="run-raw">
          <summary>원본 데이터 {entries.length}건</summary>
          <div className="run-dump">
            {entries.map((entry) => (
              <article key={entry.id} className="run-entry">
                {Object.entries(entry)
                  .filter(([k]) => k !== 'id' && k !== 'folderId')
                  .map(([k, v]) => (
                    <div key={k} className="run-field"><span className="run-k">{k}</span><span className="run-v">{fmtVal(v)}</span></div>
                  ))}
              </article>
            ))}
          </div>
        </details>
      )}
    </main>
    {editing && <FolderForm config={config} repository={recordFolderRepository} editing={folder} onClose={() => setEditing(false)} />}
  </>
}

/** 값 표시: 객체/배열은 JSON, 나머지는 문자열 */
function fmtVal(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function RecordEntryForm({ folderId, toast, onClose }: { folderId: string; toast: ToastState; onClose: () => void }) {
  const { user } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  const images = files.filter((file) => file.type.startsWith('image/'))
  const kindOk = files.length > 0 && ((pdfs.length === 1 && images.length === 0) || (pdfs.length === 0 && images.length === files.length))
  function move(index: number, direction: -1 | 1) { setFiles((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next }) }
  async function submit() {
    if (!title.trim() || !kindOk || !user || busy) return
    setBusy(true); setErr('')
    const id = newId(); const selected = pdfs.length ? pdfs : images; const uploaded: ScoreFile[] = []
    try {
      for (let index = 0; index < selected.length; index++) { setProgress(`업로드 중 ${index + 1}/${selected.length}`); uploaded.push(await uploadPersonalRecordFile(folderId, id, selected[index], index)) }
      await savePersonalRecordEntry({ id, folderId, title: title.trim(), kind: pdfs.length ? 'pdf' : 'images', files: uploaded, addedBy: user.uid, createdAt: Date.now() })
      toast.show('기록을 추가했어요'); onClose()
    } catch (error) {
      if (uploaded.length) await deletePersonalRecordEntry({ id, folderId, title, kind: pdfs.length ? 'pdf' : 'images', files: uploaded, addedBy: user.uid, createdAt: Date.now() })
      const code = (error as { code?: string })?.code ?? ''
      setErr(code === 'storage/unauthorized' || code === 'permission-denied' ? '업로드 권한이 없어요.' : '업로드하지 못했어요.' + (code ? ` (${code})` : ''))
    } finally { setBusy(false); setProgress('') }
  }
  return <div className="scrim open" onClick={(event) => event.target === event.currentTarget && onClose()}><div className="sheet" ref={sheetRef}>
    <div className="grab-zone" {...grabHandlers}><div className="grab" /></div><h2>기록 추가</h2>
    <div className="field"><label htmlFor="record-title">제목</label><input id="record-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} autoFocus placeholder="예) 공부 노트, 영수증, 참고 자료" /></div>
    <div className="field"><label htmlFor="record-files">파일 (PDF 1개 또는 이미지 여러 장)</label><input id="record-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
      {!!files.length && <ul className="score-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><span className="score-file-name">{file.name}</span><span className="score-file-btns"><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === files.length - 1}>↓</button><button type="button" onClick={() => setFiles((current) => current.filter((_, item) => item !== index))}>×</button></span></li>)}</ul>}
      {!!files.length && !kindOk && <p className="err small">PDF 1개 또는 이미지만 여러 장 선택해 주세요. 서로 섞을 수 없어요.</p>}
    </div>
    {err && <p className="err small">{err}</p>}<div className="actions"><button className="btn subtle" onClick={onClose} disabled={busy}>취소</button><button className="btn primary" onClick={() => void submit()} disabled={!title.trim() || !kindOk || busy}>{busy ? progress || '저장 중…' : '올리기'}</button></div>
  </div></div>
}

function RecordViewer({ entry, onClose }: { entry: PersonalRecordEntry; onClose: () => void }) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose); useBackHandler(onClose)
  return <div className="scrim open" onClick={(event) => event.target === event.currentTarget && onClose()}><div className="sheet score-viewer-sheet" ref={sheetRef}>
    <div className="grab-zone" {...grabHandlers}><div className="grab" /></div><div className="setlist-head"><h2>{entry.title}</h2><p>{entry.kind === 'pdf' ? 'PDF 문서' : `이미지 ${entry.files.length}장`}</p></div>
    <div className="score-viewer-scroll">{entry.kind === 'pdf' ? <PdfPages url={entry.files[0]?.url ?? ''} /> : <div className="score-gallery">{entry.files.map((file, index) => <img key={file.path} src={file.url} alt={`${index + 1}페이지`} loading="lazy" />)}</div>}</div>
    <div className="actions score-viewer-actions"><button className="btn primary" onClick={() => entry.files.forEach((file) => window.open(file.url, '_blank', 'noopener'))}>원본 열기</button><button className="btn subtle" onClick={onClose}>닫기</button></div>
  </div></div>
}

function PdfPages({ url }: { url: string }) {
  const [pages, setPages] = useState<string[]>([]); const [error, setError] = useState(false)
  useEffect(() => { let cancelled = false; void (async () => { try { const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; const doc = await pdfjs.getDocument({ url }).promise; const output: string[] = []; for (let index = 1; index <= doc.numPages; index++) { const page = await doc.getPage(index); const viewport = page.getViewport({ scale: Math.min(2, (devicePixelRatio || 1) * 1.5) }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const context = canvas.getContext('2d'); if (context) { await page.render({ canvas, canvasContext: context, viewport }).promise; output.push(canvas.toDataURL('image/jpeg', .85)) } page.cleanup() } if (!cancelled) setPages(output) } catch { if (!cancelled) setError(true) } })(); return () => { cancelled = true } }, [url])
  if (error) return <p className="err small">PDF 미리보기를 열지 못했어요. 원본 열기를 사용해 주세요.</p>
  if (!pages.length) return <p className="hint score-pdf-loading">PDF 불러오는 중…</p>
  return <div className="score-gallery">{pages.map((page, index) => <img key={index} src={page} alt={`${index + 1}페이지`} />)}</div>
}
function RecordIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg> }
function RunIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="17" cy="5" r="2" /><path d="M14 8l-3 2 2 3 3 1M11 10l-3 1-2 4M13 13l1 5M13 13l-3 2-2 4" /></svg> }
function PdfIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M8.5 16h7M8.5 12h7" /></svg> }
