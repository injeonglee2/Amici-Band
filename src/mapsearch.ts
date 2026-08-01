// 장소 검색 추상화: 카카오 키가 있으면 실제 검색, 키 없으면 목업 검색.
import { kakaoAvailable, loadKakao } from './kakao'

export interface PlaceHit {
  name: string // 장소명
  address: string // 도로명(없으면 지번) 주소
  lat?: number
  lng?: number
}

/** 키 미설정·데모 환경에서 UX를 시험할 수 있는 목업 데이터 */
const MOCK: PlaceHit[] = [
  { name: '영화동 합주실', address: '경기도 수원시 장안구 영화동 424-16', lat: 37.293, lng: 127.008 },
  { name: '메챠카말레온', address: '서울 마포구 어울마당로 45', lat: 37.552, lng: 126.921 },
  { name: '홍대 사운드리 스튜디오', address: '서울 마포구 와우산로 29길 12', lat: 37.554, lng: 126.923 },
  { name: '강남 뮤직스페이스', address: '서울 강남구 강남대로 102길 34', lat: 37.503, lng: 127.026 },
  { name: '수원역 합주실', address: '경기도 수원시 팔달구 덕영대로 924', lat: 37.266, lng: 126.999 },
]

export function isMockSearch(): boolean {
  return !kakaoAvailable()
}

/** 키워드로 장소 검색. 실패·무결과 시 빈 배열. */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim()
  if (!q) return []

  if (isMockSearch()) {
    return MOCK.filter((h) => h.name.includes(q) || h.address.includes(q))
  }

  const kakao = await loadKakao()
  return new Promise((resolve) => {
    const ps = new kakao.maps.services.Places()
    ps.keywordSearch(q, (data: any[], status: string) => {
      if (status === kakao.maps.services.Status.OK) {
        resolve(
          data.slice(0, 12).map((d) => ({
            name: d.place_name as string,
            address: (d.road_address_name || d.address_name) as string,
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
          })),
        )
      } else {
        resolve([]) // ZERO_RESULT / ERROR
      }
    })
  })
}
