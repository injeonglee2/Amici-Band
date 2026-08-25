export type EventType = 'practice' | 'show' | 'flash' | 'meeting'

export const TYPE_META: Record<EventType, { label: string; color: string }> = {
  practice: { label: '합주', color: 'var(--c-practice)' },
  show: { label: '공연', color: 'var(--c-show)' },
  flash: { label: '번개', color: 'var(--c-flash)' },
  meeting: { label: '회의', color: 'var(--c-meeting)' },
}

/** 개인 채널의 사용자 정의 일정 유형(플래그). 밴드의 고정 TYPE_META 대체. 경로: bands/{bandId}/eventTypes/{id} */
export interface CustomEventType {
  id: string
  name: string
  emoji: string // 아이콘(이모지)
  color: string // 파스텔 hex
  order?: number
  createdBy?: string
  createdAt?: number
}

/** 개인 채널 일정 유형 색상 팔레트 (파스텔) */
export const PASTEL_PALETTE: { name: string; color: string }[] = [
  { name: 'Red', color: '#EF404A' },
  { name: 'Pink', color: '#F2728C' },
  { name: 'Yellow', color: '#FFD400' },
  { name: 'Green', color: '#80B463' },
  { name: 'Blue', color: '#27AAE1' },
  { name: 'Teal', color: '#4EB8B9' },
  { name: 'Purple', color: '#9E7EB9' },
  { name: 'Gray', color: '#A7A9AC' },
]

export interface BandEvent {
  id: string
  type: EventType
  title: string
  date: string // YYYY-MM-DD
  rehStart: string // HH:MM 합주 시작 (기본 18:00)
  rehEnd: string // HH:MM 합주 종료 (기본 22:00)
  placeId?: string // 설정에서 관리하는 장소 참조
  loc?: string // 레거시/직접입력 장소명 (placeId 없을 때 표시용)
  playlistId?: string // (공연 전용) 연결된 재생목록 — 공연 셋리스트를 재생목록으로 대신함
  note: string
  adminOnly?: boolean // 관리자 일정 목록·캘린더에만 표시
  createdBy: string
  createdAt: number
}

/** 장소 관리에서 관리하는 장소 (이름 + 주소 + 메모) */
export interface Place {
  id: string
  name: string // 장소 이름 (메인에 표시)
  address: string // 주소 (지도 검색으로 선택된 값 — 복사 버튼이 복사)
  lat?: number // 위도 (지도 검색 결과)
  lng?: number // 경도 (지도 검색 결과)
  memo?: string // 주차장·비밀번호 등 자유 메모 (선택)
  createdAt: number
}

/** 음악 재생목록 (폴더 개념) — 하단 네비의 '음악' 탭 */
export interface Playlist {
  id: string
  name: string // 재생목록 이름
  showAdder?: boolean // 곡 추가한 사람 이름 표시 여부 (기본: 표시)
  createdBy: string
  createdAt: number
}

/** 재생목록 안의 곡 (유튜브 링크로 추가) — playlists/{id}/tracks/{trackId} */
export interface Track {
  id: string
  url: string // 원본 유튜브 링크
  videoId: string // 유튜브 영상 ID (임베드·썸네일용)
  title: string // 곡 제목 (링크에서 자동 입력, 수정 가능)
  artist: string // 가수/아티스트 (링크에서 자동 입력, 수정 가능)
  thumbnail?: string // 썸네일 URL
  order?: number // 재생목록 내 정렬 순서 (작을수록 위. 기본값은 addedAt)
  addedBy: string // 추가한 사람 uid
  addedByName?: string // 추가한 사람 이름 스냅샷 (표시용)
  addedAt: number
  /**
   * 이 곡의 파트별 참여자.  uid → 그 곡에서 맡은 파트.
   * 기본값은 참여자 프로필(members/{uid}.part)의 파트지만, 곡마다 다른 파트로 바꿀 수 있다.
   * 이름은 저장하지 않고 멤버 명단과 이어붙여(표시 시점에) 항상 최신으로 보여준다.
   */
  participants?: Record<string, TrackPart>
}

/**
 * 일정에 등록한 합주곡 — events/{eventId}/setlist/{songId}
 *
 * 원본 곡(playlists/{playlistId}/tracks/{trackId})을 참조만 하고, 제목·썸네일 등
 * 표시용 값은 스냅샷으로 복사해 둔다(원본이 지워져도 목록은 남기기 위함).
 * 반면 파트 참여자는 스냅샷하지 않고 원본 곡에서 최신 값을 읽어 보여준다.
 */
export interface SetlistSong {
  id: string // = 원본 곡 id(trackId). 같은 곡을 두 번 담지 않도록 문서 id로 사용
  playlistId: string // 원본 재생목록 id
  playlistName: string // 재생목록 이름 스냅샷 (어느 목록에서 가져온 곡인지 표시)
  title: string
  artist: string
  videoId?: string
  thumbnail?: string
  order: number // 합주 순서 (작을수록 위)
  addedBy: string
  addedAt: number
}

