import { useBackHandler } from '../backnav'

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
  // 열려 있는 동안 뒤로가기 = 취소(닫기). 어떤 화면에서 띄운 다이얼로그든 가장 위에서 먼저 닫힌다.
  useBackHandler(onCancel)
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
