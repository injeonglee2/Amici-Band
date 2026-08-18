import { collection, doc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 현재 밴드 컨텍스트.
 *
 * 1단계(멀티밴드 기반 도입)에서는 기존 밴드(AMICI) 하나로 **고정**한다.
 * 모든 밴드 데이터는 `bands/{BAND_ID}/...` 하위에 격리되며, 이후 단계에서
 * 이 상수는 "로그인 사용자가 속한 밴드"를 해석하는 컨텍스트로 대체된다.
 *
 * 주의: feedback(받은 의견)은 밴드가 아니라 앱 개발자에게 가는 전역 채널이라
 * 여기서 다루지 않고 최상위 `feedback/` 에 그대로 둔다.
 */
export const BAND_ID = 'amici'

/** 현재 밴드 하위 컬렉션 참조: bandCol('events') → bands/{BAND_ID}/events */
export function bandCol(...segments: string[]) {
  return collection(db, 'bands', BAND_ID, ...segments)
}

/** 현재 밴드 하위 문서 참조: bandDoc('events', id) → bands/{BAND_ID}/events/{id} */
export function bandDoc(...segments: string[]) {
  return doc(db, 'bands', BAND_ID, ...segments)
}

/** 현재 밴드의 Storage 경로 프리픽스: bandStoragePath('scores', id) → bands/{BAND_ID}/scores/id */
export function bandStoragePath(...segments: string[]): string {
  return ['bands', BAND_ID, ...segments].join('/')
}
