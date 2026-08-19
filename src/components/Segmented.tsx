/**
 * 공용 세그먼트 탭 컨트롤. 앱 전역에서 재사용 (일정 다가오는/지난, 설정 탭 등).
 * 선택 탭 스타일은 styles.css 의 .segmented 규칙 한 곳에서 관리되어 모든 사용처에 일괄 적용된다.
 */
export default function Segmented({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: { k: string; label: string; badge?: number }[]
  value: string
  onChange: (k: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div className={'segmented' + (className ? ' ' + className : '')} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.k}
          type="button"
          role="tab"
          aria-selected={value === t.k}
          className={value === t.k ? 'on' : ''}
          onClick={() => onChange(t.k)}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && <span className="seg-count">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}
