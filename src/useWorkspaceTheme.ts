import { useEffect } from 'react'
import { setActiveWorkspaceTemplate, workspaceThemeStyle, type WorkspaceTemplate } from './workspaceTemplates'

/** 로그인·온보딩·메인에서 동일한 템플릿 토큰을 문서 전체에 적용한다. */
export function useWorkspaceTheme(template: WorkspaceTemplate): void {
  // 자식 컴포넌트가 첫 렌더부터 템플릿별 유형 라벨을 읽을 수 있도록 effect 이전에 동기 갱신한다(단순 대입이라 재렌더 영향 없음).
  setActiveWorkspaceTemplate(template)
  useEffect(() => {
    const root = document.documentElement
    const style = workspaceThemeStyle(template) as Record<string, string>
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    root.dataset.template = template.id
    root.dataset.scheme = template.theme.colorScheme // 라이트 테마 공용 보정 CSS(html[data-scheme='light'])의 기준
    for (const [key, value] of Object.entries(style)) root.style.setProperty(key, value)
    themeMeta?.setAttribute('content', template.theme.background)
    return () => {
      delete root.dataset.template
      delete root.dataset.scheme
      for (const key of Object.keys(style)) root.style.removeProperty(key)
    }
  }, [template])
}
