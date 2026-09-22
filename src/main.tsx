import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import 'pretendard/dist/web/static/pretendard.css'
import './index.css'
import App from './App.tsx'
import { APP_VERSION, BUILD_TIME } from './version'

const BUILD_CHECK_INTERVAL = 60 * 60 * 1000

// 접속 직후 새 서비스워커를 확인하고, 열려 있는 동안에도 한 시간마다 갱신한다.
// autoUpdate와 skipWaiting이 새 워커가 준비되는 즉시 현재 앱을 최신 빌드로 전환한다.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const update = () => { void registration.update() }
    update()
    window.setInterval(update, BUILD_CHECK_INTERVAL)
  },
})

// 서비스워커 갱신 확인을 서버의 무캐시 빌드 정보로 한 번 더 깨운다.
// 네트워크가 없으면 마지막 정상 버전을 그대로 사용한다.
void fetch(`/version.json?build-check=${Date.now()}`, { cache: 'no-store' })
  .then((response) => response.ok ? response.json() as Promise<{ version?: string; buildTime?: string }> : null)
  .then((remote) => {
    if (remote && (remote.version !== APP_VERSION || remote.buildTime !== BUILD_TIME)) {
      void navigator.serviceWorker?.ready.then((registration) => registration.update())
    }
  })
  .catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
