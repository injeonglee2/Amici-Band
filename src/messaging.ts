/**
 * 웹 푸시(FCM) 클라이언트.
 * - 알림 권한 요청 → 기기 토큰 발급 → members/{uid}.fcmTokens 에 저장(Cloud Function이 여기로 발송)
 * - 포그라운드(앱 열려있을 때) 수신은 onMessage 로 처리
 *
 * 필요한 콘솔 설정: Firebase → 프로젝트 설정 → 클라우드 메시징 → 웹 푸시 인증서(VAPID) 생성 후
 * .env.local 에 VITE_FB_VAPID_KEY 로 넣기. (docs/PUSH-SETUP.md 참고)
 */
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging'
import { fbApp, firebaseReady } from './firebase'
import { DEMO } from './demo'
import type { WebPushSubscription } from './types'

const VAPID_KEY = import.meta.env.VITE_FB_VAPID_KEY as string | undefined
// VAPID 공개 키는 브라우저에 전달되는 공개 정보이므로 소스에 포함해도 안전하다.
const WEB_PUSH_PUBLIC_KEY =
  (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined) ||
  'BPImtCxoKTFXDPvK0bckOE-ws4xRklDhb3mvpbz9OMn8f5iWAQoAv2keYw1zOjXBuGmwhGvO_8KJ3tWmX90_v_0'

let _messaging: Messaging | null = null

export function pushConfigured(): boolean {
  return fcmConfigured() || standardWebPushConfigured()
}

function fcmConfigured(): boolean {
  return !DEMO && firebaseReady && !!fbApp && !!VAPID_KEY && 'Notification' in window
}

function standardWebPushConfigured(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const isAppleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isHomeScreenApp =
    navigatorWithStandalone.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return (
    !DEMO &&
    isAppleMobile &&
    isHomeScreenApp &&
    !!WEB_PUSH_PUBLIC_KEY &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

async function getMsg(): Promise<Messaging | null> {
  if (!fcmConfigured() || !fbApp) return null
  if (!(await isSupported())) return null
  if (!_messaging) _messaging = getMessaging(fbApp)
  return _messaging
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** iPhone 홈 화면 PWA에서 사용할 표준 Push API 구독 */
export async function requestStandardWebPushSubscription(): Promise<WebPushSubscription | null> {
  if (!standardWebPushConfigured() || !WEB_PUSH_PUBLIC_KEY) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.register('/web-push-sw.js', {
    scope: '/web-push-scope/',
  })
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(WEB_PUSH_PUBLIC_KEY),
    }))
  return subscription.toJSON() as WebPushSubscription
}

export async function requestNotificationRegistrations(): Promise<{
  fcmToken: string | null
  webPushSubscription: WebPushSubscription | null
}> {
  const [fcmToken, webPushSubscription] = await Promise.all([
    requestPushToken().catch(() => null),
    requestStandardWebPushSubscription().catch(() => null),
  ])
  return { fcmToken, webPushSubscription }
}

/** 알림 권한 요청 + 토큰 발급. 성공 시 토큰 문자열, 실패/거부 시 null */
export async function requestPushToken(): Promise<string | null> {
  const messaging = await getMsg()
  if (!messaging || !VAPID_KEY) return null
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return null
  // serviceWorkerRegistration 을 넘기지 않으면 FCM 이 /firebase-messaging-sw.js 를
  // 별도 스코프(/firebase-cloud-messaging-push-scope)에 자동 등록 → PWA sw.js 와 충돌 없음
  const token = await getToken(messaging, { vapidKey: VAPID_KEY })
  return token || null
}

/**
 * 앱이 열려있을 때(포그라운드) 도착하는 알림도 시스템 알림(상단 알림바)으로 표시.
 * FCM은 포그라운드에선 자동으로 알림을 안 띄우므로 직접 서비스워커로 표시한다.
 */
export async function startForegroundNotifications(): Promise<void> {
  const messaging = await getMsg()
  if (!messaging) return
  onMessage(messaging, async (payload) => {
    const title = payload.notification?.title ?? '알림'
    const body = payload.notification?.body ?? ''
    const eventId = payload.data?.eventId
    const reg =
      (await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope')) ??
      (await navigator.serviceWorker.ready)
    reg?.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/badge.png',
      tag: eventId ? `event-${eventId}` : undefined,
      data: { url: eventId ? `/?event=${eventId}` : '/' },
    })
  })
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

/** 홈 화면에 설치된(standalone) 앱으로 실행 중인지 */
export function isStandaloneApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/** 모바일 OS 구분 — 알림 설정 경로 안내를 플랫폼에 맞게 보여주기 위함 */
export function mobileOS(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/** 아이폰(애플 모바일)인데 홈 화면 PWA로 설치되지 않아, 먼저 설치해야 알림을 켤 수 있는 상태 */
export function isApplePwaNeedsInstall(): boolean {
  return mobileOS() === 'ios' && !isStandaloneApp()
}

/**
 * 로그인 시 자동 등록(기본 켜기).
 * - 이미 허용됨: 프롬프트 없이 토큰만 갱신
 * - 아직 미결정: 최초 1회만 자동으로 권한 요청 (거부 후 매번 조르지 않도록 플래그)
 * - 거부/미지원: 아무것도 안 함 (설정에서 수동으로 다시 켤 수 있음)
 * 성공 시 토큰 반환.
 */
/**
 * 자동 권한 요청 버전. 이 값을 올리면 "한 번 물어봤음" 플래그가 초기화된 효과가 나서,
 * 아직 권한 미결정(default)인 사용자에게 다음 접속 때 딱 한 번 더 자동 요청한다.
 * (이미 '거부(denied)'한 사용자는 브라우저가 재요청을 막으므로 영향 없음 — 설정에서 직접 켜야 함)
 */
const PUSH_ASK_VERSION = '2'

export async function autoRegisterPush(): Promise<{
  fcmToken: string | null
  webPushSubscription: WebPushSubscription | null
} | null> {
  if (!pushConfigured()) return null
  const perm = notificationPermission()
  if (perm === 'granted') return requestNotificationRegistrations()
  if (perm !== 'default') return null
  try {
    // 저장된 버전이 현재 버전과 같을 때만 스킵 → 버전을 올리면 전원 한 번 더 요청
    if (localStorage.getItem('amici.pushAsked') === PUSH_ASK_VERSION) return null
    localStorage.setItem('amici.pushAsked', PUSH_ASK_VERSION)
  } catch {
    /* localStorage 불가 환경 무시 */
  }
  return requestNotificationRegistrations()
}
