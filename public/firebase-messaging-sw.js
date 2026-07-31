/* FCM 백그라운드 메시지 처리용 서비스워커 (앱이 닫혀있을 때 알림 표시).
   PWA의 sw.js 와 별개 파일. Firebase 웹 config는 공개값이라 그대로 둬도 안전. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDcnZrE0pbkW2LI8fl6SqjQyip_FsrFb94',
  authDomain: 'amicicalender.firebaseapp.com',
  projectId: 'amicicalender',
  storageBucket: 'amicicalender.firebasestorage.app',
  messagingSenderId: '1096966954516',
  appId: '1:1096966954516:web:3eec9a08461ea0f0fd5101',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || '알림'
  const body = (payload.notification && payload.notification.body) || ''
  const eventId = (payload.data && payload.data.eventId) || ''
  self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    badge: '/badge.png',
    data: { url: eventId ? '/?event=' + eventId : '/' },
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
