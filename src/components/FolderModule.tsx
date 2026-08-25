import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { useBackHandler } from '../backnav'
import { watchEventTypes } from '../data'
import type { CustomEventType } from '../types'
import { EventIcon } from '../eventIcons'
import { Icon } from '../icons'
import { useSheetSwipe } from './useSheetSwipe'

export interface FolderEntity {
  id: string
  name: string
  createdBy: string
  createdAt: number
  order?: number
  templateId?: string
  tagId?: string // 일정에서 만든 유형 태그(개인 채널 공용)
}

export interface FolderRepository<TFolder extends FolderEntity> {
  watch: (onItems: (items: TFolder[]) => void, onError: (error: Error) => void) => () => void
  create: (name: string, creatorUid: string, templateId?: string) => TFolder
  save: (folder: TFolder) => Promise<void>
  remove: (folder: TFolder) => Promise<void>
  playlistImport?: {
    templateIds: string[]
    resolveName: (url: string) => Promise<string>
    run: (folder: TFolder, url: string, onProgress: (message: string) => void) => Promise<{ added: number; skipped: number }>
    errorMessage?: (error: unknown) => string
  }
}

export interface FolderModuleConfig {
  labels: {
    folder: string
    empty: string
    add: string
    createTitle: string
    editTitle: string
    name: string
    placeholder: string
    deleteConfirm: (name: string) => string
  }
  emptyIcon?: ReactNode
  rowIcon?: (folder: FolderEntity) => ReactNode
  templates?: { id: string; label: string; description: string; symbol: string; preview?: ReactNode }[]
  reorderable?: boolean // 편집 모드에서 폴더 순서 변경 허용
}

