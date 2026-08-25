import type { SamsungHealthSyncLaunch } from './samsungHealth'

export function isAppleHealthSyncEnvironment(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** iOS Amici 셸이 가로채 HealthKit 권한 화면과 동기화를 시작하는 URL. */
export function launchAppleHealthSync({ token, uploadUrl, folderId, startTime, endTime }: SamsungHealthSyncLaunch): void {
  const params = new URLSearchParams({
    token,
    uploadUrl,
    folderId,
    startTime: String(startTime),
    endTime: String(endTime),
  })
  window.location.assign(`amici://apple-health/sync?${params.toString()}`)
}
