import type { CSSProperties } from 'react'
import { TYPE_META, type EventType } from './types'
import type { IconName } from './icons'

export type WorkspaceTemplateId = 'band' | 'study' | 'gathering' | 'friends' | 'personal'
export type WorkspaceNavId = 'music' | 'scores' | 'home' | 'recordings' | 'journal' | 'places'
export type WorkspaceNavSlot = 1 | 2 | 3 | 4 | 5

/** 템플릿이 제공하는 일정 유형. 저장 값(id)은 밴드 EventType 을 그대로 쓰고 라벨·아이콘만 바꾼다. */
export interface WorkspaceEventType {
  id: EventType
  label: string
  icon?: string // eventIcons 의 EventIcon id. 없으면 밴드 TypeGlyph 아이콘
}

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
  sun: string // 달력 일요일 글자색
  sat: string // 달력 토요일 글자색
}

export interface WorkspaceTemplate {
  id: WorkspaceTemplateId
  label: string
  description: string
  symbol: string // 글자 심볼(SVG 아이콘이 없을 때)
  symbolIcon?: IconName // 있으면 글자 대신 공용 SVG 아이콘으로 그린다(친구 채널 네잎클로버)
  logo?: string // 템플릿 전용 로고 마크(투명 배경 PNG). 없으면 색상 모드에 따라 logo.png / logo-light.png
  memberNoun: string
  navigation: { id: WorkspaceNavId; label: string; slot: WorkspaceNavSlot }[]
  /** 일정 유형 목록(선택·필터 순서). 없으면 밴드 기본 TYPE_META 전체를 쓴다. */
  eventTypes?: WorkspaceEventType[]
  /** true 면 관리자 역할 없이 모든 멤버가 같은 권한을 갖는다(친구 채널): 일정·장소 편집, 멤버 내보내기, 초대 코드까지. */
  equalMembers?: boolean
  /** true 면 일정 폼에 종료일을 둬 여러 날 일정(여행 등)을 만들 수 있다(친구 채널). 표시는 모든 채널이 공통. */
  multiDayEvents?: boolean
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
  ink: '#eceaf6', inkSoft: '#a6a1c4', inkFaint: '#6d6a8c', heading: '#ffffff', onAccent: '#ffffff',
  shadow: '0 2px 8px rgba(0,0,0,.45), 0 20px 48px -24px rgba(0,0,0,.8)',
  shadowLift: '0 8px 20px rgba(0,0,0,.55), 0 30px 60px -20px rgba(0,0,0,.9)',
  ok: '#3de0a0', warn: '#ffd24d', info: '#ff9d3c', no: '#ff5b6b', undecided: '#b0b0b0',
  sun: '#ff8f8f', sat: '#8fb4ff',
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
  sun: '#d14343', sat: '#2f6fd0',
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
      { id: 'home', label: '일정', slot: 3 }, { id: 'recordings', label: '기록', slot: 4 }, { id: 'places', label: '장소', slot: 5 },
    ],
    theme: darkTheme('#ff5da2', '#7b68ee', '#38c4e8', '#fb708a', '#ffdf8a', '#9184e3'),
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
  friends: {
    id: 'friends', label: '친구', symbol: '☘', symbolIcon: 'clover', logo: '/logo-friends.png', memberNoun: '친구',
    description: '친구들과 약속을 잡고 참석 여부를 함께 모아요.',
    navigation: [{ id: 'home', label: '일정', slot: 3 }, { id: 'places', label: '장소', slot: 4 }],
    // 유형 id 는 밴드 EventType 을 재사용한다(참석 투표·캘린더·공유 흐름 공통). 라벨·아이콘만 친구 모임에 맞춘다.
    eventTypes: [
      { id: 'meeting', label: '모임', icon: 'users' },
      { id: 'flash', label: '번개', icon: 'zap' },
      { id: 'show', label: '여행', icon: 'plane' },
      { id: 'other', label: '기타' },
    ],
    equalMembers: true,
    multiDayEvents: true,
    // 사용자가 고른 팔레트: 세이지 #8B9A6E · 웜화이트 #F7F2EB · 베이지 #EAE2D6 · 연회색 #EEEEEE
    // 포인트는 세이지(그라데이션은 연한 세이지 → 세이지), 바탕은 웜화이트, 칩·시트 표면은 베이지, 선택·입력은 연회색.
    theme: personalBasedTheme({
      accent: '#8b9a6e', accent2: '#a8b58d', onAccent: '#ffffff',
      practice: '#4e8f8a', show: '#8e7cc3', flash: '#d9a441', meeting: '#6f8f3f',
      bodyBackground: '#eae2d6', background: '#f7f2eb',
      surface: '#f7f2eb', surfaceSolid: '#f7f2eb', surface2: '#eae2d6', surfaceActive: '#eeeeee', controlBackground: '#eeeeee',
      headerBackground: 'rgba(247, 242, 235, 0.94)', navBackground: 'rgba(247, 242, 235, 0.97)',
      border: '#e3dbcf', borderStrong: '#d6ccbf',
      ink: '#2e2f27', inkSoft: '#6b6c60', inkFaint: '#9a9b8f', heading: '#24251f',
      ok: '#5f8f3f', warn: '#c98a4b', info: '#8a7a5a', no: '#c0504d', undecided: '#9a9b8f',
    }),
  },
  personal: {
    id: 'personal', label: '개인', symbol: '✓', memberNoun: '사용자',
    description: '나만의 영상과 기록을 폴더별로 관리해요.',
    navigation: [{ id: 'recordings', label: '영상', slot: 2 }, { id: 'home', label: '일정', slot: 3 }, { id: 'journal', label: '기록', slot: 4 }],
    theme: notionPersonalTheme,
  },
}

