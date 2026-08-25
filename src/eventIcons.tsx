import type { ReactNode } from 'react'

/** 개인 채널 일정 유형 아이콘 — 밴드와 같은 라인(스트로크) 스타일. id 를 저장하고 색상으로 틴트한다. */
export interface EventIconItem {
  id: string
  k: string[] // 검색 키워드(한/영)
  paths: ReactNode
}

export const EVENT_ICONS: EventIconItem[] = [
  { id: 'activity', k: ['운동', '러닝', '달리기', '조깅', '건강', 'activity', 'run', 'health'], paths: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /> },
  { id: 'dumbbell', k: ['헬스', '운동', '웨이트', 'gym', 'workout'], paths: <><path d="M6.5 6.5 17.5 17.5" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" /></> },
  { id: 'heart', k: ['건강', '심장', '좋아요', 'heart', 'love'], paths: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" /> },
  { id: 'zap', k: ['번개', '에너지', '순간', 'zap', 'flash'], paths: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
  { id: 'book', k: ['공부', '책', '독서', 'study', 'book', 'read'], paths: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></> },
  { id: 'book-open', k: ['독서', '책', '공부', 'reading', 'book'], paths: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></> },
  { id: 'edit', k: ['메모', '작성', '공부', '연필', 'write', 'note', 'pencil'], paths: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></> },
  { id: 'monitor', k: ['컴퓨터', '작업', '코딩', 'computer', 'work', 'coding'], paths: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></> },
  { id: 'briefcase', k: ['일', '업무', '출근', 'work', 'job', 'business'], paths: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></> },
  { id: 'bar-chart', k: ['회의', '통계', '차트', 'meeting', 'chart', 'report'], paths: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></> },
  { id: 'calendar', k: ['일정', '약속', '캘린더', 'schedule', 'calendar'], paths: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { id: 'clock', k: ['시간', '알람', '마감', 'time', 'alarm', 'deadline'], paths: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: 'phone', k: ['전화', '통화', 'call', 'phone'], paths: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z" /> },
  { id: 'mail', k: ['메일', '편지', 'mail', 'email'], paths: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></> },
  { id: 'coffee', k: ['카페', '커피', '미팅', 'cafe', 'coffee'], paths: <><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" /></> },
  { id: 'gift', k: ['선물', '생일', '기념일', 'gift', 'birthday'], paths: <><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></> },
  { id: 'users', k: ['모임', '미팅', '사람', 'group', 'meeting'], paths: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></> },
  { id: 'message', k: ['대화', '수다', '회의', 'talk', 'chat'], paths: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-4-1L3 21l1.1-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /> },
  { id: 'music', k: ['음악', '노래', '합주', 'music', 'song', 'band'], paths: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></> },
  { id: 'film', k: ['영화', '극장', 'movie', 'film'], paths: <><rect x="2" y="2" width="20" height="20" rx="2" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></> },
  { id: 'camera', k: ['사진', '촬영', 'photo', 'camera'], paths: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></> },
  { id: 'headphones', k: ['음악', '팟캐스트', 'music', 'podcast'], paths: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></> },
  { id: 'map-pin', k: ['장소', '약속', '위치', 'place', 'location'], paths: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></> },
  { id: 'plane', k: ['여행', '비행기', '출장', 'travel', 'flight', 'trip'], paths: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8 5.3 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 4.8c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /> },
  { id: 'navigation', k: ['이동', '드라이브', '내비', 'drive', 'navigate'], paths: <polygon points="3 11 22 2 13 21 11 13 3 11" /> },
  { id: 'shopping-cart', k: ['쇼핑', '장보기', 'shopping', 'grocery'], paths: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></> },
  { id: 'home', k: ['집', '가정', 'home', 'house'], paths: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
  { id: 'heart-cross', k: ['병원', '진료', '약', 'hospital', 'health', 'clinic'], paths: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" /><path d="M12 9v6M9 12h6" /></> },
  { id: 'dollar', k: ['돈', '재정', '금융', 'money', 'finance'], paths: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
  { id: 'star', k: ['중요', '별', 'star', 'important'], paths: <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" /> },
  { id: 'sun', k: ['아침', '낮', 'morning', 'sun', 'day'], paths: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" /></> },
  { id: 'moon', k: ['밤', '야간', 'night', 'moon'], paths: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /> },
  { id: 'award', k: ['목표', '성취', '상', 'award', 'goal'], paths: <><circle cx="12" cy="8" r="6" /><path d="M15.5 12.6 17 22l-5-3-5 3 1.5-9.4" /></> },
  { id: 'target', k: ['목표', '타겟', 'target', 'goal'], paths: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></> },
  { id: 'compass', k: ['여행', '탐험', 'travel', 'explore'], paths: <><circle cx="12" cy="12" r="9" /><polygon points="16.2 7.8 13.4 13.4 7.8 16.2 10.6 10.6 16.2 7.8" /></> },
  { id: 'droplet', k: ['물', '건강', 'water', 'drink'], paths: <path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z" /> },
  { id: 'smile', k: ['기분', '휴식', 'mood', 'rest'], paths: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9" y2="9" /><line x1="15" y1="9" x2="15" y2="9" /></> },
  { id: 'bookmark', k: ['기본', '북마크', '핀', 'default', 'pin'], paths: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
]

export function EventIcon({ id, className }: { id?: string; className?: string }) {
  const item = EVENT_ICONS.find((i) => i.id === id) ?? EVENT_ICONS.find((i) => i.id === 'bookmark')
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {item?.paths}
    </svg>
  )
}

export function searchIcons(query: string): EventIconItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return EVENT_ICONS
  return EVENT_ICONS.filter((i) => i.id.includes(q) || i.k.some((kw) => kw.toLowerCase().includes(q)))
}
