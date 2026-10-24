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

/** 장소명(키워드) 검색 — 등록된 업체·시설만 찾는다. */
function keywordSearch(kakao: any, q: string): Promise<PlaceHit[]> {
  return new Promise((resolve) => {
    const ps = new kakao.maps.services.Places()
    ps.keywordSearch(q, (data: any[], status: string) => {
      if (status !== kakao.maps.services.Status.OK) return resolve([]) // ZERO_RESULT / ERROR
      resolve(
        data.slice(0, 12).map((d) => ({
          name: d.place_name as string,
          address: (d.road_address_name || d.address_name) as string,
          lat: parseFloat(d.y),
          lng: parseFloat(d.x),
        })),
      )
    })
  })
}

/**
 * 도로명·지번 주소 검색 — 상호가 없는 주택·건물도 번지까지 입력하면 찾는다.
 * 번지가 없는 길·동 단위 결과(ROAD·REGION)는 좌표가 모호해 제외한다.
 */
function addressSearch(kakao: any, q: string): Promise<PlaceHit[]> {
  return new Promise((resolve) => {
    const geocoder = new kakao.maps.services.Geocoder()
    geocoder.addressSearch(q, (data: any[], status: string) => {
      if (status !== kakao.maps.services.Status.OK) return resolve([])
      resolve(
        data
          .filter((d) => d.address_type === 'ROAD_ADDR' || d.address_type === 'REGION_ADDR')
          .slice(0, 8)
          .map((d) => {
            const road = d.road_address?.address_name as string | undefined
            const lot = (d.address?.address_name || d.address_name) as string
            const building = (d.road_address?.building_name as string | undefined)?.trim()
            return {
              name: building || road || lot, // 건물명이 있으면 건물명, 없으면 주소 자체가 이름
              address: road || lot,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
            }
          }),
      )
    })
  })
}

/** 장소명과 주소를 함께 검색. 주소 결과를 앞에 두고 같은 좌표는 하나로 합친다. 실패·무결과 시 빈 배열. */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim()
  if (!q) return []

  if (isMockSearch()) {
    return MOCK.filter((h) => h.name.includes(q) || h.address.includes(q))
  }

  const kakao = await loadKakao()
  const [byAddress, byKeyword] = await Promise.all([addressSearch(kakao, q), keywordSearch(kakao, q)])
  const seen = new Set<string>()
  return [...byAddress, ...byKeyword].filter((hit) => {
    const key = hit.lat !== undefined && hit.lng !== undefined ? `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}` : hit.address
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
