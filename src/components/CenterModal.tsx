import type { ReactNode } from 'react'

/** 짧은 확인·현황 화면용 중앙 모달. 긴 탐색 화면에 사용하는 바텀시트와 역할을 구분한다. */
export default function CenterModal({ onClose, className, label = '팝업', children }: { onClose: () => void; className?: string; label?: string; children: ReactNode }) {
  return (
    <div className="scrim center-modal-scrim open" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className={'center-modal' + (className ? ` ${className}` : '')} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  )
}
