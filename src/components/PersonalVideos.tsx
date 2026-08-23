import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import {
  deletePersonalVideo,
  deleteRecipeIngredient,
  deleteVideoFolder,
  newId,
  savePersonalVideo,
  saveRecipeIngredient,
  saveVideoFolder,
  watchPersonalVideos,
  watchRecipeIngredients,
  watchVideoFolders,
} from '../data'
import type { PersonalVideo, RecipeIngredient, RecordingFolder } from '../types'
import { fetchVideoDescription, fetchYouTubeMeta, parseVideoId, thumbnailUrl, watchUrl } from '../youtube'
import { importYouTubePlaylist, playlistImportErrorMessage, resolveYouTubePlaylistTitle } from '../playlistImport'
import FolderModule, { FolderForm, type FolderModuleConfig, type FolderRepository } from './FolderModule'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'

const VIDEO_FOLDER_CONFIG: FolderModuleConfig = {
  labels: {
    folder: '영상 폴더', empty: '영상 폴더가 없어요.', add: '폴더',
    createTitle: '새 영상 폴더', editTitle: '영상 폴더 수정', name: '폴더 이름',
    placeholder: '예) 요리, 운동, 공부',
    deleteConfirm: (name) => `'${name}' 폴더와 안의 영상을 모두 삭제할까요?`,
  },
  rowIcon: (folder) => folder.templateId === 'recipe' ? <span aria-label="레시피">🍳</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="m10 10 5 3-5 3z" /></svg>,
  templates: [
    { id: 'video', label: '일반 영상', symbol: '▶', description: '영상을 자유롭게 분류해요.' },
    { id: 'recipe', label: '레시피', symbol: '🍳', description: '재료와 조리법을 함께 기록해요.' },
  ],
}

const videoFolderRepository: FolderRepository<RecordingFolder> = {
  watch: watchVideoFolders,
  create: (name, creatorUid, templateId) => ({ id: newId(), name, templateId: templateId === 'recipe' ? 'recipe' : 'video', createdBy: creatorUid, createdAt: Date.now(), order: Date.now() }),
  save: saveVideoFolder,
  remove: (folder) => deleteVideoFolder(folder.id),
  playlistImport: {
    templateIds: ['video'],
    resolveName: resolveYouTubePlaylistTitle,
    errorMessage: playlistImportErrorMessage,
    run: (folder, url, onProgress) => importYouTubePlaylist({
      input: url,
      save: (song, index) => savePersonalVideo({
        id: song.videoId,
        folderId: folder.id,
        videoId: song.videoId,
        url: song.url,
        title: song.title || '제목 없는 영상',
        thumbnail: song.thumbnail,
        note: song.description || undefined,
        order: index,
        addedBy: folder.createdBy,
        createdAt: Date.now() + index,
      }),
      onProgress: ({ current, total }) => onProgress(`영상 추가 중 ${current}/${total}`),
    }),
  },
}

export default function PersonalVideos({ toast }: { toast: ToastState }) {
  return <FolderModule config={VIDEO_FOLDER_CONFIG} repository={videoFolderRepository}
    renderDetail={(folder, onBack) => <VideoFolderDetail folder={folder} onBack={onBack} toast={toast} />} />
}