/** 합주 녹음/영상 기록 — recordings/{id}. 링크(유튜브·드라이브 등)로 저장한다(파일 업로드 아님) */
export interface Recording {
  id: string
  title: string // 제목
  date: string // 일자 YYYY-MM-DD
  url: string // 원본 링크 (유튜브/구글 드라이브 등)
  videoId?: string // 유튜브면 임베드·썸네일용 영상 ID
  thumbnail?: string // 썸네일 URL (유튜브 자동)
  note?: string // 메모 (선택)
  eventId?: string // 연결된 일정 id (선택) — 있으면 일자를 그 일정에서 가져온다
  eventTitle?: string // 연결된 일정 제목 스냅샷 (일정이 지워져도 맥락은 남기기 위함)
  playlistId?: string // 연결된 음악 재생목록 id (선택)
  playlistName?: string // 재생목록 이름 스냅샷
  trackId?: string // 연결된 곡 id (선택, 재생목록 안의 특정 곡)
  trackTitle?: string // 곡 제목 스냅샷
  trackArtist?: string // 곡 아티스트 스냅샷
  // 파트(악기/역할)별 참여 멤버 — 유튜브 설명글을 해석해 넣음. { 보컬: ['오남규'], 기타: ['박정환','서진석'], … }
  credits?: Record<string, string[]>
  addedBy: string
  addedByName?: string // 올린 사람 이름 스냅샷
  createdAt: number
  folderId?: string // 개인 기록 모듈의 사용자 지정 폴더 참조(밴드 기록에서는 사용하지 않음)
  order?: number // 폴더 안 직접 정렬 순서
}

/** 개인 기록 모듈에서 사용자가 만드는 영상 폴더 */
export interface RecordingFolder {
  id: string
  name: string
  templateId?: 'video' | 'recipe' | 'running'
  order?: number
  createdBy: string
  createdAt: number
  playlistIds?: string[] // 밴드 영상 이름 폴더에 연결된 유튜브 재생목록(수동/자동 동기화 대상)
  tagId?: string // 일정에서 만든 유형 태그(개인 채널 공용)
}

/** 러닝 중 한 시점의 세부 표본. 누적 거리나 속도가 있으면 실제 1km 구간을 계산할 수 있다. */
export interface RunningSample {
  timeMs?: number
  elapsedSec?: number
  distanceM?: number
  speedMps?: number
  hr?: number
  cadence?: number
  paceSec?: number
  [field: string]: unknown
}

/** 한 운동의 1km 구간(마지막 구간은 1km 미만일 수 있음). */
export interface RunningSplit {
  index: number
  distanceM: number
  durationSec: number
  paceSecPerKm: number
  avgHr?: number
  avgCadence?: number
  partial?: boolean
  startTimeMs?: number
  endTimeMs?: number
}

/**
 * 러닝 기록 엔트리 (개인 채널 '러닝' 폴더). 표준 필드는 아래처럼 저장하고,
 * 이전 동기화 데이터와의 호환을 위해 그 밖의 필드도 허용한다.
 * 경로: bands/{bandId}/recordFolders/{folderId}/entries/{id}
 */
export interface RunningEntry {
  id: string
  folderId: string
  source?: 'health-connect' | 'samsung-health' | 'apple-health' | string
  sourceId?: string
  date?: string
  startTime?: number
  endTime?: number
  distanceM?: number
  durationSec?: number
  avgHr?: number
  maxHr?: number
  avgCadence?: number
  maxCadence?: number
  calories?: number
  steps?: number
  splits?: RunningSplit[]
  samples?: RunningSample[]
  createdAt?: number
  [field: string]: unknown
}

/** 개인 영상 폴더 안의 유튜브 영상 */
export interface PersonalVideo {
  id: string
  folderId: string
  title: string
  url: string
  videoId: string
  thumbnail: string
  note?: string
  ingredientIds?: string[]
  recipe?: string
  order: number
  addedBy: string
  createdAt: number
}

/** 개인 기록 폴더 안의 이미지 묶음 또는 PDF 문서. */
export interface PersonalRecordEntry {
  id: string
  folderId: string
  title: string
  kind: 'pdf' | 'images'
  files: ScoreFile[]
  addedBy: string
  createdAt: number
}

/** 레시피 영상 폴더 안에서 여러 레시피가 함께 사용하는 재료 */
export interface RecipeIngredient {
  id: string
  folderId: string
  name: string
  category?: string // 육류·채소류 등 분류
  filterInVideo?: boolean // 영상 필터 칩으로 노출할지(미지정=노출)
  order: number
  createdAt: number
}

/** 레시피 재료 카테고리(고정 목록) */
export const INGREDIENT_CATEGORIES = ['육류', '해산물', '채소류', '과일', '곡물', '유제품', '양념', '기타'] as const

