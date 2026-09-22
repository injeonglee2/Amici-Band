import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const buildTime = new Date().toISOString()

// 서비스워커보다 먼저 서버의 최신 빌드 여부를 확인할 수 있는 작은 무캐시 파일이다.
function buildVersionAsset(): Plugin {
  return {
    name: 'amici-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, buildTime }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 앱 버전·빌드 시각을 코드에 주입 (배포 최신 여부 확인용)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  // preview_start(autoPort) 가 할당한 포트를 사용. 없으면 기본 5173.
  // Firebase Auth는 개발용 승인 도메인으로 localhost를 사용한다.
  // 127.0.0.1로 열면 auth/unauthorized-domain이 발생할 수 있으므로
  // Vite가 브라우저에 안내하는 주소도 localhost로 고정한다.
  server: {
    host: 'localhost',
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [
    react(),
    buildVersionAsset(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.tsx에서 즉시 등록·갱신을 제어하므로 자동 삽입 스크립트는 만들지 않는다.
      injectRegister: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
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
        // Android에 설치된 PWA도 시스템 공유 목록에서 유튜브 링크를 받을 수 있게 한다.
        share_target: {
          action: '/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
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
