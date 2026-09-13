import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { classifyMusicPlaylist, getMusicEventReferences, saveMusicFolder, watchMusicFolders, savePlaylist, watchAllMusicTracks, watchEvents, watchPlaylists } from '../data'
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
  useEffect(() => watchMusicFolders(setExtraFolders, (e) => setError(e.message)), [])
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
  if (current) return <>
    <div className="music-tabs"><label>폴더 <select value={current.folderName || '분류 중'} onChange={(e) => void savePlaylist({ ...current, folderName: e.target.value }).catch(() => toast.show('폴더 이동에 실패했어요'))}>{folders.map((f) => <option key={f}>{f}</option>)}</select></label><label>템플릿 <select value={current.templateId || 'project'} onChange={(e) => void savePlaylist({ ...current, templateId: e.target.value as 'general' | 'project' }).catch(() => toast.show('변경에 실패했어요'))}><option value="general" disabled={hasCandidates}>일반 곡목록{hasCandidates ? ' (추천 기록 있음)' : ''}</option><option value="project">공연·합주 프로젝트</option></select></label></div>
    <PlaylistDetail key={current.id + current.templateId} playlist={current} toast={toast} onBack={() => setOpenId(null)} />
  </>
  return <><main className="scroll">
    {error && <p className="banner-err">{error}</p>}
    <h2>{folder || '음악 폴더'}</h2>
    {folder ? <><button className="btn subtle" onClick={() => setFolder(null)}>폴더 목록으로</button><div className="list playlist-list">{lists.filter((p) => (p.folderName || '분류 중') === folder).map((p) => <button className="playlist-row" key={p.id} onClick={() => setOpenId(p.id)}><div className="playlist-info"><h3>{p.name}</h3><span className="muted">{p.templateId === 'general' ? '🎧 일반 곡목록' : '🎸 공연·합주 프로젝트'}</span></div></button>)}</div><button className="btn primary" onClick={() => setAdding(true)}>+ 목록 만들기</button></> : <><p className="hint">감상용 음악과 공연·합주 준비를 폴더로 정리해요.</p><div className="list playlist-list">{folders.map((f) => <button className="playlist-row" key={f} onClick={() => setFolder(f)}>📁 {f} <span className="muted">{lists.filter((p) => (p.folderName || '분류 중') === f).length}</span></button>)}</div><div className="music-tabs"><input aria-label="새 폴더 이름" placeholder="새 폴더 이름" value={folderDraft} onInput={(e) => setFolderDraft(e.currentTarget.value)} /><button className="btn subtle" disabled={!folderDraft.trim()} onClick={() => { const name = folderDraft.trim(); void saveMusicFolder(name).then(() => { setFolder(name); setFolderDraft('') }).catch(() => setError('폴더를 만들지 못했어요')) }}>폴더 만들기</button></div></>}
  </main>{adding && <FolderForm config={MUSIC_FOLDER_CONFIG} repository={repository} editing={null} onClose={() => setAdding(false)} />}</>
}
