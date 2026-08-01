// 카카오맵 JavaScript SDK 로더 (services 라이브러리 — 장소/주소 검색용)
// 키는 .env.local 의 VITE_KAKAO_JS_KEY. 없으면 검색은 목업으로 대체(mapsearch.ts).
const KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined

type KakaoNS = typeof window & { kakao?: any }

let loadPromise: Promise<any> | null = null

export function kakaoAvailable(): boolean {
  return !!KEY
}

/** SDK를 한 번만 로드하고 kakao 객체를 반환. 키 없으면 reject. */
export function loadKakao(): Promise<any> {
  if (!KEY) return Promise.reject(new Error('NO_KEY'))
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const w = window as KakaoNS
    if (w.kakao?.maps?.services) return resolve(w.kakao)
    const s = document.createElement('script')
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&libraries=services&autoload=false`
    s.async = true
    s.onload = () => w.kakao.maps.load(() => resolve(w.kakao))
    s.onerror = () => reject(new Error('LOAD_FAIL'))
    document.head.appendChild(s)
  })
  return loadPromise
}
