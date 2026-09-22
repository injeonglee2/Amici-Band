import { useEffect, useState } from 'react'
import { getMyboxMediaUrl, type MyboxMedia } from '../data'
import { readMyboxCache, syncMyboxCache, type MyboxCacheSnapshot } from '../myboxCache'
import Sheet from './Sheet'
import FolderDetailHeader from './FolderDetailHeader'
import type { ToastState } from './Toast'

const mediaDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

export default function MyboxMediaFolder({ toast }: { toast: ToastState }) {
  const root = { id: 'aWxvYjc5fDM0NzI1OTY5MDQ2OTYxNDM2OTZ8RHww', name: 'Amici' }
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState([root])
  const [items, setItems] = useState<MyboxMedia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<{ item: MyboxMedia; url: string } | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [cache, setCache] = useState<MyboxCacheSnapshot | null>(null)

  const currentFolder = path[path.length - 1]

  function showFolder(snapshot: MyboxCacheSnapshot, folderId = currentFolder.id) {
    setItems(snapshot.folders[folderId] ?? [])
  }

  async function sync(showSuccess = true) {
    setLoading(true); setError('')
    try {
      const snapshot = await syncMyboxCache(root.id)
      setCache(snapshot)
      showFolder(snapshot)
      if (showSuccess) toast.show('MYBOX 전체 목록을 동기화했어요')
    } catch (e) {
      setError((e as { message?: string })?.message?.replace(/^FirebaseError:\s*/, '') || 'MYBOX를 동기화하지 못했어요. 기존 캐시는 유지돼요.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true); setError('')
    void readMyboxCache().then((snapshot) => {
      if (!active) return
      if (snapshot) {
        setCache(snapshot)
        showFolder(snapshot)
        setLoading(false)
      } else void sync(false)
    }).catch(() => { if (active) void sync(false) })
    return () => { active = false }
  }, [open])
  useEffect(() => { if (open && cache) showFolder(cache, currentFolder.id) }, [open, cache, currentFolder.id])
  useEffect(() => {
    let active = true
    setPreviews({})
    const images = items.filter((item) => item.type === 'file' && item.category === 'image').slice(0, 30)
    void Promise.all(images.map(async (item) => {
      try {
        const { url } = await getMyboxMediaUrl(item.id)
        if (active && url) setPreviews((current) => ({ ...current, [item.id]: url }))
      } catch { /* 썸네일 실패는 기본 이미지로 표시 */ }
    }))
    return () => { active = false }
  }, [items])

  async function show(item: MyboxMedia) {
    try {
      const { url } = await getMyboxMediaUrl(item.id)
      if (!url) throw new Error()
      setViewer({ item, url })
    } catch { toast.show('파일을 열지 못했어요.') }
  }

  if (!open) return (
    <button type="button" className="rec-card rec-folder mybox-folder" onClick={() => setOpen(true)}>
      <div className="rec-thumb">
        <span className="rec-thumb-none" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M12 9v8"/></svg>
        </span>
        <span className="rec-folder-badge">MYBOX</span>
      </div>
      <div className="rec-meta"><h3>Amici 사진·영상</h3><small>공유 폴더</small></div>
      <span className="rec-folder-badge">연결</span>
    </button>
  )

  return <div className="mybox-browser">
    <FolderDetailHeader className="rec-folder-bar" title={currentFolder.name} onBack={() => path.length > 1 ? setPath((value) => value.slice(0, -1)) : setOpen(false)} onSync={() => void sync()} syncLabel="MYBOX 전체 목록 동기화" />
    {loading ? <p className="setlist-empty">불러오는 중…</p> : error ? <div className="banner-err">{error}</div> : items.length === 0 ? <p className="setlist-empty">사진이나 영상이 없어요.</p> : (
      <div className="mybox-gallery">{items.map((item) => <button key={item.id} type="button" className={'rec-card mybox-gallery-card' + (item.type === 'folder' ? ' folder' : '')} onClick={() => item.type === 'folder' ? setPath((value) => [...value, { id: item.id, name: item.name }]) : void show(item)}>
        <div className="rec-thumb">
          {previews[item.id] ? <img src={previews[item.id]} alt="" loading="lazy" /> : <span className="rec-thumb-none mybox-gallery-placeholder" aria-hidden="true">{item.type === 'folder'
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            : item.category === 'video' ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></svg>}</span>}
          {item.type === 'folder' && <span className="rec-folder-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>}
        </div>
        <div className="rec-meta"><h3>{item.name}</h3><small>{item.type === 'folder' ? '폴더' : mediaDate(item.modifiedAt)}</small></div>
      </button>)}</div>
    )}
    {viewer && <Sheet onClose={() => setViewer(null)}>
      <h2 className="sheet-title">{viewer.item.name}</h2>
      <div className="mybox-viewer">{viewer.item.category === 'video'
        ? <video src={viewer.url} controls autoPlay playsInline />
        : <img src={viewer.url} alt={viewer.item.name} />}</div>
    </Sheet>}
  </div>
}
