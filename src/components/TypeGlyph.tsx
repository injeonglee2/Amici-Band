import type { EventType } from '../types'
import { EventIcon } from '../eventIcons'
import { eventTypeIcon } from '../workspaceTemplates'

/** 일정 유형별 워터마크 글리프 (라인아트, --k 색으로 틴트됨). 템플릿이 아이콘을 바꾼 유형(친구 채널)은 그 아이콘을 쓴다. */
export function TypeGlyph({ type, className }: { type: EventType; className?: string }) {
  const templateIcon = eventTypeIcon(type)
  if (templateIcon) return <EventIcon id={templateIcon} className={className} />
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (type) {
    case 'practice': // 음표
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )
    case 'show': // 마이크
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 17v4" />
          <path d="M8 21h8" />
        </svg>
      )
    case 'flash': // 번개
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      )
    case 'meeting': // 회의 (대화)
      return (
        <svg {...common}>
          <path d="M13 8a2 2 0 0 1-2 2H6l-3 3V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2Z" />
          <path d="M17 9h2a2 2 0 0 1 2 2v9l-3-3h-4a2 2 0 0 1-2-2v-.5" />
        </svg>
      )
    case 'other': // 기타는 아이콘 없이 글자만 (칩·일정 카드 모두)
      return null
  }
}
