import type { CSSProperties } from 'react'

export type WorkspaceTemplateId = 'band' | 'study' | 'gathering' | 'personal'
export type WorkspaceNavId = 'music' | 'scores' | 'home' | 'recordings' | 'journal' | 'places'
export type WorkspaceNavSlot = 1 | 2 | 3 | 4 | 5

export interface WorkspaceTheme {
  accent: string
  accent2: string
  practice: string
  show: string
  flash: string
  meeting: string
  colorScheme: 'dark' | 'light'
  bodyBackground: string
  background: string
  surface: string
  surfaceSolid: string
  surface2: string
  surfaceActive: string
  controlBackground: string
  headerBackground: string
  navBackground: string
  border: string
  borderStrong: string
  ink: string
  inkSoft: string
  inkFaint: string
  heading: string
  onAccent: string
  shadow: string
  shadowLift: string
  ok: string
  warn: string
  info: string
  no: string
  undecided: string
}

export interface WorkspaceTemplate {
  id: WorkspaceTemplateId
  label: string
  description: string
  symbol: string
  memberNoun: string
  navigation: { id: WorkspaceNavId; label: string; slot: WorkspaceNavSlot }[]
  theme: WorkspaceTheme
}

const darkTheme = (accent: string, accent2: string, practice: string, show: string, flash: string, meeting: string): WorkspaceTheme => ({
  accent, accent2, practice, show, flash, meeting,
  colorScheme: 'dark',
  bodyBackground: 'radial-gradient(75% 45% at 85% -5%, rgba(123,104,238,.22), transparent 60%), radial-gradient(70% 45% at 0% 12%, rgba(255,125,186,.13), transparent 55%), #0a0a12',
  background: '#0a0a12', surface: 'rgba(255,255,255,.045)', surfaceSolid: '#15141f',
  surface2: 'rgba(255,255,255,.07)', surfaceActive: '#44424d', controlBackground: 'rgba(255,255,255,.05)',
  headerBackground: 'linear-gradient(180deg, rgba(10,10,18,.92), rgba(10,10,18,.58))',
  navBackground: 'linear-gradient(0deg, rgba(10,10,18,.97), rgba(10,10,18,.78))',
  border: 'rgba(255,255,255,.08)', borderStrong: 'rgba(255,255,255,.16)',
  ink: '#eceaf6', inkSoft: '#a6a1c4', inkFaint: '#6d6a8c', heading: '#ffffff', onAccent: '#0a0a12',
  shadow: '0 2px 8px rgba(0,0,0,.45), 0 20px 48px -24px rgba(0,0,0,.8)',
  shadowLift: '0 8px 20px rgba(0,0,0,.55), 0 30px 60px -20px rgba(0,0,0,.9)',
  ok: '#3de0a0', warn: '#ffd24d', info: '#ff9d3c', no: '#ff5b6b', undecided: '#b0b0b0',
})

/** 첨부된 Notion 개인 페이지 화면에서 추출한 개인 템플릿 전용 팔레트 */
export const PERSONAL_NOTION_PALETTE = {
  canvas: '#ffffff',
  panel: '#f9f8f7',
  selected: '#eeeceb',
  divider: '#e1dfdc',
  ink: '#2c2c2b',
  inkSoft: '#6f6e69',
  inkFaint: '#9b9a97',
  blue: '#2383e2',
  blueSoft: '#e5f2fc',
} as const

const notionPersonalTheme: WorkspaceTheme = {
  accent: PERSONAL_NOTION_PALETTE.blue, accent2: '#6b9bd2', practice: '#0f7b6c', show: '#9b51e0', flash: '#d9730d', meeting: '#337ea9',
  colorScheme: 'light',
  bodyBackground: PERSONAL_NOTION_PALETTE.panel, background: PERSONAL_NOTION_PALETTE.canvas,
  surface: PERSONAL_NOTION_PALETTE.canvas, surfaceSolid: PERSONAL_NOTION_PALETTE.canvas,
  surface2: PERSONAL_NOTION_PALETTE.panel, surfaceActive: PERSONAL_NOTION_PALETTE.selected,
  controlBackground: PERSONAL_NOTION_PALETTE.panel,
  headerBackground: 'rgba(255,255,255,.94)', navBackground: 'rgba(255,255,255,.97)',
  border: PERSONAL_NOTION_PALETTE.divider, borderStrong: '#cfcbc7',
  ink: PERSONAL_NOTION_PALETTE.ink, inkSoft: PERSONAL_NOTION_PALETTE.inkSoft,
  inkFaint: PERSONAL_NOTION_PALETTE.inkFaint, heading: PERSONAL_NOTION_PALETTE.ink, onAccent: '#ffffff',
  shadow: '0 1px 2px rgba(15,15,15,.06), 0 4px 12px rgba(15,15,15,.04)',
  shadowLift: '0 8px 24px rgba(15,15,15,.12)',
  ok: '#0f7b6c', warn: '#d9730d', info: '#337ea9', no: '#e03e3e', undecided: '#9b9a97',
}

/** 밴드를 제외한 템플릿은 개인 기본 테마를 상속하고 의미색만 교체한다. */
const personalBasedTheme = (overrides: Partial<WorkspaceTheme>): WorkspaceTheme => ({
  ...notionPersonalTheme,
  ...overrides,
})

