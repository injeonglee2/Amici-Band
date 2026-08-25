/** 태그/유형 색상 유틸 — 배경색 위에 올릴 글자색을 자동으로 고른다. */

/** 배경 hex 색 위에서 읽기 좋은 글자색(흰색 또는 진한 회색)을 반환한다. */
export function readableInk(hex: string): string {
  const c = (hex || '').trim().replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  if (full.length < 6) return '#2b2b2b'
  const toLin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const r = toLin(parseInt(full.slice(0, 2), 16) / 255)
  const g = toLin(parseInt(full.slice(2, 4), 16) / 255)
  const b = toLin(parseInt(full.slice(4, 6), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // 밝은 배경(노랑·회색 등)은 진한 글자, 어두운/채도 높은 배경은 흰 글자.
  return luminance > 0.4 ? '#2b2b2b' : '#ffffff'
}

/** 유형 색을 CSS 변수로 넘긴다: --k(테마색) + --k-ink(대비 글자색). */
export function typeVars(color?: string): Record<string, string> {
  if (!color) return {}
  return { '--k': color, '--k-ink': readableInk(color) }
}
