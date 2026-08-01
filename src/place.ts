import type { BandEvent, Place } from './types'

export interface ResolvedPlace {
  name: string
  address: string // 없을 수 있음
  memo?: string // 주차장·비밀번호 등 (없을 수 있음)
}

/** 일정의 장소를 해석: placeId 우선(장소 관리), 없으면 레거시 loc 텍스트 */
export function resolvePlace(
  ev: Pick<BandEvent, 'placeId' | 'loc'>,
  places: Map<string, Place>,
): ResolvedPlace | null {
  if (ev.placeId) {
    const p = places.get(ev.placeId)
    if (p) return { name: p.name, address: p.address, memo: p.memo }
    return null // 삭제된 장소
  }
  if (ev.loc) return { name: ev.loc, address: '' } // 레거시 직접 입력 (주소 없음)
  return null
}

/** 복사 버튼이 복사할 값: 주소가 있으면 주소, 없으면 이름 */
export function copyValue(rp: ResolvedPlace): string {
  return rp.address || rp.name
}
