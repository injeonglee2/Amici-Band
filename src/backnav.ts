import { useEffect, useRef } from 'react'

/**
 * 안드로이드(및 Play 스토어 TWA) 물리 뒤로가기 제어.
 *
 * 열린 오버레이(시트·모달·다이얼로그)마다 자기 '닫기' 함수를 스택에 등록하고,
 * 뒤로가기가 오면 스택 맨 위(가장 최근에 연 것)부터 하나씩 닫는다.
 * 스택이 비면 = 홈 기본 상태 → 첫 뒤로가기는 종료 안내 토스트만 띄우고,
 * 안내가 떠 있는 동안 한 번 더 누르면 앱이 종료된다.
 *
 * 종료는 JS 로 창을 닫는 게 아니라(그럴 수 없다), 히스토리 '덫(trap)' 항목을 다시
 * 쌓지 않아서 다음 물리 뒤로가기가 히스토리 시작점에 닿게 만들어 TWA/브라우저가
 * 스스로 액티비티를 닫게 하는 방식이다.
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
 * 물리 뒤로가기 라우팅 + '한 번 더 눌러 종료'를 설치한다.
 * @param onExitPrompt 홈에서 첫 뒤로가기 때 부를 콜백(종료 안내 토스트 노출용)
 */
export function useAndroidBack(onExitPrompt: () => void) {
  const promptRef = useRef(onExitPrompt)
  promptRef.current = onExitPrompt
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
    // 종료 대기 중 오버레이가 새로 열리면 덫을 다시 쌓아, 그 뒤로가기가
    // 앱을 닫는 대신 오버레이를 닫게 한다.
    onRegister = () => {
      if (armed) {
        disarm()
        trap()
      }
    }

    const onPop = () => {
      // 1) 닫을 오버레이/단계가 있으면 하나 닫고 덫 복구
      if (runTopBackHandler()) {
        disarm()
        trap()
        return
      }
      // 2) 스택이 비었다 = 홈 기본 상태.
      //    이미 안내가 떠 있으면(armed) 여기서 다시 쌓지 않는다 → 다음 물리 뒤로가기가
      //    히스토리 시작점에 닿아 TWA 가 종료. 아직 안내 전이면 안내를 띄우고 무장한다.
      if (armed) return
      promptRef.current()
      armed = true
      armTimer = window.setTimeout(() => {
        armed = false
        armTimer = undefined
        trap() // 시간이 지나면 다시 덫을 쌓아 실수 종료를 막는다
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
