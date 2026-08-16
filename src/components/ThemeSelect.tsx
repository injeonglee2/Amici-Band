import { useState } from 'react'
import Sheet from './Sheet'
import { useBackHandler } from '../backnav'

export type SelectOption = { value: string; label: string }

/**
 * 앱 테마에 맞춘 셀렉트. native <select> 의 OS 팝업(흰색) 대신
 * 곡 고르기와 같은 바텀시트 목록으로 옵션을 고른다.
 */
export default function ThemeSelect({
  value,
  options,
  onChange,
  title,
  placeholder,
  variant,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  title?: string
  placeholder?: string
  variant?: 'pill'
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button
        type="button"
        className={'theme-select' + (variant === 'pill' ? ' pill' : '')}
        onClick={() => setOpen(true)}
      >
        <span className="theme-select-val">{current?.label ?? placeholder ?? ''}</span>
        <svg className="theme-select-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <SelectSheet
          title={title}
          value={value}
          options={options}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SelectSheet({
  title,
  value,
  options,
  onPick,
  onClose,
}: {
  title?: string
  value: string
  options: SelectOption[]
  onPick: (v: string) => void
  onClose: () => void
}) {
  useBackHandler(onClose)
  return (
    <Sheet onClose={onClose} className="tsel-sheet">
        {title && <h2>{title}</h2>}
        <ul className="tsel-list">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={'tsel-opt' + (o.value === value ? ' on' : '')}
                onClick={() => onPick(o.value)}
              >
                <span className="tsel-opt-label">{o.label}</span>
                {o.value === value && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </button>
            </li>
          ))}
        </ul>
    </Sheet>
  )
}
