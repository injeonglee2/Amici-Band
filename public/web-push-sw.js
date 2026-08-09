self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Amici 알림'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/logo.png',
      badge: '/badge.png',
      tag: payload.eventId ? `event-${payload.eventId}` : undefined,
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client) {
          return client.navigate(targetUrl).then(() => client.focus())
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
