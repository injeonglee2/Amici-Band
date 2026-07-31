import { useCallback, useRef, useState } from 'react'

export interface ToastState {
  msg: string
  show: (m: string) => void
}

export function useToast(): ToastState {
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 1900)
  }, [])
  return { msg, show }
}

export default function Toast({ state }: { state: ToastState }) {
  return (
    <div className={'toast' + (state.msg ? ' show' : '')} role="status" aria-live="polite">
      {state.msg && (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          <span>{state.msg}</span>
        </>
      )}
    </div>
  )
}
