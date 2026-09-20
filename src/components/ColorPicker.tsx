export default function ColorPicker({
  colors,
  value,
  onChange,
  ariaLabel = '색상 선택',
  className = '',
}: {
  colors: string[]
  value: string
  onChange: (color: string) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`color-picker${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-label={color}
          aria-checked={value === color}
          style={{ ['--swatch' as string]: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}
