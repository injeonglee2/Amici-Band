import { useEffect } from 'react'
import { workspaceThemeStyle, type WorkspaceTemplate } from './workspaceTemplates'

/** 로그인·온보딩·메인에서 동일한 템플릿 토큰을 문서 전체에 적용한다. */
export function useWorkspaceTheme(template: WorkspaceTemplate): void {
  useEffect(() => {
    const root = document.documentElement
    const style = workspaceThemeStyle(template) as Record<string, string>
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    root.dataset.template = template.id
    for (const [key, value] of Object.entries(style)) root.style.setProperty(key, value)
    themeMeta?.setAttribute('content', template.theme.background)
    return () => {
      delete root.dataset.template
      for (const key of Object.keys(style)) root.style.removeProperty(key)
    }
  }, [template])
}
