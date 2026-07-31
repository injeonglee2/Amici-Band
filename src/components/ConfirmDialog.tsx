export default function ConfirmDialog({
  message,
  confirmLabel = '확인',
  cancelLabel = '닫기',
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="scrim confirm open" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-card" role="alertdialog" aria-label={message}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn subtle" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={'btn ' + (danger ? 'danger-solid' : 'primary')} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