export function getWorkspaceTemplate(id?: string): WorkspaceTemplate {
  return WORKSPACE_TEMPLATES[id as WorkspaceTemplateId] ?? WORKSPACE_TEMPLATES.band
}

/** 온보딩에서 직접 만들 수 있는 채널 종류(표시 순서). */
export const CREATABLE_TEMPLATE_IDS: WorkspaceTemplateId[] = ['personal', 'band', 'friends']

/** 템플릿 로고. 전용 로고(친구 채널의 세이지 마크)가 있으면 그것, 없으면 색상 모드에 따라 밝은 배경용 logo-light.png 또는 기본 logo.png. */
export function workspaceLogo(template: WorkspaceTemplate): string {
  return template.logo ?? (template.theme.colorScheme === 'light' ? '/logo-light.png' : '/logo.png')
}

// 화면 전체에 적용 중인 템플릿. useWorkspaceTheme 가 갱신하며, 훅을 쓸 수 없는 모듈(캘린더 내보내기·공유 문구)도 참조한다.
let activeWorkspaceTemplate: WorkspaceTemplate = WORKSPACE_TEMPLATES.band

export function setActiveWorkspaceTemplate(template: WorkspaceTemplate): void {
  activeWorkspaceTemplate = template
}
export function getActiveWorkspaceTemplate(): WorkspaceTemplate {
  return activeWorkspaceTemplate
}

/** 템플릿의 일정 유형 목록(색상 포함). 템플릿 전용 목록이 없으면 밴드 기본 전체. */
export function templateEventTypes(template: WorkspaceTemplate = activeWorkspaceTemplate): (WorkspaceEventType & { color: string })[] {
  const list = template.eventTypes ?? (Object.keys(TYPE_META) as EventType[]).map((id) => ({ id, label: TYPE_META[id].label }))
  return list.map((item) => ({ ...item, color: TYPE_META[item.id].color }))
}

/** 일정 유형 라벨 — 템플릿이 라벨을 바꾼 유형(친구 채널의 모임·여행 등)을 반영한다. */
export function eventTypeLabel(type: EventType, template: WorkspaceTemplate = activeWorkspaceTemplate): string {
  return template.eventTypes?.find((item) => item.id === type)?.label ?? TYPE_META[type].label
}

/** 템플릿이 유형에 지정한 EventIcon id (없으면 undefined → 밴드 글리프 사용) */
export function eventTypeIcon(type: EventType, template: WorkspaceTemplate = activeWorkspaceTemplate): string | undefined {
  return template.eventTypes?.find((item) => item.id === type)?.icon
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
  const light = theme.colorScheme === 'light'
  return {
    '--color-scheme': theme.colorScheme,
    // 색상 모드에서 파생되는 토큰 — 라이트는 평면·단색 선택, 다크는 글로우·틴트 선택. 템플릿이 따로 정하지 않는다.
    '--app-bg': light ? 'var(--bg)' : 'transparent',
    '--card-shadow': light ? '0 0 0 0 transparent' : 'var(--shadow)',
    '--shadow-sm': light ? '0 1px 2px rgba(15, 15, 15, 0.08)' : '0 1px 5px rgba(0, 0, 0, 0.4)',
    '--accent-shadow': light
      ? '0 4px 14px -4px color-mix(in srgb, var(--accent) 35%, transparent)'
      : '0 8px 24px -8px color-mix(in srgb, var(--accent) 55%, transparent)',
    '--glow-color': light ? 'transparent' : 'color-mix(in srgb, var(--accent) 45%, transparent)',
    '--scrim': light ? 'rgba(20, 20, 20, 0.38)' : 'rgba(4, 4, 10, 0.66)',
    '--on-status': light ? '#ffffff' : '#0a0a12',
    '--selected-fill-mix': light ? '100%' : '22%',
    '--selected-border-mix': light ? '100%' : '70%',
    '--selected-glow-mix': light ? '45%' : '100%',
    '--selected-icon-mix': light ? '0%' : '100%',
    '--sun': theme.sun,
    '--sat': theme.sat,
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
