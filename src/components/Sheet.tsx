import type { ReactNode } from 'react'
import { useSheetSwipe } from './useSheetSwipe'

/**
 * 공용 바텀시트 래퍼 — 배경 탭으로 닫기(scrim) + 손잡이 스와이프로 닫기(grab).
 * 화면 전체에서 재사용하는 시트 레이아웃을 한곳에 모아, 시트 구조 수정 시 범위를 줄인다.
 *
 * 사용:
 *   <Sheet onClose={onClose}> …내용… </Sheet>
 *   <Sheet onClose={onClose} className="tsel-sheet"> … </Sheet>
 *
 * 참고: 뒤로가기 동작은 화면마다 다르므로(내부 단계 → 목록 등) useBackHandler 는 호출부에 둔다.
 */
export default function Sheet({
  onClose,
  className,
  children,
}: {
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  return (
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'sheet' + (className ? ' ' + className : '')} ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>
        {children}
      </div>
    </div>
  )
}
