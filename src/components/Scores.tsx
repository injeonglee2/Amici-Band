import type { ToastState } from './Toast'

/**
 * 악보 탭 — 재생목록의 곡에 파트별 악보(PDF/이미지)를 붙여 보는 갤러리.
 * (1단계: 자리만 잡아둔 플레이스홀더. 다음 단계에서 업로드·뷰어를 붙인다.)
 */
export default function ScoresView(_props: { toast: ToastState }) {
  return (
    <main className="scroll">
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M10.5 11v6.2" /><circle cx="9" cy="17.4" r="1.7" /></svg>
        <p>악보 기능을 준비하고 있어요.<br />곧 재생목록의 곡에 파트별 악보를 올릴 수 있어요.</p>
      </div>
    </main>
  )
}
