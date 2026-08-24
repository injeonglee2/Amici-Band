export interface SamsungHealthSyncLaunch {
  token: string
  uploadUrl: string
  folderId: string
  startTime: number
  endTime: number
}

export function isSamsungHealthSyncEnvironment(): boolean {
  return /Android/i.test(navigator.userAgent)
}

/** TWA에서 Amici Android 앱의 Samsung Health Data SDK 동기화 Activity를 연다. */
export function launchSamsungHealthSync({ token, uploadUrl, folderId, startTime, endTime }: SamsungHealthSyncLaunch): void {
  const params = new URLSearchParams({
    token,
    uploadUrl,
    folderId,
    startTime: String(startTime),
    endTime: String(endTime),
  })
  const fallback = new URL(window.location.href)
  fallback.searchParams.set('healthSync', 'app-update-required')
  const intent =
    `intent://samsung-health/sync?${params.toString()}` +
    `#Intent;scheme=amici;package=app.web.amicicalender.twa;` +
    `S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`
  window.location.assign(intent)
}
