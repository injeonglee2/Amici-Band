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
