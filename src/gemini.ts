// 유튜브 설명글을 해석해 '파트→멤버' 크레딧을 뽑아내는 Gemini 호출.
// 조직 정책상 API 키로는 Gemini 를 못 쓰므로 Firebase AI Logic(앱 인증, 키 불필요)을 쓴다.
// 형식을 고정하지 않고 LLM 이 해석하므로 표기·순서·구분자가 바뀌어도 대응된다. 실패 시 null.
import { getAI, getGenerativeModel, VertexAIBackend, type GenerativeModel } from 'firebase/ai'
import { fbApp } from './firebase'
import { bumpAiUsage } from './data'
import { INGREDIENT_CATEGORIES } from './types'

// Vertex AI(현 Agent Platform) 백엔드 리전. 필요 시 'global' 등으로 조정.
const AI_LOCATION = 'us-central1'

const PROMPT =
  '다음은 밴드 합주/공연 영상 설명이다. 파트(악기·역할)별 참여 멤버 이름을 뽑아 JSON 객체 하나로만 답하라. ' +
  '키는 파트명(설명에 쓰인 한국어 그대로, 예: 보컬/기타/베이스/드럼/키보드), 값은 멤버 이름 문자열 배열. ' +
  '조회수·날짜·해시태그·URL 등 사람 이름이 아닌 것은 제외. 크레딧이 없으면 {}. 다른 말은 절대 붙이지 말 것.'

type Credits = Record<string, string[]>

let model: GenerativeModel | null | undefined
function getModel(): GenerativeModel | null {
  if (model !== undefined) return model
  try {
    model = fbApp
      ? getGenerativeModel(getAI(fbApp, { backend: new VertexAIBackend(AI_LOCATION) }), {
          // Vertex(us-central1)에서 동작 확인된 모델. (flash-lite/‘latest’ 별칭은 Vertex 미지원)
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        })
      : null
  } catch {
    model = null
  }
  return model
}

const cache = new Map<string, Credits>()

function normalize(obj: unknown): Credits {
  const out: Credits = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const part = k.trim()
    if (!part) continue
    const names = (Array.isArray(v) ? v : [v])
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0 && x.length <= 20)
    if (names.length) out[part] = names
  }
  return out
}

/** 설명글 → { 파트: [멤버…] }. 오류·크레딧 없음이면 null */
export async function parseCredits(description: string): Promise<Credits | null> {
  const desc = (description || '').trim()
  if (!desc) return null
  const hit = cache.get(desc)
  if (hit) return Object.keys(hit).length ? hit : null
  const m = getModel()
  if (!m) return null
  try {
    const result = await m.generateContent(`${PROMPT}\n\n${desc}`)
    bumpAiUsage() // 실제 API 호출 1건 계량 (캐시 미스에서만 여기 도달)
    const text = result.response.text()
    if (!text) return null
    const credits = normalize(JSON.parse(text))
    cache.set(desc, credits)
    return Object.keys(credits).length ? credits : null
  } catch {
    return null
  }
}

export interface DetectedIngredient {
  name: string
  category: string
}

const INGREDIENT_PROMPT =
  '다음은 요리 영상 설명 또는 레시피다. 실제 조리에 쓰이는 재료만 찾아 JSON 배열로만 답하라. ' +
  '각 항목은 {"name":"재료명","category":"분류"} 형식이다. 재료명에서는 수량, 단위, 손질법을 빼고 ' +
  '한국어의 일반적인 재료명으로 정리한다. 소금·물·식용유 같은 기본 재료도 명시되어 있으면 포함한다. ' +
  `분류는 ${INGREDIENT_CATEGORIES.join(', ')} 중 하나만 사용한다. 완성 음식명, 조리도구, 광고 상품, 해시태그는 제외한다. ` +
  '재료를 확실히 찾을 수 없으면 []. 다른 설명은 붙이지 말 것.'

const ingredientCache = new Map<string, DetectedIngredient[]>()

/** 요리 설명문에서 중복 없는 재료명과 카테고리를 추출한다. */
export async function parseRecipeIngredients(description: string): Promise<DetectedIngredient[]> {
  const desc = (description || '').trim()
  if (!desc) return []
  const cached = ingredientCache.get(desc)
  if (cached) return cached
  const m = getModel()
  if (!m) return []
  try {
    const result = await m.generateContent(`${INGREDIENT_PROMPT}\n\n${desc}`)
    bumpAiUsage()
    const parsed = JSON.parse(result.response.text() || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const output: DetectedIngredient[] = []
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const item = value as Record<string, unknown>
      const name = String(item.name ?? '').trim().slice(0, 50)
      const key = name.replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
      if (!name || seen.has(key)) continue
      seen.add(key)
      const requestedCategory = String(item.category ?? '')
      const category = INGREDIENT_CATEGORIES.includes(requestedCategory as typeof INGREDIENT_CATEGORIES[number]) ? requestedCategory : '기타'
      output.push({ name, category })
    }
    ingredientCache.set(desc, output)
    return output
  } catch {
    return []
  }
}