export default function FolderModule<TFolder extends FolderEntity>({
  config,
  repository,
  renderDetail,
}: {
  config: FolderModuleConfig
  repository: FolderRepository<TFolder>
  renderDetail: (folder: TFolder, onBack: () => void) => ReactNode
}) {
  const [folders, setFolders] = useState<TFolder[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TFolder | 'new' | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [tags, setTags] = useState<CustomEventType[]>([])
  useEffect(() => watchEventTypes(setTags, () => {}), [])
  const tagMap = new Map(tags.map((t) => [t.id, t]))

  async function moveFolder(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= folders.length) return
    const next = folders.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setFolders(next) // 낙관적 갱신
    // 순서를 정규화해 바뀐 폴더만 저장
    await Promise.all(next.map((folder, i) => (folder.order === i ? null : repository.save({ ...folder, order: i }))).filter(Boolean) as Promise<void>[])
  }

  useEffect(
    () => repository.watch(setFolders, (error) => {
      const code = (error as { code?: string })?.code ?? ''
      setLoadErr(code === 'permission-denied'
        ? `${config.labels.folder}을 불러올 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.`
        : `${config.labels.folder}을 불러오지 못했어요.` + (code ? ` (${code})` : ''))
    }),
    [repository, config.labels.folder],
  )

  const open = folders.find((folder) => folder.id === openId) ?? null
  if (open) return renderDetail(open, () => setOpenId(null))

  return (
    <>
      <main className="scroll">
        {loadErr && <div className="banner-err">{loadErr}</div>}
        {config.reorderable && folders.length > 1 && (
          <div className="folder-list-head">
            <button type="button" className={'folder-edit-toggle' + (reorderMode ? ' on' : '')} onClick={() => setReorderMode((v) => !v)}>
              {reorderMode ? <><Icon name="check" className="fet-ico" />완료</> : <><Icon name="sort" className="fet-ico" />순서 편집</>}
            </button>
          </div>
        )}
        {folders.length === 0 && !loadErr ? (
          <div className="empty-state">
            {config.emptyIcon ?? <FolderIcon />}
            <p>{config.labels.empty}<br />아래 <b>+ {config.labels.add}</b>로 시작하세요.</p>
          </div>
        ) : (
          <div className="list playlist-list">
            {folders.map((folder, index) => reorderMode ? (
              <div key={folder.id} className="playlist-row reorder">
                <div className="playlist-ico" aria-hidden="true">{config.rowIcon?.(folder) ?? <FolderIcon />}</div>
                <div className="playlist-info">
                  <h3>{folder.name}</h3>
                  {folder.tagId && tagMap.get(folder.tagId) && (
                    <span className="folder-tag" style={{ ['--k' as string]: tagMap.get(folder.tagId)!.color }}>
                      <EventIcon id={tagMap.get(folder.tagId)!.emoji} className="type-ico" />{tagMap.get(folder.tagId)!.name}
                    </span>
                  )}
                </div>
                <div className="folder-reorder-btns">
                  <button type="button" aria-label="위로" disabled={index === 0} onClick={() => void moveFolder(index, -1)}><Icon name="chevron-up" /></button>
                  <button type="button" aria-label="아래로" disabled={index === folders.length - 1} onClick={() => void moveFolder(index, 1)}><Icon name="chevron-down" /></button>
                </div>
              </div>
            ) : (
              <button key={folder.id} className="playlist-row" onClick={() => setOpenId(folder.id)}>
                <div className="playlist-ico" aria-hidden="true">{config.rowIcon?.(folder) ?? <FolderIcon />}</div>
                <div className="playlist-info">
                  <h3>{folder.name}</h3>
                  {folder.tagId && tagMap.get(folder.tagId) && (
                    <span className="folder-tag" style={{ ['--k' as string]: tagMap.get(folder.tagId)!.color }}>
                      <EventIcon id={tagMap.get(folder.tagId)!.emoji} className="type-ico" />{tagMap.get(folder.tagId)!.name}
                    </span>
                  )}
                </div>
                <svg className="playlist-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setEditing('new')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {config.labels.add}
      </button>

      {editing && (
        <FolderForm
          config={config}
          repository={repository}
          editing={editing === 'new' ? null : editing}
          tags={tags}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export function FolderForm<TFolder extends FolderEntity>({
  config, repository, editing, onClose, tags: propTags,
}: {
  config: FolderModuleConfig
  repository: FolderRepository<TFolder>
  editing: TFolder | null
  onClose: () => void
  tags?: CustomEventType[]
}) {
  const { member } = useAuth()
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  useBackHandler(onClose)
  // 기존 폴더 수정(상세 화면)에서도 태그를 달 수 있도록, 넘겨받지 못하면 직접 구독한다.
  const [watchedTags, setWatchedTags] = useState<CustomEventType[]>([])
  useEffect(() => (propTags ? undefined : watchEventTypes(setWatchedTags, () => {})), [propTags])
  const tags = propTags ?? watchedTags
  const [name, setName] = useState(editing?.name ?? '')
  const [templateId, setTemplateId] = useState(editing?.templateId ?? config.templates?.[0]?.id)
  const [tagId, setTagId] = useState(editing?.tagId ?? '')
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [importProgress, setImportProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canImport = !editing && !!repository.playlistImport?.templateIds.includes(templateId ?? '')
  const selectedTemplate = config.templates?.find((t) => t.id === templateId)
  const valid = name.trim().length > 0 || (canImport && playlistUrl.trim().length > 0)
  const newFolderRef = useRef<TFolder | null>(null)

  async function onPlaylistUrlChange(value: string) {
    setPlaylistUrl(value)
    setErr('')
    if (!value.trim() || name.trim()) return
    try { setName(await repository.playlistImport!.resolveName(value)) } catch { /* 제출 시 정확한 오류 표시 */ }
  }

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setErr('')
    try {
      let finalName = name.trim()
      if (!finalName && canImport && playlistUrl.trim()) {
        setImportProgress('재생목록 정보를 확인하는 중…')
        finalName = await repository.playlistImport!.resolveName(playlistUrl)
        setName(finalName)
      }
      const base = editing
        ? { ...editing, name: finalName }
        : (newFolderRef.current ? { ...newFolderRef.current, name: finalName } : repository.create(finalName, member?.uid ?? '', templateId))
      const folder = { ...base, tagId } as TFolder
      if (!editing) newFolderRef.current = folder
      await repository.save(folder)
      if (!editing && canImport && playlistUrl.trim()) {
        setImportProgress('재생목록을 불러오는 중…')
        const result = await repository.playlistImport!.run(folder as TFolder, playlistUrl, setImportProgress)
        setImportProgress(`${result.added}개 영상을 가져왔어요.`)
      }
      onClose()
    } catch (error) {
      const code = (error as { code?: string })?.code ?? ''
      setErr(repository.playlistImport?.errorMessage?.(error)
        ?? (code === 'permission-denied' ? '저장 권한이 없어요.' : '저장에 실패했어요.' + (code ? ` (${code})` : '')))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing || busy || !confirm(config.labels.deleteConfirm(editing.name))) return
    setBusy(true)
    try {
      await repository.remove(editing)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}><div className="grab" /></div>
        <h2>{editing ? config.labels.editTitle : config.labels.createTitle}</h2>
        <div className="field">
          <label htmlFor="folder-name">{config.labels.name}</label>
          <input id="folder-name" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
            placeholder={config.labels.placeholder} maxLength={40} autoFocus />
        </div>
        {canImport && <div className="field">
          <label htmlFor="folder-playlist-url">유튜브 재생목록 링크 <span className="muted">(선택)</span></label>
          <input id="folder-playlist-url" value={playlistUrl} onChange={(e) => void onPlaylistUrlChange(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=…" inputMode="url" />
          <p className="hint">링크를 넣으면 재생목록 제목과 영상들을 새 폴더에 자동으로 가져와요.</p>
        </div>}
        {!editing && config.templates && (
          <div className="field">
            <label>폴더 템플릿</label>
            <div className="folder-template-grid">
              {config.templates.map((template) => (
                <button key={template.id} type="button" className={'folder-template-card' + (templateId === template.id ? ' on' : '')}
                  onClick={() => setTemplateId(template.id)} aria-pressed={templateId === template.id}>
                  <span>{template.symbol}</span><b>{template.label}</b><small>{template.description}</small>
                </button>
              ))}
            </div>
            {selectedTemplate?.preview && (
              <div className="folder-template-preview">
                <div className="ftp-label">미리보기</div>
                {selectedTemplate.preview}
              </div>
            )}
          </div>
        )}
        {tags.length > 0 && (
          <div className="field">
            <label>태그 <span className="muted">(선택 · 일정 유형)</span></label>
            <div className="ps-type-pick">
              <button type="button" className="ps-type-opt" aria-pressed={!tagId} onClick={() => setTagId('')}>태그 없음</button>
              {tags.map((t) => (
                <button key={t.id} type="button" className="ps-type-opt" aria-pressed={tagId === t.id} style={{ ['--k' as string]: t.color }} onClick={() => setTagId(t.id)}>
                  <EventIcon id={t.emoji} className="type-ico" />{t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {importProgress && <p className="hint">{importProgress}</p>}
        {err && <p className="err small">{err}</p>}
        <div className="actions">
          {editing && <button type="button" className="btn danger" onClick={() => void remove()} disabled={busy}>삭제</button>}
          <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>취소</button>
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
}
