import type { ReactNode } from 'react'

export default function FolderDetailHeader({
  title, editing = false, draft = title, editable = false, backLabel = '폴더 목록으로',
  className = '', viewActions, editActions, onBack, onEdit, onDraftChange, onDone,
  onSync, syncLabel = '동기화',
}: {
  title: string
  editing?: boolean
  draft?: string
  editable?: boolean
  backLabel?: string
  className?: string
  viewActions?: ReactNode
  editActions?: ReactNode
  onBack: () => void
  onEdit?: () => void
  onDraftChange?: (value: string) => void
  onDone?: () => void
  onSync?: () => void
  syncLabel?: string
}) {
  return (
    <div className={`detail-bar folder-detail-header${editing ? ' editing' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="detail-back" onClick={onBack} aria-label={backLabel}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      {editing ? (
        <input className="detail-title-input" value={draft} onChange={(e) => onDraftChange?.(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDone?.() } }} maxLength={40} autoFocus />
      ) : <h2 className="detail-title">{title}</h2>}
      {editing ? <>{editActions}<button type="button" className="edit-btn done" onClick={onDone} aria-label="편집 완료"><CheckIcon /></button></>
        : <>{viewActions}{onSync && <button type="button" className="edit-btn folder-sync-btn" onClick={onSync} aria-label={syncLabel} title={syncLabel}><SyncIcon /></button>}{editable && <button type="button" className="edit-btn" onClick={onEdit} aria-label="폴더 수정"><EditIcon /></button>}</>}
    </div>
  )
}

export function FolderDeleteButton({ onClick, label = '폴더 삭제' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="edit-btn danger-ico" onClick={onClick} aria-label={label}><TrashIcon /></button>
}

function EditIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> }
function TrashIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg> }
function SyncIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg> }
