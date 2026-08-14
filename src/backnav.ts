import { useEffect, useRef } from 'react'

/**
 * 안드로이드(및 Play 스토어 TWA) 물리 뒤로가기 제어.
 *
 * 열린 오버레이(시트·모달·다이얼로그)마다 자기 '닫기' 함수를 스택에 등록하고,
 * 뒤로가기가 오면 스택 맨 위(가장 최근에 연 것)부터 하나씩 닫는다.
 * 스택이 비면 = 홈 기본 상태 → 첫 뒤로가기는 종료 안내 토스트만 띄우고,
 * 안내가 떠 있는 동안 한 번 더 누르면 앱이 종료된다.
 *
 * 핵심(TWA 동작): 뒤로가기(popstate) 처리 중 pushState 로 히스토리 항목을 '다시 쌓으면'
 * 그 뒤로가기로는 앱이 종료되지 않고 머무른다. 반대로 다시 쌓지 않으면 그 뒤로가기로
 * TWA 가 액티비티를 종료한다. 그래서:
 *   - 오버레이 닫기·홈 첫 뒤로가기 → trap() 을 다시 쌓아 '머무름'
 *   - 안내가 떠 있는 동안의 두 번째 뒤로가기 → 다시 쌓지 않아 '종료'
 * (JS 로 창을 직접 닫을 수는 없다. 종료는 오직 물리 뒤로가기가 히스토리를 벗어날 때 일어난다.)
 *
 * iOS: 시스템 뒤로가기 버튼이 없어 '종료' 부분은 트리거되지 않는다(무해).
 * standalone PWA 의 가장자리 스와이프-백이 popstate 를 쏘는 경우 오버레이 닫기까지는 함께 동작한다.
 */

type Handler = { id: number; fn: () => void }

let handlers: Handler[] = []
let seq = 0
// 종료 대기(덫이 빠진) 상태에서 새 오버레이가 열리면 컨트롤러가 덫을 다시 쌓도록 알린다
let onRegister: (() => void) | null = null

function registerBackHandler(fn: () => void): () => void {
  const id = ++seq
  handlers.push({ id, fn })
  onRegister?.()
  return () => {
    handlers = handlers.filter((h) => h.id !== id)
  }
}

/** 스택 맨 위 핸들러를 실행. 실행했으면 true, 비어 있으면 false */
function runTopBackHandler(): boolean {
  const top = handlers[handlers.length - 1]
  if (!top) return false
  top.fn()
  return true
}

/**
 * 오버레이가 열려 있는 동안 '뒤로가기 = 이 오버레이 닫기'로 등록한다.
 * 대개 오버레이 컴포넌트는 열릴 때만 마운트되므로 인자 없이 쓰면 되고,
 * 계속 떠 있는 화면(예: Main)에서 조건부로 켜려면 active 로 제어한다.
 */
export function useBackHandler(fn: () => void, active = true) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return
    return registerBackHandler(() => ref.current())
  }, [active])
}

/** 종료 안내가 떠 있는 동안 한 번 더 눌러야 종료되는 시간(ms). 토스트 노출 시간과 맞춘다. */
const EXIT_WINDOW_MS = 2000

/**
 * 앱 최상위(로그인 후 Main)에서 한 번만 호출.
 * 물리 뒤로가기 우선순위를 한곳에서 처리한다: 오버레이 닫기 → 탭(음악·장소) 홈으로 → 종료 안내.
 *
 * 탭→홈을 별도 useBackHandler 로 등록하지 않고 컨트롤러가 직접 부르는 이유:
 * 토글식(active) 등록은 환경에 따라 타이밍 이슈가 있을 수 있어, 루트 네비게이션은
 * 항상 존재하는 이 컨트롤러가 확정적으로 처리하는 편이 안전하다.
 *
 * @param opts.navigateHome 오버레이가 없을 때 호출. 홈이 아니면 홈으로 옮기고 true, 이미 홈이면 false.
 * @param opts.showExitToast 홈에서 첫 뒤로가기 때 종료 안내 토스트를 띄운다.
 */
export function useAndroidBack(opts: { navigateHome: () => boolean; showExitToast: () => void }) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  useEffect(() => {
    let armed = false
    let armTimer: number | undefined
    const isTrapped = () =>
      !!(window.history.state as { amiciTrap?: boolean } | null)?.amiciTrap
    // 덫 쌓기(중복 방지) — 이미 덫 위면 그대로 둔다. StrictMode 이중 마운트에도 안전.
    const trap = () => {
      if (!isTrapped()) window.history.pushState({ amiciTrap: true }, '')
    }
    const disarm = () => {
      armed = false
      if (armTimer !== undefined) {
        clearTimeout(armTimer)
        armTimer = undefined
      }
    }

    trap()
    // 종료 안내 중 오버레이가 새로 열리면 예약된 종료를 취소(계속 머무름).
    onRegister = () => {
      if (armed) {
        disarm()
        trap() // 이미 덫이 있으면 가드가 스킵
      }
    }

    const onPop = () => {
      // 1) 닫을 오버레이/단계가 있으면 하나 닫고, 덫을 다시 쌓아 이 뒤로가기로는 종료되지 않게 한다.
      if (runTopBackHandler()) {
        disarm()
        trap()
        return
      }
      // 2) 오버레이가 없으면 탭(음악·장소) → 홈. 홈으로 옮겼으면 머무른다.
      if (optsRef.current.navigateHome()) {
        disarm()
        trap()
        return
      }
      // 3) 홈 기본 상태.
      if (armed) {
        // 안내가 떠 있는 동안의 두 번째 뒤로가기 → 여기서는 덫을 다시 쌓지 않는다.
        //    (TWA 는 popstate 에서 push 가 없으면 이 뒤로가기로 액티비티를 종료한다.)
        disarm()
        return
      }
      // 첫 뒤로가기 → 종료 안내 + trap() 으로 이 뒤로가기 종료를 취소하고 머무른다.
      optsRef.current.showExitToast()
      armed = true
      trap()
      armTimer = window.setTimeout(() => {
        armed = false
        armTimer = undefined
      }, EXIT_WINDOW_MS)
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      onRegister = null
      if (armTimer !== undefined) clearTimeout(armTimer)
    }
  }, [])
}
