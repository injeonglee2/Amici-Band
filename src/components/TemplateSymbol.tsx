import { Icon } from '../icons'
import type { WorkspaceTemplate } from '../workspaceTemplates'

/**
 * 템플릿 심볼 — SVG 아이콘(symbolIcon)이 있으면 아이콘, 없으면 글자 심볼.
 * 헤더의 채널 종류, 계정 메뉴의 채널 목록, 온보딩·설정의 템플릿 카드가 같은 모양을 쓴다.
 * 글자 심볼(♫ ● ✓)과 어울리도록 아이콘은 테두리 없이 단색으로 채운다.
 */
export function TemplateSymbol({ template }: { template: WorkspaceTemplate }) {
  return template.symbolIcon
    ? <Icon name={template.symbolIcon} fill="currentColor" strokeWidth={1} aria-hidden />
    : <>{template.symbol}</>
}
