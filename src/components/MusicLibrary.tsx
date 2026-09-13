import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { classifyMusicPlaylist, getMusicEventReferences, savePlaylist, watchAllMusicTracks, watchEvents, watchPlaylists } from '../data'
import type { Playlist } from '../types'
import { FolderForm } from './FolderModule'
import { PlaylistDetail } from './Music'
import { MUSIC_FOLDER_CONFIG, playlistRepository } from './musicRepository'
import type { ToastState } from './Toast'
import { useBackHandler } from '../backnav'

export default function MusicLibrary({ toast }: { toast: ToastState }) {
  const { member } = useAuth()
  const [lists, setLists] = useState<Playlist[]>([])
  const [linked, setLinked] = useState<Set<string> | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [folderDraft, setFolderDraft] = useState('')
  const [folderFormOpen, setFolderFormOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [hasCandidates, setHasCandidates] = useState(true)
  useEffect(() => {
    setHasCandidates(true)
    if (!openId) return
    return watchAllMusicTracks(openId, (tracks) => setHasCandidates(tracks.some((t) => !!t.candidateStatus)), (e) => setError(e.message))
  }, [openId])
  useEffect(() => watchPlaylists(setLists, (e) => setError(e.message)), [])
  useEffect(() => {
    let alive = true
    const unsub = watchEvents((events) => { void getMusicEventReferences(events).then((ids) => { if (alive) setLinked(ids) }).catch((e) => { if (alive) setError(e.message) }) }, (e) => setError(e.message))
    return () => { alive = false; unsub() }
  }, [])
  const legacyIds = lists.filter((p) => !p.templateId).map((p) => p.id).sort().join(',')
  useEffect(() => {
    if (!linked || !member || !legacyIds) return
    const saving = new Set<string>()
    return (() => {
      const unsub = lists.filter((p) => !p.templateId).map((p) => watchAllMusicTracks(p.id, (tracks) => {
        if (saving.has(p.id)) return
        saving.add(p.id)
        // Preserve all existing tracks and references; only classify list metadata.
        const project = linked.has(p.id) || /공연|합주|셋리스트|setlist/i.test(p.name) || tracks.some((t) => Object.keys(t.participants ?? {}).length > 0)
        void classifyMusicPlaylist(p, project).catch((e) => { setError(e.message); saving.delete(p.id) })
      }, (e) => setError(e.message)))
      return () => unsub.forEach((fn) => fn())
    })()
  // Re-run only when the unclassified list set or event references change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyIds, linked, member?.uid])
  useBackHandler(() => setFolder(null), !!folder && !openId)
  const repository = useMemo(() => ({ ...playlistRepository, create: (name: string, uid: string, template?: string) => ({ ...playlistRepository.create(name, uid, template), folderName: folder || '함께 듣는 음악' }) }), [folder])
  const current = lists.find((p) => p.id === openId)
  const folders = [...new Set(['함께 듣는 음악', '공연·합주', ...extraFolders, ...lists.map((p) => p.folderName || '분류 중')])]
  function createFolder() {
    const name = folderDraft.trim()
    if (!name) return
    setExtraFolders((prev) => prev.includes(name) ? prev : [...prev, name])
    setFolder(name)
    setFolderDraft('')
    setFolderFormOpen(false)
    setAdding(true)
  }
  if (current) return <>
    <div className="music-tabs"><label>폴더 <select value={current.folderName || '분류 중'} onChange={(e) => void savePlaylist({ ...current, folderName: e.target.value }).catch(() => toast.show('폴더 이동에 실패했어요'))}>{folders.map((f) => <option key={f}>{f}</option>)}</select></label><label>템플릿 <select value={current.templateId || 'project'} onChange={(e) => void savePlaylist({ ...current, templateId: e.target.value as 'general' | 'project' }).catch(() => toast.show('변경에 실패했어요'))}><option value="general" disabled={hasCandidates}>일반 곡목록{hasCandidates ? ' (추천 기록 있음)' : ''}</option><option value="project">공연·합주 프로젝트</option></select></label></div>
    <PlaylistDetail key={current.id + current.templateId} playlist={current} toast={toast} onBack={() => setOpenId(null)} />
  </>
  return <><main className="scroll">
    {error && <p className="banner-err">{error}</p>}
    {folder ? <>
      <button type="button" className="detail-bar music-folder-back" onClick={() => setFolder(null)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg><strong>{folder}</strong></button>
      <div className="list playlist-list">{lists.filter((p) => (p.folderName || '분류 중') === folder).map((p) => <button className="playlist-row" key={p.id} onClick={() => setOpenId(p.id)}><div className="playlist-ico" aria-hidden="true">{p.templateId === 'general' ? '🎧' : '🎸'}</div><div className="playlist-info"><h3>{p.name}</h3><span className="muted">{p.templateId === 'general' ? '일반 곡목록' : '공연·합주 프로젝트'}</span></div><svg className="playlist-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></button>)}</div>
    </> : <>
      <div className="list playlist-list">{folders.map((f) => <button className="playlist-row" key={f} onClick={() => setFolder(f)}><div className="playlist-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></div><div className="playlist-info"><h3>{f}</h3><span className="muted">{lists.filter((p) => (p.folderName || '분류 중') === f).length}개 목록</span></div><svg className="playlist-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg></button>)}</div>
    </>}
  </main>
  <button className="fab" onClick={() => folder ? setAdding(true) : setFolderFormOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{folder ? '목록' : '폴더'}</button>
  {folderFormOpen && <div className="scrim open" onClick={(e) => e.target === e.currentTarget && setFolderFormOpen(false)}><div className="sheet"><div className="grab" /><h2>새 폴더</h2><div className="field"><label htmlFor="music-folder-name">폴더 이름</label><input id="music-folder-name" autoFocus maxLength={40} placeholder="예) 2026년 정기공연" value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder() } }} /></div><p className="hint">폴더를 만든 다음 첫 곡목록의 템플릿을 선택해요.</p><div className="actions"><button className="btn subtle" onClick={() => setFolderFormOpen(false)}>취소</button><button className="btn primary" disabled={!folderDraft.trim()} onClick={createFolder}>다음</button></div></div></div>}
  {adding && <FolderForm config={MUSIC_FOLDER_CONFIG} repository={repository} editing={null} onClose={() => setAdding(false)} />}</>
}
