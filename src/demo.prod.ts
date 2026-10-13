/**
 * 프로덕션 빌드에서 demo.ts 를 대신하는 빈 껍데기.
 *
 * demo.ts 는 `import.meta.env.DEV` 로 막혀 있어 배포본에서 실행되지는 않지만,
 * data.ts 가 정적으로 import 하는 탓에 샘플 데이터(곡·러닝 기록 등)가 번들에 그대로 실려 나갔다.
 * vite.config.ts 가 프로덕션 빌드에서만 이 파일로 바꿔치기해 데이터를 통째로 뺀다.
 *
 * DEMO 가 항상 false 이므로 아래 값들은 어디서도 실제로 쓰이지 않는다.
 * 혹시 가드가 빠진 경로가 생기면 조용히 잘못 동작하는 대신 바로 터지도록 demoDb 는 접근 시 예외를 던진다.
 */
import type { Band, Member } from './types'

export const DEMO = false

export const DEMO_MEMBER = {} as Member
export const DEMO_BAND = {} as Band
export const DEMO_PERSONAL = {} as Band
export const DEMO_CHANNELS: Band[] = []
export const demoScores = []

export function demoActiveWorkspace(): Band {
  throw new Error('demo 전용 코드가 배포본에서 호출됐습니다')
}

export function setDemoChannel(): void {
  throw new Error('demo 전용 코드가 배포본에서 호출됐습니다')
}

export const demoDb = new Proxy({} as Record<string, never>, {
  get(_target, key) {
    throw new Error(`demo 전용 코드가 배포본에서 호출됐습니다: demoDb.${String(key)}`)
  },
})
