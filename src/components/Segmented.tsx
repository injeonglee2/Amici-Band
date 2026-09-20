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
  semantics = 'tabs',
}: {
  tabs: { k: string; label: string; badge?: number }[]
  value: string
  onChange: (k: string) => void
  className?: string
  ariaLabel?: string
  /** 화면 전환은 tabs, 폼의 단일 선택은 single-select를 사용한다. */
  semantics?: 'tabs' | 'single-select'
}) {
  const isTabs = semantics === 'tabs'
  return (
    <div className={'segmented' + (className ? ' ' + className : '')} role={isTabs ? 'tablist' : 'radiogroup'} aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.k}
          type="button"
          role={isTabs ? 'tab' : 'radio'}
          {...(isTabs ? { 'aria-selected': value === t.k } : { 'aria-checked': value === t.k })}
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
