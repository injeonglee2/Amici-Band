import { collection, doc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 현재 밴드 컨텍스트 (멀티밴드).
 *
 * 로그인 후 users/{uid}.bandId 로 해석해 setCurrentBand() 로 지정한다.
 * 밴드 데이터 경로는 모두 `bands/{현재밴드}/...` 로 격리된다.
 * (feedback 은 밴드가 아니라 앱 개발자에게 가는 전역 채널이라 여기서 다루지 않는다.)
 */
let currentBandId = ''

export function setCurrentBand(id: string): void {
  currentBandId = id || ''
}
export function getCurrentBand(): string {
  return currentBandId
}

function requireBand(): string {
  if (!currentBandId) throw new Error('밴드가 아직 설정되지 않았어요 (setCurrentBand 필요).')
  return currentBandId
}

/** 현재 밴드 하위 컬렉션 참조: bandCol('events') → bands/{현재밴드}/events */
export function bandCol(...segments: string[]) {
  return collection(db, 'bands', requireBand(), ...segments)
}

/** 현재 밴드 하위 문서 참조: bandDoc('events', id) → bands/{현재밴드}/events/{id} */
export function bandDoc(...segments: string[]) {
  return doc(db, 'bands', requireBand(), ...segments)
}

/** 현재 밴드의 Storage 경로 프리픽스: bandStoragePath('scores', id) → bands/{현재밴드}/scores/id */
export function bandStoragePath(...segments: string[]): string {
  return ['bands', requireBand(), ...segments].join('/')
}
