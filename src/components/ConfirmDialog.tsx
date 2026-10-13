import { useBackHandler } from '../backnav'

export default function ConfirmDialog({
  message,
  confirmLabel = '확인',
  cancelLabel = '닫기',
  confirmVariant = 'primary',
  emphasis = 'cancel',
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /**
   * 확인 버튼 모양.
   * - `primary` 기본 동작
   * - `danger-solid` 삭제처럼 되돌릴 수 없는 동작
   * - `danger` 이 동작을 부른 버튼이 이미 외곽선 danger 일 때 모양을 맞춘다
   */
  confirmVariant?: 'primary' | 'danger' | 'danger-solid'
  /**
   * 어느 버튼을 크게 두는지.
   * - `cancel` 기본. 되돌리기 쉬운 취소가 남는 폭을 차지한다
   * - `confirm` 저장·열기처럼 확인이 사실상 유일한 다음 동작일 때 확인을 크게 둔다
   */
  emphasis?: 'cancel' | 'confirm'
  onConfirm: () => void
  onCancel: () => void
}) {
  // 열려 있는 동안 뒤로가기 = 취소(닫기). 어떤 화면에서 띄운 다이얼로그든 가장 위에서 먼저 닫힌다.
  useBackHandler(onCancel)
  return (
    <div className="scrim confirm open" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-card" role="alertdialog" aria-label={message}>
        <p>{message}</p>
        <div className={'confirm-actions' + (emphasis === 'confirm' ? ' emphasis-confirm' : '')}>
          <button type="button" className="btn subtle" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={'btn ' + confirmVariant} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