export const WORKSPACE_TEMPLATES: Record<WorkspaceTemplateId, WorkspaceTemplate> = {
  band: {
    id: 'band', label: '밴드', symbol: '♫', memberNoun: '멤버',
    description: '음악, 악보, 합주 기록을 함께 관리해요.',
    navigation: [
      { id: 'music', label: '음악', slot: 1 }, { id: 'scores', label: '악보', slot: 2 },
      { id: 'home', label: '일정', slot: 3 }, { id: 'recordings', label: '영상', slot: 4 }, { id: 'places', label: '장소', slot: 5 },
    ],
    theme: darkTheme('#ff5da2', '#7b68ee', '#3cd0ff', '#fb708a', '#ffdf8a', '#6a68f5'),
  },
  study: {
    id: 'study', label: '스터디', symbol: 'A', memberNoun: '스터디원',
    description: '학습 일정과 모임 장소를 간결하게 관리해요.',
    navigation: [{ id: 'home', label: '일정', slot: 3 }, { id: 'places', label: '장소', slot: 4 }],
    theme: personalBasedTheme({ accent: '#3b82f6', accent2: '#22d3ee', practice: '#38bdf8', show: '#818cf8', flash: '#d97706', meeting: '#6366f1' }),
  },
  gathering: {
    id: 'gathering', label: '공동', symbol: '●', memberNoun: '멤버',
    description: '여러 멤버가 일정과 장소를 함께 관리해요.',
    navigation: [{ id: 'home', label: '일정', slot: 3 }, { id: 'places', label: '장소', slot: 4 }],
    theme: personalBasedTheme({ accent: '#16a34a', accent2: '#65a30d', practice: '#0f766e', show: '#16a34a', flash: '#d97706', meeting: '#0d9488' }),
  },
  personal: {
    id: 'personal', label: '개인', symbol: '✓', memberNoun: '사용자',
    description: '나만의 영상과 기록을 폴더별로 관리해요.',
    navigation: [{ id: 'recordings', label: '영상', slot: 2 }, { id: 'journal', label: '기록', slot: 4 }],
    theme: notionPersonalTheme,
  },
}

export function getWorkspaceTemplate(id?: string): WorkspaceTemplate {
  return WORKSPACE_TEMPLATES[id as WorkspaceTemplateId] ?? WORKSPACE_TEMPLATES.band
}

const ACTIVE_TEMPLATE_KEY = 'amici.activeWorkspaceTheme'

/** 새로고침 중에도 현재 채널의 테마를 복원하기 위한 최소 로컬 스냅샷. */
export function rememberWorkspaceTemplate(id?: string): void {
  const template = getWorkspaceTemplate(id)
  localStorage.setItem(ACTIVE_TEMPLATE_KEY, JSON.stringify({
    id: template.id,
    background: template.theme.background,
    bodyBackground: template.theme.bodyBackground,
    colorScheme: template.theme.colorScheme,
  }))
}

export function getRememberedWorkspaceTemplate(): WorkspaceTemplate {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_TEMPLATE_KEY) || '{}') as { id?: string }
    return getWorkspaceTemplate(saved.id)
  } catch {
    return getWorkspaceTemplate()
  }
}

const PREVIEW_KEY = 'amici.workspaceTemplatePreview'

export function getTemplatePreview(): WorkspaceTemplateId | null {
  const id = localStorage.getItem(PREVIEW_KEY)
  return id && id in WORKSPACE_TEMPLATES ? id as WorkspaceTemplateId : null
}

export function setTemplatePreview(id: WorkspaceTemplateId | null): void {
  if (id) localStorage.setItem(PREVIEW_KEY, id)
  else localStorage.removeItem(PREVIEW_KEY)
}

export function workspaceThemeStyle(template: WorkspaceTemplate): CSSProperties {
  const theme = template.theme
  return {
    '--color-scheme': theme.colorScheme,
    '--body-bg': theme.bodyBackground,
    '--bg': theme.background,
    '--surface': theme.surface,
    '--surface-solid': theme.surfaceSolid,
    '--surface-2': theme.surface2,
    '--surface-active': theme.surfaceActive,
    '--control-bg': theme.controlBackground,
    '--top-bg': theme.headerBackground,
    '--nav-bg': theme.navBackground,
    '--line': theme.border,
    '--line-strong': theme.borderStrong,
    '--glass-border': theme.border,
    '--ink': theme.ink,
    '--ink-soft': theme.inkSoft,
    '--ink-faint': theme.inkFaint,
    '--heading': theme.heading,
    '--on-accent': theme.onAccent,
    '--shadow': theme.shadow,
    '--shadow-lift': theme.shadowLift,
    '--ok': theme.ok,
    '--warn': theme.warn,
    '--info': theme.info,
    '--no': theme.no,
    '--undecided': theme.undecided,
    '--accent': theme.accent,
    '--accent-2': template.theme.accent2,
    '--c-practice': template.theme.practice,
    '--c-show': template.theme.show,
    '--c-flash': template.theme.flash,
    '--c-meeting': template.theme.meeting,
  } as CSSProperties
}