function VideoFolderDetail({ folder, onBack, toast }: { folder: RecordingFolder; onBack: () => void; toast: ToastState }) {
  const [videos, setVideos] = useState<PersonalVideo[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [section, setSection] = useState<'videos' | 'ingredients'>('videos')
  const [ingredientFilter, setIngredientFilter] = useState<string>('all')
  const [adding, setAdding] = useState(false)
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [editingFolder, setEditingFolder] = useState(false)
  const [playing, setPlaying] = useState<PersonalVideo | null>(null)
  useBackHandler(onBack)

  useEffect(() => watchPersonalVideos(folder.id, setVideos, () => setLoadErr('영상을 불러오지 못했어요.')), [folder.id])
  useEffect(() => folder.templateId === 'recipe'
    ? watchRecipeIngredients(folder.id, setIngredients, () => setLoadErr('재료를 불러오지 못했어요.'))
    : undefined, [folder.id, folder.templateId])

  const isRecipe = folder.templateId === 'recipe'
  const visibleVideos = ingredientFilter === 'all'
    ? videos
    : videos.filter((video) => video.ingredientIds?.includes(ingredientFilter))

  useEffect(() => {
    if (ingredientFilter !== 'all' && !ingredients.some((ingredient) => ingredient.id === ingredientFilter)) {
      setIngredientFilter('all')
    }
  }, [ingredientFilter, ingredients])

  async function remove(video: PersonalVideo) {
    if (!confirm(`'${video.title}' 영상을 삭제할까요?`)) return
    try {
      await deletePersonalVideo(folder.id, video.id)
      toast.show('영상을 삭제했어요')
    } catch {
      toast.show('삭제하지 못했어요')
    }
  }

  return (
    <>
      <main className="scroll">
        <div className="detail-bar">
          <button type="button" className="detail-back" onClick={onBack} aria-label="폴더 목록으로">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <b>{folder.name}</b>
          <button type="button" className="edit-btn" onClick={() => setEditingFolder(true)} aria-label="폴더 수정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
          </button>
        </div>
        {isRecipe && <div className="segmented recipe-sections" role="tablist" aria-label="레시피 폴더 메뉴">
          <button type="button" className={section === 'videos' ? 'on' : ''} onClick={() => setSection('videos')}>영상</button>
          <button type="button" className={section === 'ingredients' ? 'on' : ''} onClick={() => setSection('ingredients')}>재료 <span>{ingredients.length}</span></button>
        </div>}
        {loadErr && <div className="banner-err">{loadErr}</div>}
        {isRecipe && section === 'ingredients' ? (
          ingredients.length === 0 ? <div className="empty-state"><span className="ingredient-empty-icon">🥕</span><p>등록된 재료가 없어요.<br />아래 <b>+ 재료 추가</b>로 시작하세요.</p></div> :
            <div className="list ingredient-list">{ingredients.map((ingredient) => <div className="playlist-row" key={ingredient.id}>
              <div className="playlist-ico ingredient-ico">🥕</div><div className="playlist-info"><h3>{ingredient.name}</h3></div>
              <button type="button" className="edit-btn" aria-label={`${ingredient.name} 삭제`} onClick={() => void removeIngredient(folder.id, ingredient)}>×</button>
            </div>)}</div>
        ) : videos.length === 0 && !loadErr ? (
          <div className="empty-state"><VideoIcon /><p>이 폴더에 영상이 없어요.<br />아래 <b>+ 영상 추가</b>로 유튜브 링크를 저장하세요.</p></div>
        ) : (
          <>
          {isRecipe && ingredients.length > 0 && <div className="recipe-filter" aria-label="재료별 영상 필터">
            <button type="button" className="chip" aria-pressed={ingredientFilter === 'all'} onClick={() => setIngredientFilter('all')}>전체 <span>{videos.length}</span></button>
            {ingredients.map((ingredient) => {
              const count = videos.filter((video) => video.ingredientIds?.includes(ingredient.id)).length
              return <button key={ingredient.id} type="button" className="chip" aria-pressed={ingredientFilter === ingredient.id} onClick={() => setIngredientFilter(ingredient.id)}>{ingredient.name} <span>{count}</span></button>
            })}
          </div>}
          {visibleVideos.length === 0 ? <div className="empty-state compact"><span className="ingredient-empty-icon">🥕</span><p>이 재료가 포함된 영상이 없어요.</p></div> : <div className="rec-grid personal-video-grid">
            {visibleVideos.map((video) => (
              <article key={video.id} className="rec-card personal-video-card">
                <button type="button" className="personal-video-open" onClick={() => setPlaying(video)}>
                  <div className="rec-thumb"><img src={video.thumbnail || thumbnailUrl(video.videoId)} alt="" loading="lazy" /><span className="personal-play"><VideoIcon /></span></div>
                  <div className="rec-meta"><h3>{video.title}</h3>{(video.recipe || video.note) && <p>{video.recipe || video.note}</p>}</div>
                </button>
                <button type="button" className="personal-video-delete" onClick={() => void remove(video)} aria-label="영상 삭제">×</button>
              </article>
            ))}
          </div>}
          </>
        )}
      </main>
      {isRecipe && section === 'ingredients' ?
        <button className="fab" onClick={() => setAddingIngredient(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>재료 추가</button> :
        <button className="fab" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>영상 추가</button>}
      {adding && <VideoForm folderId={folder.id} ingredients={ingredients} isRecipe={isRecipe} nextOrder={videos.length ? Math.max(...videos.map((v) => v.order)) + 1 : 0} onClose={() => setAdding(false)} />}
      {addingIngredient && <IngredientForm folderId={folder.id} nextOrder={ingredients.length ? Math.max(...ingredients.map((v) => v.order)) + 1 : 0} onClose={() => setAddingIngredient(false)} />}
      {editingFolder && <FolderForm config={VIDEO_FOLDER_CONFIG} repository={videoFolderRepository} editing={folder} onClose={() => setEditingFolder(false)} />}
      {playing && <VideoPlayer video={playing} ingredients={ingredients} onClose={() => setPlaying(null)} />}
    </>
  )
}

async function removeIngredient(folderId: string, ingredient: RecipeIngredient) {
  if (!confirm(`'${ingredient.name}' 재료를 삭제할까요? 기존 레시피의 선택에서도 표시되지 않게 됩니다.`)) return
  await deleteRecipeIngredient(folderId, ingredient.id)
}

function VideoForm({ folderId, ingredients, isRecipe, nextOrder, onClose }: { folderId: string; ingredients: RecipeIngredient[]; isRecipe: boolean; nextOrder: number; onClose: () => void }) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [recipe, setRecipe] = useState('')
  const [ingredientIds, setIngredientIds] = useState<string[]>([])
  const [fetchingTitle, setFetchingTitle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const autoTitle = useRef('')
  const autoNote = useRef('')
  const noteEdited = useRef(false)
  const autoRecipe = useRef('')
  const recipeEdited = useRef(false)
  const metaRequest = useRef(0)

  function onUrlChange(value: string) {
    setUrl(value)
    setErr('')
    const videoId = parseVideoId(value)
    const request = ++metaRequest.current
    if (!videoId) { setFetchingTitle(false); return }

    setFetchingTitle(true)
    Promise.all([fetchYouTubeMeta(videoId), fetchVideoDescription(videoId)])
      .then(([meta, description]) => {
        if (request !== metaRequest.current) return
        if (meta.title) setTitle((current) => {
          if (current.trim() && current !== autoTitle.current) return current
          autoTitle.current = meta.title
          return meta.title
        })
        if (description) {
          if (isRecipe && !recipeEdited.current) setRecipe((current) => {
            if (current.trim() && current !== autoRecipe.current) return current
            autoRecipe.current = description
            return description
          })
          if (!isRecipe && !noteEdited.current) setNote((current) => {
            if (current.trim() && current !== autoNote.current) return current
            autoNote.current = description
            return description
          })
        }
      })
      .catch(() => {})
      .finally(() => {
        if (request === metaRequest.current) setFetchingTitle(false)
      })
  }

  async function submit() {
    const videoId = parseVideoId(url)
    if (!videoId || busy) { setErr('올바른 유튜브 링크를 입력해 주세요.'); return }
    setBusy(true); setErr('')
    try {
      const [meta, description] = await Promise.all([fetchYouTubeMeta(videoId), fetchVideoDescription(videoId)])
      const video: PersonalVideo = {
        id: videoId, folderId, videoId, url: watchUrl(videoId),
        title: title.trim() || meta.title || '제목 없는 영상', thumbnail: meta.thumbnail || thumbnailUrl(videoId),
        note: isRecipe ? undefined : (noteEdited.current ? (note || undefined) : (note || description || undefined)),
        ingredientIds: isRecipe ? ingredientIds : undefined,
        recipe: isRecipe ? (recipeEdited.current ? (recipe || undefined) : (recipe || description || undefined)) : undefined,
        order: nextOrder, addedBy: member?.uid ?? '', createdAt: Date.now(),
      }
      await savePersonalVideo(video)
      onClose()
    } catch {
      setErr('영상을 저장하지 못했어요.')
    } finally { setBusy(false) }
  }

  return <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="sheet" ref={sheetRef}>
    <div className="grab-zone" {...grabHandlers}><div className="grab" /></div><h2>유튜브 영상 추가</h2>
    <div className="field"><label htmlFor="pv-url">유튜브 링크</label><input id="pv-url" value={url} onChange={(e) => onUrlChange(e.target.value)} placeholder="https://youtu.be/..." autoFocus /></div>
    <div className="field"><label htmlFor="pv-title">제목 <span className="muted">({fetchingTitle ? '가져오는 중…' : '자동 입력 후 수정 가능'})</span></label><input id="pv-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={fetchingTitle ? '유튜브 제목을 가져오는 중…' : ''} /></div>
    {isRecipe ? <>
      <div className="field"><label>재료 <span className="muted">(여러 개 선택 가능)</span></label>
        {ingredients.length ? <div className="ingredient-picker">{ingredients.map((ingredient) => {
          const selected = ingredientIds.includes(ingredient.id)
          return <button key={ingredient.id} type="button" className="chip" aria-pressed={selected} onClick={() => setIngredientIds((current) => selected ? current.filter((id) => id !== ingredient.id) : [...current, ingredient.id])}>{ingredient.name}</button>
        })}</div> : <p className="hint">이 폴더의 재료 탭에서 재료를 먼저 추가해 주세요.</p>}
      </div>
      <div className="field"><label htmlFor="pv-recipe">레시피 <span className="muted">(영상 설명 자동 입력 후 수정 가능)</span></label><textarea id="pv-recipe" value={recipe} onChange={(e) => { recipeEdited.current = true; setRecipe(e.target.value) }} rows={10} maxLength={5000} /></div>
    </> : <div className="field"><label htmlFor="pv-note">메모 <span className="muted">(영상 설명 자동 입력 후 수정 가능)</span></label><textarea id="pv-note" value={note} onChange={(e) => { noteEdited.current = true; setNote(e.target.value) }} rows={6} maxLength={5000} /></div>}
    {err && <p className="err small">{err}</p>}<div className="actions"><button className="btn subtle" onClick={onClose} disabled={busy}>취소</button><button className="btn primary" onClick={() => void submit()} disabled={!url.trim() || busy}>{busy ? '가져오는 중…' : '추가'}</button></div>
  </div></div>
}

function IngredientForm({ folderId, nextOrder, onClose }: { folderId: string; nextOrder: number; onClose: () => void }) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await saveRecipeIngredient({ id: newId(), folderId, name: name.trim(), order: nextOrder, createdAt: Date.now() })
      onClose()
    } catch { setErr('재료를 저장하지 못했어요.'); setBusy(false) }
  }

  return <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="sheet" ref={sheetRef}>
    <div className="grab-zone" {...grabHandlers}><div className="grab" /></div><h2>재료 추가</h2>
    <div className="field"><label htmlFor="ingredient-name">재료 이름</label><input id="ingredient-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} placeholder="예) 양파, 올리브오일" maxLength={50} autoFocus /></div>
    {err && <p className="err small">{err}</p>}<div className="actions"><button className="btn subtle" onClick={onClose} disabled={busy}>취소</button><button className="btn primary" onClick={() => void submit()} disabled={!name.trim() || busy}>{busy ? '저장 중…' : '추가'}</button></div>
  </div></div>
}

function VideoPlayer({ video, ingredients, onClose }: { video: PersonalVideo; ingredients: RecipeIngredient[]; onClose: () => void }) {
  useBackHandler(onClose)
  const selectedIngredients = ingredients.filter((ingredient) => video.ingredientIds?.includes(ingredient.id))
  return <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="sheet personal-video-player">
    <div className="player-video"><iframe src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&playsinline=1`} title={video.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>
    <h2>{video.title}</h2>
    {selectedIngredients.length > 0 && <section className="recipe-detail"><h3>재료</h3><div className="ingredient-picker">{selectedIngredients.map((ingredient) => <span className="chip" key={ingredient.id}>{ingredient.name}</span>)}</div></section>}
    {video.recipe && <section className="recipe-detail"><h3>레시피</h3><p>{video.recipe}</p></section>}
    {video.note && <p className="muted recipe-copy">{video.note}</p>}<div className="actions"><button className="btn subtle block" onClick={onClose}>닫기</button></div>
  </div></div>
}

function VideoIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg> }
