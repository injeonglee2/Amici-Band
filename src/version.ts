// 앱 버전 · 빌드 시각 (배포가 최신인지 확인용)
export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 예: "08-01 22:15" (빌드된 로컬 시각) */
export function buildStamp(): string {
  const d = new Date(BUILD_TIME)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 예: "v0.9.0 · 08-01 22:15" */
export function versionLabel(): string {
  return `v${APP_VERSION} · ${buildStamp()}`
}
