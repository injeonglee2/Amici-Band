import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * 가로 스크롤 줄(칩 목록 등)을 마우스로 잡아끌어 움직인다.
 *
 * 데스크톱에서는 휠이 세로로만 움직이고 스크롤바도 숨겨 둬서, 넘친 칩에 닿을 방법이 없다.
 * 터치는 브라우저 기본 스크롤이 이미 되므로 마우스·펜만 처리한다.
 */
const DRAG_THRESHOLD = 4 // 이만큼 움직여야 '끌기'로 보고, 그 전에는 평범한 클릭으로 둔다

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const drag = useRef({ down: false, moved: false, startX: 0, startLeft: 0 })

  function onPointerDown(e: ReactPointerEvent<T>) {
    const el = ref.current
    if (!el || e.pointerType === 'touch' || e.button !== 0) return
    if (el.scrollWidth <= el.clientWidth) return // 넘치지 않으면 끌 것도 없다
    drag.current = { down: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft }
  }

  function onPointerMove(e: ReactPointerEvent<T>) {
    const el = ref.current
    const state = drag.current
    if (!state.down || !el) return
    const dx = e.clientX - state.startX
    if (!state.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      state.moved = true
      el.setPointerCapture(e.pointerId) // 줄 밖으로 나가도 계속 따라오게
    }
    el.scrollLeft = state.startLeft - dx
  }

  function endDrag(e: ReactPointerEvent<T>) {
    const el = ref.current
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    drag.current.down = false
  }

  /** 끌고 난 뒤 이어지는 클릭은 칩 선택으로 치지 않는다 */
  function onClickCapture(e: ReactMouseEvent<T>) {
    if (!drag.current.moved) return
    e.preventDefault()
    e.stopPropagation()
    drag.current.moved = false
  }

  return {
    ref,
    className: 'drag-scroll',
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onClickCapture,
  }
}
