import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        icons: [
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
