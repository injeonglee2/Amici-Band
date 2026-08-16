// 구글 클라우드 번역 API v2 (제목 → 곡명 언어가 달라도 매칭하기 위한 번역용)
// 키는 유튜브와 동일: 전용 키(VITE_YOUTUBE_API_KEY) 우선, 없으면 Firebase 키로 폴백.
// 프로젝트에 Cloud Translation API 가 켜져 있어야 하고, 실패하면 조용히 '' 를 돌려준다.
const KEY =
  (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ||
  (import.meta.env.VITE_FB_API_KEY as string | undefined) ||
  ''

const cache = new Map<string, string>()

/** text 를 target('en'|'ko') 로 번역. 키 없음·오류 시 '' 반환(호출부에서 폴백) */
export async function translateText(text: string, target: 'en' | 'ko'): Promise<string> {
  const q = text.trim()
  if (!q || !KEY) return ''
  const ck = `${target}:${q}`
  const hit = cache.get(ck)
  if (hit !== undefined) return hit
  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, target, format: 'text' }),
    })
    if (!res.ok) {
      cache.set(ck, '')
      return ''
    }
    const j = await res.json()
    const out: string = j?.data?.translations?.[0]?.translatedText ?? ''
    cache.set(ck, out)
    return out
  } catch {
    return ''
  }
}
