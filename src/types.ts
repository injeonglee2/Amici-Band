export type EventType = 'practice' | 'show' | 'flash' | 'meeting'

export const TYPE_META: Record<EventType, { label: string; color: string }> = {
  practice: { label: '합주', color: 'var(--c-practice)' },
  show: { label: '공연', color: 'var(--c-show)' },
  flash: { label: '번개', color: 'var(--c-flash)' },
  meeting: { label: '회의', color: 'var(--c-meeting)' },
}

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

export type AttendStatus = 'present' | 'late' | 'leave' | 'absent'

export const STATUS_META: Record<AttendStatus, { label: string; color: string }> = {
  present: { label: '참석', color: 'var(--ok)' },
  late: { label: '늦참', color: 'var(--warn)' },
  leave: { label: '조퇴', color: 'var(--info)' },
  absent: { label: '불참', color: 'var(--no)' },
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
