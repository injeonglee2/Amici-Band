import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  // 앱 버전·빌드 시각을 코드에 주입 (배포 최신 여부 확인용)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // preview_start(autoPort) 가 할당한 포트를 사용. 없으면 기본 5173.
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5173 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        id: '/',
        name: 'Amici Band 일정',
        short_name: 'Amici',
        description: '밴드 동호회 일정 · 참석 투표',
        lang: 'ko',
        theme_color: '#0a0a12',
        // 스플래시 배경 = 로고 코너와 동일한 검정으로 이음새 없이.
        // 라이트 모드 확장 시: 밝은 배경 + 투명/라이트 로고 변형이 필요 (manifest는 단일값이라 그때 교체)
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        related_applications: [
          {
            platform: 'play',
            id: 'app.web.amicicalender.twa',
            url: 'https://play.google.com/store/apps/details?id=app.web.amicicalender.twa',
          },
        ],
        prefer_related_applications: false,
        icons: [
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
