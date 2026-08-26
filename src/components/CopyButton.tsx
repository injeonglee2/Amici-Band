import { copyText } from '../clipboard'

export function CopyButton({ text, onCopied }: { text: string; onCopied?: () => void }) {
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label="장소 복사"
      title="장소 복사"
      onClick={(e) => {
        e.stopPropagation()
        copyText(text, onCopied)
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    </button>
  )
}
