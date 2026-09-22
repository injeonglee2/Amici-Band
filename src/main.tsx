import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/static/pretendard.css'
import './index.css'
import App from './App.tsx'
import { APP_VERSION, BUILD_TIME } from './version'

const BUILD_CHECK_INTERVAL = 60 * 60 * 1000

// 접속 때마다 HTTP 캐시를 거치지 않고 서비스워커를 갱신한다. 새 워커가 제어권을
// 가져오면 열린 앱을 단 한 번 다시 열어 최신 셸을 실행한다.
const serviceWorkerRegistration = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  : null

if (serviceWorkerRegistration) {
  const controllerAtStart = navigator.serviceWorker.controller
  let reloadedForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controllerAtStart || reloadedForUpdate) return
    reloadedForUpdate = true
    window.location.reload()
  })
  void serviceWorkerRegistration.then((registration) => {
    const update = () => { void registration.update() }
    update()
    window.setInterval(update, BUILD_CHECK_INTERVAL)
  }).catch(() => {})
}

// 서비스워커 갱신 확인을 서버의 무캐시 빌드 정보로 한 번 더 깨운다.
// 네트워크가 없으면 마지막 정상 버전을 그대로 사용한다.
void fetch(`/version.json?build-check=${Date.now()}`, { cache: 'no-store' })
  .then((response) => response.ok ? response.json() as Promise<{ version?: string; buildTime?: string }> : null)
  .then((remote) => {
    if (remote && (remote.version !== APP_VERSION || remote.buildTime !== BUILD_TIME)) {
      void serviceWorkerRegistration?.then((registration) => registration.update())
    }
  })
  .catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
