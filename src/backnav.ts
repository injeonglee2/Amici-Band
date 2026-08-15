import { useEffect, useRef, useState } from 'react'

/**
 * 안드로이드(및 Play 스토어 TWA) 물리 뒤로가기 제어.
 *
 * 핵심(진단으로 확인한 이 TWA 의 동작): popstate 처리 '중'에 부른 pushState 는
 * 뒤로갈 수 있는(traversable) 히스토리 항목을 만들지 않는다. 그래서 뒤로가기 처리
 * 도중 항목을 다시 쌓는 방식은 한 단계만 지나면 다음 뒤로가기가 앱을 종료시킨다.
 *
 * 그래서 히스토리 항목은 '앞으로 이동'하는 시점 — 오버레이가 열릴 때(컴포넌트 마운트)·
 * 탭이 바뀔 때 — 에 미리 쌓는다. 이 시점은 popstate 밖이라 정상 traversable 하다.
 * 뒤로가기(popstate)는 그 항목을 pop 만 하고, 절대 새로 push 하지 않는다.
 *
 *   - 오버레이/탭이 열릴 때(useBackHandler 등록): pushMarker() → 히스토리 항목 1개
 *   - 뒤로가기: 맨 위 핸들러 실행(오버레이 닫기/탭 홈으로). push 안 함
 *   - 버튼(취소 등)·스와이프로 닫으면: 남은 항목을 cleanupMarker(history.back()) 로 정리
 *   - 홈 기본 상태: 마운트 때 쌓아둔 sentinel 을 pop → 종료 안내, 한 번 더 → 종료
 *
 * iOS: 시스템 뒤로가기 버튼이 없어 '종료' 부분은 트리거되지 않는다(무해). standalone
 * PWA 의 가장자리 스와이프-백이 popstate 를 쏘면 오버레이 닫기까지는 함께 동작한다.
 */

// ── 임시 진단 로그 (관리자에게만 표시). 원인 파악 후 제거 예정. ──
export const BACK_DEBUG = true
const LOG_KEY = 'amiciBackLog'
function dlog(tag: string) {
  if (!BACK_DEBUG) return
  try {
    const trap = (window.history.state as { amiciTrap?: boolean } | null)?.amiciTrap ? 1 : 0
    const line = `${tag} len=${window.history.length} trap=${trap} h=${handlers.length}`
    const buf: string[] = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    buf.push(line)
    while (buf.length > 16) buf.shift()
    localStorage.setItem(LOG_KEY, JSON.stringify(buf))
  } catch {
    /* noop */
  }
}
export function readBackLog(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
  } catch {
    return []
  }
}
export function clearBackLog() {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    /* noop */
  }
}

type Handler = { id: number; fn: () => void; consumed: boolean }

let handlers: Handler[] = []
let seq = 0
// 컨트롤러(useAndroidBack)가 설치되면 히스토리 조작 훅을 여기에 건다
let ctl: { pushMarker: () => void; cleanupMarker: () => void } | null = null

function registerBackHandler(fn: () => void): () => void {
  const id = ++seq
  const h: Handler = { id, fn, consumed: false }
  handlers.push(h)
  ctl?.pushMarker() // 열리는 시점(=앞으로 이동)에 traversable 한 히스토리 항목을 쌓는다
  dlog('reg')
  return () => {
    const idx = handlers.findIndex((x) => x.id === id)
    if (idx === -1) return
    handlers.splice(idx, 1)
    // 뒤로가기로 닫힌 게 아니면(버튼·스와이프) 남은 히스토리 항목을 정리한다
    if (!h.consumed) ctl?.cleanupMarker()
    dlog('unreg')
  }
}

/** 스택 맨 위 핸들러를 실행. 실행했으면 true(consumed 표시), 비어 있으면 false */
function runTopBackHandler(): boolean {
  const top = handlers[handlers.length - 1]
  if (!top) return false
  top.consumed = true
  top.fn()
  return true
}

/**
 * 오버레이가 열려 있는 동안 '뒤로가기 = 이 오버레이 닫기'로 등록한다.
 * 등록되는 순간(오버레이 열림/탭 전환)에 히스토리 항목이 하나 쌓인다.
 * 대개 오버레이 컴포넌트는 열릴 때만 마운트되므로 인자 없이 쓰면 되고,
 * 계속 떠 있는 화면(예: Main 의 탭 홈)에서 조건부로 켜려면 active 로 제어한다.
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
 * @param showExitToast 홈 기본 상태에서 첫 뒤로가기 때 종료 안내 토스트를 띄운다.
 */
const isTrapNow = () => !!(window.history.state as { amiciTrap?: boolean } | null)?.amiciTrap

export function useAndroidBack(showExitToast: () => void) {
  const [rearmGen, setRearmGen] = useState(0)
  const toastRef = useRef(showExitToast)
  toastRef.current = showExitToast

  // 종료 안내 창이 끝나면(rearmGen 증가) effect(=popstate 밖, traversable)에서 홈 sentinel 을
  // 다시 쌓아 다음 뒤로가기에 안내가 다시 뜨게 한다. 홈 idle(오버레이·탭 없음)이고 아직 덫 위가
  // 아닐 때만. 최초 sentinel 은 아래 컨트롤러가 마운트 때 쌓는다.
  useEffect(() => {
    if (rearmGen === 0) return
    if (handlers.length === 0 && !isTrapNow()) {
      window.history.pushState({ amiciTrap: true }, '')
      dlog('=rearm')
    }
  }, [rearmGen])

  useEffect(() => {
    let armed = false
    let armTimer: number | undefined
    let cleaning = 0 // cleanupMarker 가 부른 history.back() 의 popstate 를 걸러내기 위한 카운터
    const disarm = () => {
      armed = false
      if (armTimer !== undefined) {
        clearTimeout(armTimer)
        armTimer = undefined
      }
    }
    const pushMarker = () => window.history.pushState({ amiciTrap: true }, '')
    const cleanupMarker = () => {
      cleaning++
      window.history.back()
    }
    ctl = { pushMarker, cleanupMarker }

    if (!isTrapNow()) pushMarker() // 홈 종료 안내용 최초 sentinel (마운트 = popstate 밖이라 traversable)
    dlog('mount')

    const onPop = () => {
      if (cleaning > 0) {
        // 버튼 닫기 정리용 history.back() 이 쏜 popstate — 무시
        cleaning--
        dlog('=clean')
        return
      }
      dlog('POP')
      // 1) 닫을 오버레이/단계가 있으면 하나 실행. 항목은 이 뒤로가기가 이미 pop 했으므로 push 안 함.
      if (runTopBackHandler()) {
        disarm()
        dlog('=handled')
        return
      }
      // 2) 스택이 비었다 = 홈 기본 상태.
      if (armed) {
        // 안내가 떠 있는 동안의 두 번째 뒤로가기 → 남은 항목이 없어 시작점에 닿아 종료된다.
        disarm()
        dlog('=EXIT')
        return
      }
      // 첫 뒤로가기 → 종료 안내(sentinel 을 pop 한 상태라 앱은 살아 있음).
      toastRef.current()
      armed = true
      dlog('=arm')
      armTimer = window.setTimeout(() => {
        armed = false
        armTimer = undefined
        setRearmGen((g) => g + 1) // 창 종료 → effect 에서 sentinel 재생성(재-안내 가능)
      }, EXIT_WINDOW_MS)
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      ctl = null
      if (armTimer !== undefined) clearTimeout(armTimer)
    }
  }, [])
}
