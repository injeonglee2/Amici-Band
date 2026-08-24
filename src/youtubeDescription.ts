const LONG_DESCRIPTION_CHARS = 600
const LONG_DESCRIPTION_LINES = 15

// 0:36, 00:36, 1:02:15. 시간은 1~2자, 분·초는 0~59만 타임스탬프로 인정한다.
const TIMESTAMP_LINE = /^\s*(?:[-*•·]​?\s*)?(?:\[|\()?((?:\d{1,3}:[0-5]\d)|(?:\d{1,2}:[0-5]\d:[0-5]\d))(?:\]|\))?(?=\s|[-–—|]|$)\s*(.*)$/

/**
 * 긴 YouTube 설명에서 챕터 타임스탬프 줄만 남긴다.
 * - 짧은 설명은 원문 유지
 * - 유효한 타임스탬프가 2개 미만이면 원문 유지(잘못된 삭제 방지)
 * - 같은 시간은 첫 줄만 유지
 */
export function compactYouTubeDescription(description: string): string {
  const normalized = description.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
  const isLong = normalized.length >= LONG_DESCRIPTION_CHARS || lines.length >= LONG_DESCRIPTION_LINES
  if (!isLong) return normalized

  const seen = new Set<string>()
  const chapters: string[] = []
  for (const line of lines) {
    const match = line.match(TIMESTAMP_LINE)
    if (!match || seen.has(match[1])) continue
    seen.add(match[1])
    const label = match[2].trim().replace(/^[-–—|]\s*/, '')
    chapters.push(label ? `${match[1]} ${label}` : match[1])
  }
  return chapters.length >= 2 ? chapters.join('\n') : normalized
}
