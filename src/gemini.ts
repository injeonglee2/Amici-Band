// 유튜브 설명글을 해석해 '파트→멤버' 크레딧을 뽑아내는 Gemini 호출.
// 조직 정책상 API 키로는 Gemini 를 못 쓰므로 Firebase AI Logic(앱 인증, 키 불필요)을 쓴다.
// 형식을 고정하지 않고 LLM 이 해석하므로 표기·순서·구분자가 바뀌어도 대응된다. 실패 시 null.
import { getAI, getGenerativeModel, VertexAIBackend, type GenerativeModel } from 'firebase/ai'
import { fbApp } from './firebase'
import { bumpAiUsage } from './data'

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