/** 버그 제보·개선 의견 — feedback/{id}. 작성은 로그인 멤버, 열람·관리는 관리자만 */
export interface Feedback {
  id: string
  type: 'bug' | 'idea' | 'etc' // 버그 / 개선 제안 / 기타
  text: string
  status: 'new' | 'done' // 새 제보 / 처리됨
  images?: { url: string; path: string }[] // 첨부 사진(선택, 여러 장) — url=표시용, path=삭제용
  appVersion?: string // 자동 첨부(버그 재현용)
  buildTime?: string
  userAgent?: string
  createdBy: string
  createdByName?: string
  createdAt: number
}

/** 악보 파일 하나 (Storage 업로드 결과) */
export interface ScoreFile {
  url: string // 다운로드 URL
  path: string // Storage 경로 (삭제용)
  name?: string // 원본 파일명
  size?: number // 바이트 (저장 용량 계량용). 이전 업로드분은 없을 수 있음
}

/**
 * 악보 — 재생목록의 곡(Track)에 붙는 파트별 악보. scores/{id}
 * 한 곡·한 파트에 여러 개 등록 가능(문서 하나 = 악보 하나). PDF 1개 또는 이미지 여러 장.
 */
export interface Score {
  id: string
  trackId: string // 원본 곡 id
  playlistId: string // 원본 재생목록 id
  songTitle: string // 곡 제목 스냅샷
  songArtist?: string // 아티스트 스냅샷
  thumbnail?: string // 곡 썸네일 스냅샷
  part: TrackPart // 파트(고정 5 + 커스텀 라벨)
  title: string // 악보 제목 (예: 풀스코어·1절·코드)
  kind: 'pdf' | 'images'
  files: ScoreFile[] // 순서대로
  addedBy: string
  addedByName?: string
  createdAt: number
}

/** 밴드 (bands/{bandId}) — 멀티밴드. AMICI 는 unlimited=true 로 인원 캡 면제 */
export interface Band {
  id: string
  name: string
  ownerUid: string
  unlimited?: boolean
  memberCount?: number
  createdAt?: number
  storageBytes?: number // 누적 저장 용량(악보 등) — 계량용
  aiUsage?: { month: string; count: number } // 월별 AI 호출 수(YYYY-MM) — 계량용
  templateId?: import('./workspaceTemplates').WorkspaceTemplateId // 없으면 기존 밴드 템플릿
}

export type AttendStatus = 'present' | 'late' | 'leave' | 'absent' | 'undecided'

export const STATUS_META: Record<AttendStatus, { label: string; color: string }> = {
  present: { label: '참석', color: 'var(--ok)' },
  late: { label: '늦참', color: 'var(--warn)' },
  leave: { label: '조퇴', color: 'var(--info)' },
  absent: { label: '불참', color: 'var(--no)' },
  undecided: { label: '미정', color: 'var(--undecided)' },
}

export interface Attendance {
  uid: string
  name: string // 실명 스냅샷
  status: AttendStatus
  arriveTime?: string // 늦참 도착 시각 (합주 시간 내)
  leaveTime?: string // 조퇴 시각 (합주 시간 내)
  note?: string // 사유·한마디 (선택)
  updatedAt: number
}

export type Part = 'drum' | 'bass' | 'guitar' | 'keyboard' | 'vocal'

/**
 * 곡별 참여자가 그 곡에서 "표시"할 파트 값.
 * 고정 파트(Part) 중 하나이거나, 사용자가 직접 입력한 임의 라벨(예: '코러스', '퍼커션', 'MC').
 * 어디까지나 곡별 표시용이며, 사용자 프로필의 part 는 바뀌지 않는다.
 */
export type TrackPart = Part | (string & {})

/** 값이 고정 파트인지 여부 (아니면 임의 라벨) */
export function isFixedPart(v: string | undefined): v is Part {
  return v === 'drum' || v === 'bass' || v === 'guitar' || v === 'keyboard' || v === 'vocal'
}

export const PART_ORDER: Part[] = ['drum', 'bass', 'guitar', 'keyboard', 'vocal']

export const PART_META: Record<Part, { label: string }> = {
  drum: { label: '드럼' },
  bass: { label: '베이스' },
  guitar: { label: '기타' },
  keyboard: { label: '건반' },
  vocal: { label: '보컬' },
}

export interface Member {
  uid: string
  email: string
  name: string // 실명 3글자
  part?: Part // 담당 파트
  photoURL?: string
  fcmTokens?: string[] // 푸시 알림용 기기 토큰들 (기기별로 누적)
  webPushSubscriptions?: WebPushSubscription[] // iPhone PWA 등 표준 Web Push 구독
  admin?: boolean // 관리자 권한 (투표 요청 등). 콘솔에서만 부여 — 스스로 설정 불가
  createdAt: number
}

export interface WebPushSubscription {
  endpoint: string
  expirationTime?: number | null
  keys: {
    auth: string
    p256dh: string
  }
}

export const DEFAULT_REH_START = '18:00'
export const DEFAULT_REH_END = '22:00'
