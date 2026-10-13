/**
 * 앱 설치(홈 화면 추가) 진입점.
 *
 * 브라우저는 설치 가능해진 순간 beforeinstallprompt 를 한 번만 던지고, 그 이벤트를
 * 붙잡아 둬야 나중에 사용자가 누를 때 네이티브 설치 창을 띄울 수 있다. React 가
 * 붙기 전에 이미 발생할 수 있어 모듈 최상단(=main.tsx 최초 import)에서 듣는다.
 *
 * 카카오톡 등에서 열리는 크롬 커스텀 탭에는 이 이벤트가 오지 않고 설치 메뉴도 없다.
 * 그때는 같은 주소를 크롬 정식 탭으로 다시 열어 그쪽에서 설치하게 한다.
 * 아이폰 사파리는 설치 API 자체가 없어 단계 안내만 보여준다.
 */
import { mobileOS } from './messaging'

const ANDROID_PACKAGE = 'app.web.amicicalender.twa'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type NavigatorWithRelatedApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<{ platform: string; id?: string }[]>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // 브라우저 기본 배너 대신 설정 화면의 행으로 유도한다
  deferred = e as InstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => { deferred = null; notify() })

/** 커스텀 탭에서 지금 주소를 크롬 정식 탭으로 여는 Android Intent URL. */
function chromeIntentUrl(): string {
  const target = location.host + location.pathname + '?install=1'
  return 'intent://' + target + '#Intent;scheme=https;package=com.android.chrome;end'
}

/** 크롬으로 다시 열려 설치하러 온 상태인지 — 설정 화면을 바로 펴 준다. */
export function arrivedToInstall(): boolean {
  return new URLSearchParams(location.search).has('install')
}

/** 설치 가능 상태가 바뀌면 알려준다(구독 해제 함수 반환). */
export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 누르면 네이티브 설치 창이 바로 뜨는 상태인지 */
export function canPromptInstall(): boolean {
  return deferred !== null
}

/** 같은 주소의 안드로이드 앱(TWA)이 이미 깔려 있는지 — 설치 행을 감출 때 쓴다. */
export async function isRelatedAppInstalled(): Promise<boolean> {
  const get = (navigator as NavigatorWithRelatedApps).getInstalledRelatedApps
  if (!get) return false
  try {
    const apps = await get.call(navigator)
    return apps.some((app) => app.platform === 'play' && app.id === ANDROID_PACKAGE)
  } catch {
    return false
  }
}

export type InstallResult = 'installed' | 'dismissed' | 'chrome' | 'ios' | 'none'

/** 설치 실행 — 네이티브 창 → 없으면 크롬으로 다시 열기 → 아이폰은 단계 안내. */
export async function runInstall(): Promise<InstallResult> {
  if (deferred) {
    const event = deferred
    deferred = null // prompt() 는 이벤트당 한 번만 쓸 수 있다
    notify()
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted' ? 'installed' : 'dismissed'
  }
  const os = mobileOS()
  if (os === 'ios') return 'ios'
  if (os === 'android') {
    location.href = chromeIntentUrl()
    return 'chrome'
  }
  return 'none'
}
