import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * 바텀시트를 손잡이(grab)로 아래로 스와이프해서 닫는 제스처.
 * 마우스·터치 공용(Pointer 이벤트). 사용법:
 *   const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
 *   <div className="sheet" ref={sheetRef}>
 *     <div className="grab-zone" {...grabHandlers}><div className="grab" /></div>
 */
export function useSheetSwipe(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number } | null>(null)

  function onPointerDown(e: ReactPointerEvent) {
    const sheet = sheetRef.current
    if (!sheet) return
    drag.current = { startY: e.clientY }
    sheet.style.transition = 'none'
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent) {
    const sheet = sheetRef.current
    if (!sheet || !drag.current) return
    const dy = Math.max(0, e.clientY - drag.current.startY)
    sheet.style.transform = `translateY(${dy}px)`
    sheet.style.opacity = String(Math.max(0.35, 1 - dy / 420))
  }
  function onPointerUp(e: ReactPointerEvent) {
    const sheet = sheetRef.current
    if (!sheet || !drag.current) return
    const dy = Math.max(0, e.clientY - drag.current.startY)
    drag.current = null
    if (dy > 110) {
      // 충분히 내렸으면 → 아래로 밀어내고 닫기
      sheet.style.transition = 'transform 0.2s ease, opacity 0.2s ease'
      sheet.style.transform = `translateY(${sheet.offsetHeight}px)`
      sheet.style.opacity = '0'
      window.setTimeout(onClose, 180)
    } else {
      // 부족하면 → 제자리로 복귀
      sheet.style.transition = 'transform 0.22s cubic-bezier(0.2,0.8,0.2,1), opacity 0.22s'
      sheet.style.transform = ''
      sheet.style.opacity = ''
    }
  }

  const grabHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }
  return { sheetRef, grabHandlers }
}
