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
  updatePersonalVideoTitles,
  watchPersonalVideos,
  watchRecipeIngredients,
  watchVideoFolders,
} from '../data'
import { INGREDIENT_CATEGORIES, type PersonalVideo, type RecipeIngredient, type RecordingFolder } from '../types'
import { FolderTagEditor } from './FolderTagEditor'
import { Icon } from '../icons'
import { fetchVideoDescription, fetchYouTubeMeta, parseVideoId, thumbnailUrl, watchUrl } from '../youtube'
import { importYouTubePlaylist, playlistImportErrorMessage, resolveYouTubePlaylistTitle } from '../playlistImport'
import FolderModule, { type FolderModuleConfig, type FolderRepository } from './FolderModule'
import FolderDetailHeader, { FolderDeleteButton } from './FolderDetailHeader'
import MediaListRow from './MediaListRow'
import { compactYouTubeDescription } from '../youtubeDescription'
import type { ToastState } from './Toast'
import { useSheetSwipe } from './useSheetSwipe'
import { cleanPersonalVideoTitle } from '../videoTitle'

const MACHINE_LEARNING_FOLDER = '혼자 공부하는 머신러닝+딥러닝'

const VIDEO_FOLDER_CONFIG: FolderModuleConfig = {
  labels: {
    folder: '영상 폴더', empty: '영상 폴더가 없어요.', add: '폴더',
    createTitle: '새 영상 폴더', editTitle: '영상 폴더 수정', name: '폴더 이름',
    placeholder: '예) 요리, 운동, 공부',
    deleteConfirm: (name) => `'${name}' 폴더와 안의 영상을 모두 삭제할까요?`,
  },
  taggable: true,
  rowIcon: (folder) => <span className="folder-emoji" aria-hidden>{folder.templateId === 'recipe' ? '🍳' : '🎬'}</span>,
  templates: [
    { id: 'video', label: '일반 영상', symbol: '🎬', description: '영상을 자유롭게 분류해요.' },
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
        title: cleanPersonalVideoTitle(song.title) || '제목 없는 영상',
        thumbnail: song.thumbnail,
        note: compactYouTubeDescription(song.description) || undefined,
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
  const [editingIngredient, setEditingIngredient] = useState<RecipeIngredient | null>(null)
  const [editingFolder, setEditingFolder] = useState(false)
  const [folderDraft, setFolderDraft] = useState(folder.name)
  const [folderTagDraft, setFolderTagDraft] = useState(folder.tagId ?? '')
  const [playing, setPlaying] = useState<PersonalVideo | null>(null)
  const titleCleanupStarted = useRef(false)
  useBackHandler(() => editingFolder ? setEditingFolder(false) : onBack())

  useEffect(() => watchPersonalVideos(folder.id, setVideos, () => setLoadErr('영상을 불러오지 못했어요.')), [folder.id])
  useEffect(() => folder.templateId === 'recipe'
    ? watchRecipeIngredients(folder.id, setIngredients, () => setLoadErr('재료를 불러오지 못했어요.'))
    : undefined, [folder.id, folder.templateId])

  useEffect(() => {
    if (titleCleanupStarted.current || folder.name !== MACHINE_LEARNING_FOLDER || !videos.length) return
    const updates = videos
      .map((video) => ({ id: video.id, title: cleanPersonalVideoTitle(video.title), previous: video.title }))
      .filter((video) => video.title && video.title !== video.previous)
      .map(({ id, title }) => ({ id, title }))
    if (!updates.length) return
    titleCleanupStarted.current = true
    void updatePersonalVideoTitles(folder.id, updates)
      .then(() => toast.show(`영상 제목 ${updates.length}개를 정리했어요`))
      .catch(() => {
        titleCleanupStarted.current = false
        toast.show('영상 제목을 정리하지 못했어요')
      })
  }, [folder.id, folder.name, toast, videos])

  const isRecipe = folder.templateId === 'recipe'
  const filterIngredients = ingredients.filter((i) => i.filterInVideo !== false)
  const visibleVideos = ingredientFilter === 'all'
    ? videos
    : videos.filter((video) => video.ingredientIds?.includes(ingredientFilter))

  useEffect(() => {
    if (ingredientFilter !== 'all' && !filterIngredients.some((ingredient) => ingredient.id === ingredientFilter)) {
      setIngredientFilter('all')
    }
  }, [ingredientFilter, filterIngredients])

  async function remove(video: PersonalVideo) {
    if (!confirm(`'${video.title}' 영상을 삭제할까요?`)) return
    try {
      await deletePersonalVideo(folder.id, video.id)
      toast.show('영상을 삭제했어요')
    } catch {
      toast.show('삭제하지 못했어요')
    }
  }
  async function finishFolderEdit() {
    const name = folderDraft.trim() || folder.name
    if (name !== folder.name || folderTagDraft !== (folder.tagId ?? '')) await videoFolderRepository.save({ ...folder, name, tagId: folderTagDraft })
    setEditingFolder(false)
  }
  async function removeFolder() { if (!confirm(VIDEO_FOLDER_CONFIG.labels.deleteConfirm(folder.name))) return; await videoFolderRepository.remove(folder); onBack() }

  return (
    <>
      <main className="scroll">
        <FolderDetailHeader className="rec-folder-bar" title={folder.name} editing={editingFolder} draft={folderDraft} editable onBack={onBack}
          onEdit={() => { setFolderDraft(folder.name); setFolderTagDraft(folder.tagId ?? ''); setEditingFolder(true) }} onDraftChange={setFolderDraft}
          onDone={() => void finishFolderEdit()} editActions={<FolderDeleteButton onClick={() => void removeFolder()} />} />
        {editingFolder && <FolderTagEditor tagId={folderTagDraft} onChange={setFolderTagDraft} />}
        {isRecipe && <div className="segmented recipe-sections" role="tablist" aria-label="레시피 폴더 메뉴">
          <button type="button" className={section === 'videos' ? 'on' : ''} onClick={() => setSection('videos')}>영상</button>
          <button type="button" className={section === 'ingredients' ? 'on' : ''} onClick={() => setSection('ingredients')}>재료 <span>{ingredients.length}</span></button>
        </div>}
        {loadErr && <div className="banner-err">{loadErr}</div>}
        {isRecipe && section === 'ingredients' ? (
          ingredients.length === 0 ? <div className="empty-state"><span className="ingredient-empty-icon">🥕</span><p>등록된 재료가 없어요.<br />아래 <b>+ 재료 추가</b>로 시작하세요.</p></div> :
            <div className="ingredient-cats">{INGREDIENT_CATEGORIES.map((cat) => {
              const items = ingredients.filter((i) => (i.category ?? '기타') === cat)
              if (!items.length) return null
              return <div key={cat} className="ingredient-cat-group">
                <div className="ingredient-cat-title">{cat}<span>{items.length}</span></div>
                <div className="ingredient-badges">{items.map((ing) => editingFolder
                  ? <button type="button" className={'ingredient-badge tappable editing' + (ing.filterInVideo === false ? ' nofilter' : '')} key={ing.id} onClick={() => setEditingIngredient(ing)}><Icon name="edit" className="ib-edit" />{ing.name}</button>
                  : <span className={'ingredient-badge' + (ing.filterInVideo === false ? ' nofilter' : '')} key={ing.id}>{ing.name}</span>)}</div>
              </div>
            })}</div>
        ) : videos.length === 0 && !loadErr ? (
          <div className="empty-state"><VideoIcon /><p>이 폴더에 영상이 없어요.<br />아래 <b>+ 영상 추가</b>로 유튜브 링크를 저장하세요.</p></div>
        ) : (
          <>
          {isRecipe && filterIngredients.length > 0 && <div className="recipe-filter" aria-label="재료별 영상 필터">
            <button type="button" className="chip" aria-pressed={ingredientFilter === 'all'} onClick={() => setIngredientFilter('all')}>전체 <span>{videos.length}</span></button>
            {filterIngredients.map((ingredient) => {
              const count = videos.filter((video) => video.ingredientIds?.includes(ingredient.id)).length
              return <button key={ingredient.id} type="button" className="chip" aria-pressed={ingredientFilter === ingredient.id} onClick={() => setIngredientFilter(ingredient.id)}>{ingredient.name} <span>{count}</span></button>
            })}
          </div>}
          {visibleVideos.length === 0 ? <div className="empty-state compact"><span className="ingredient-empty-icon">🥕</span><p>이 재료가 포함된 영상이 없어요.</p></div> : <div className="media-list personal-video-list">
            {visibleVideos.map((video) => (
              <MediaListRow key={video.id} thumbnail={video.thumbnail || thumbnailUrl(video.videoId)} title={video.title}
                subtitle={video.recipe || video.note} onOpen={() => setPlaying(video)}
                trailing={editingFolder
                  ? <button type="button" className="media-list-delete" onClick={() => void remove(video)} aria-label="영상 삭제">×</button>
                  : undefined} />
            ))}
          </div>}
          </>
        )}
      </main>
      {isRecipe && section === 'ingredients' ?
        <button className="fab" onClick={() => setAddingIngredient(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>재료 추가</button> :
        <button className="fab" onClick={() => setAdding(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>영상 추가</button>}
      {adding && <VideoForm folderId={folder.id} ingredients={ingredients} isRecipe={isRecipe} nextOrder={videos.length ? Math.max(...videos.map((v) => v.order)) + 1 : 0} onClose={() => setAdding(false)} />}
      {addingIngredient && <IngredientForm folderId={folder.id} editing={null} nextOrder={ingredients.length ? Math.max(...ingredients.map((v) => v.order)) + 1 : 0} toast={toast} onClose={() => setAddingIngredient(false)} />}
      {editingIngredient && <IngredientForm folderId={folder.id} editing={editingIngredient} nextOrder={editingIngredient.order} toast={toast} onClose={() => setEditingIngredient(null)} />}
      {playing && <VideoPlayer video={playing} ingredients={ingredients} onClose={() => setPlaying(null)} />}
    </>
  )
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
          const cleaned = cleanPersonalVideoTitle(meta.title)
          autoTitle.current = cleaned
          return cleaned
        })
        if (description) {
          if (isRecipe && !recipeEdited.current) setRecipe((current) => {
            if (current.trim() && current !== autoRecipe.current) return current
            autoRecipe.current = description
            return description
          })
          if (!isRecipe && !noteEdited.current) setNote((current) => {
            if (current.trim() && current !== autoNote.current) return current
            const compact = compactYouTubeDescription(description)
            autoNote.current = compact
            return compact
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
        title: cleanPersonalVideoTitle(title.trim() || meta.title) || '제목 없는 영상', thumbnail: meta.thumbnail || thumbnailUrl(videoId),
        note: isRecipe ? undefined : (noteEdited.current ? (note || undefined) : (note || compactYouTubeDescription(description) || undefined)),
        ingredientIds: isRecipe ? ingredientIds : undefined,
        recipe: isRecipe ? (recipeEdited.current ? (recipe || undefined) : (recipe || description || undefined)) : undefined,
        order: nextOrder, addedBy: member?.uid ?? '', createdAt: Date.now(),
      }
      await savePersonalVideo(video)
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? (e as { message?: string })?.message ?? ''
      setErr('영상을 저장하지 못했어요.' + (code ? ` (${code})` : ''))
      console.error('savePersonalVideo failed', e)
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

function IngredientForm({ folderId, editing, nextOrder, toast, onClose }: { folderId: string; editing: RecipeIngredient | null; nextOrder: number; toast: ToastState; onClose: () => void }) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  const [name, setName] = useState(editing?.name ?? '')
  const [category, setCategory] = useState(editing?.category ?? '기타')
  const [filterInVideo, setFilterInVideo] = useState(editing?.filterInVideo ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await saveRecipeIngredient({ id: editing?.id ?? newId(), folderId, name: name.trim(), category, filterInVideo, order: editing?.order ?? nextOrder, createdAt: editing?.createdAt ?? Date.now() })
      onClose()
    } catch { setErr('재료를 저장하지 못했어요.'); setBusy(false) }
  }
  async function doDelete() {
    if (!editing || busy) return
    if (!confirm(`'${editing.name}' 재료를 삭제할까요? 기존 레시피 선택에서도 사라져요.`)) return
    setBusy(true)
    try { await deleteRecipeIngredient(folderId, editing.id); toast.show('재료를 삭제했어요'); onClose() } catch { toast.show('삭제하지 못했어요'); setBusy(false) }
  }

  return <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="sheet" ref={sheetRef}>
    <div className="grab-zone" {...grabHandlers}><div className="grab" /></div><h2>{editing ? '재료 수정' : '재료 추가'}</h2>
    <div className="field"><label htmlFor="ingredient-name">재료 이름</label><input id="ingredient-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} placeholder="예) 양파, 올리브오일" maxLength={50} autoFocus /></div>
    <div className="field"><label>카테고리</label><div className="ingredient-cat-pick">{INGREDIENT_CATEGORIES.map((c) => <button key={c} type="button" className="cat-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div></div>
    <label className="ing-filter-toggle"><span>영상 필터에 표시</span><button type="button" role="switch" aria-checked={filterInVideo} className={'switch' + (filterInVideo ? ' on' : '')} onClick={() => setFilterInVideo((v) => !v)}><span className="switch-knob" /></button></label>
    {err && <p className="err small">{err}</p>}
    <div className="actions">
      {editing && <button className="btn danger" onClick={() => void doDelete()} disabled={busy}>삭제</button>}
      <button className="btn subtle grow" onClick={onClose} disabled={busy}>취소</button>
      <button className="btn primary" onClick={() => void submit()} disabled={!name.trim() || busy}>{busy ? '저장 중…' : (editing ? '저장' : '추가')}</button>
    </div>
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
    {video.note && <p className="muted recipe-copy">{compactYouTubeDescription(video.note)}</p>}<div className="actions"><button className="btn subtle block" onClick={onClose}>닫기</button></div>
  </div></div>
}

function VideoIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg> }
