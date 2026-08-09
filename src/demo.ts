/**
 * 로그인 없이 UI를 테스트하기 위한 데모 모드.
 *
 * - `npm run dev` (개발 모드)에서 URL에 `?demo` 가 있을 때만 켜진다.
 *   예) http://localhost:5173/?demo
 * - `import.meta.env.DEV` 가드로 프로덕션 빌드(배포본·APK)에는 절대 포함되지 않는다.
 * - Firebase 를 전혀 건드리지 않고, 아래 인메모리 스토어가 실시간 구독을 흉내낸다.
 *   (새로고침하면 초기 데이터로 리셋됨)
 */
import type { Attendance, BandEvent, Member, Place, Playlist, Track } from './types'

export const DEMO =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('demo')

export const DEMO_MEMBER: Member = {
  uid: 'demo-user',
  email: 'demo@amici.band',
  name: '김데모',
  part: 'guitar',
  admin: true,
  createdAt: Date.now(),
}

const now = Date.now()

const initialMembers: Member[] = [
  { uid: 'demo-user', email: 'demo@amici.band', name: '김데모', part: 'guitar', createdAt: now },
  { uid: 'u2', email: '', name: '이기타', part: 'guitar', createdAt: now },
  { uid: 'u3', email: '', name: '박베이스', part: 'bass', createdAt: now },
  { uid: 'u4', email: '', name: '최드럼', part: 'drum', createdAt: now },
  { uid: 'u5', email: '', name: '정보컬', part: 'vocal', createdAt: now },
  { uid: 'u6', email: '', name: '강신스', part: 'keyboard', createdAt: now },
  { uid: 'u7', email: '', name: '윤건반', part: 'keyboard', createdAt: now },
]

const initialPlaces: Place[] = [
  { id: 'p1', name: '영화동 합주실', address: '경기도 수원시 장안구 영화동 424-16', memo: '주차: 건물 뒤편 공영주차장 (합주실 이름 대면 2시간 무료)\n현관 비밀번호: 1234*', createdAt: now },
  { id: 'p2', name: '메챠카말레온', address: '서울 마포구 어울마당로 45', createdAt: now },
]

const initialEvents: BandEvent[] = [
  { id: 'e1', type: 'flash', title: '메챠카말레온', date: '2026-07-29', rehStart: '21:00', rehEnd: '22:00', placeId: 'p2', note: '', createdBy: 'demo-user', createdAt: now },
  { id: 'e2', type: 'practice', title: '8월 1차 정기합주', date: '2026-08-01', rehStart: '18:30', rehEnd: '22:00', placeId: 'p1', note: '저녁을 먹거나 요기 하고 올 것', createdBy: 'demo-user', createdAt: now },
  { id: 'e3', type: 'show', title: '여름 정기공연', date: '2026-08-22', rehStart: '18:00', rehEnd: '22:00', placeId: 'p1', note: '', createdBy: 'other-user', createdAt: now },
  { id: 'e4', type: 'meeting', title: '신년 운영 회의', date: '2027-01-10', rehStart: '19:00', rehEnd: '21:00', placeId: 'p2', note: '올해 활동 계획 논의', createdBy: 'demo-user', createdAt: now },
]

const initialAttendance: Record<string, Attendance[]> = {
  e2: [
    { uid: 'demo-user', name: '김데모', status: 'present', updatedAt: now },
    { uid: 'u2', name: '이기타', status: 'present', updatedAt: now },
    { uid: 'u3', name: '박베이스', status: 'late', arriveTime: '19:00', note: '회사 회식 있어서 조금 늦어요', updatedAt: now },
    { uid: 'u4', name: '최드럼', status: 'leave', leaveTime: '21:00', updatedAt: now },
    { uid: 'u6', name: '강신스', status: 'present', updatedAt: now },
    { uid: 'u5', name: '정보컬', status: 'absent', note: '가족 행사라 이번엔 불참', updatedAt: now },
  ],
}

/* ---------------- 인메모리 실시간 스토어 ---------------- */
type Sub<T> = (v: T) => void

interface Collection<T> {
  watch(cb: Sub<T[]>): () => void
  upsert(item: T, idOf: (x: T) => string): void
  remove(id: string, idOf: (x: T) => string): void
}

function makeCollection<T>(initial: T[]): Collection<T> {
  let items = initial.map((x) => ({ ...x }))
  const subs = new Set<Sub<T[]>>()
  const emit = () => subs.forEach((f) => f(items.map((x) => ({ ...x }))))
  return {
    watch(cb) {
      subs.add(cb)
      cb(items.map((x) => ({ ...x })))
      return () => void subs.delete(cb)
    },
    upsert(item, idOf) {
      const i = items.findIndex((x) => idOf(x) === idOf(item))
      if (i >= 0) items[i] = { ...item }
      else items = [...items, { ...item }]
      emit()
    },
    remove(id, idOf) {
      items = items.filter((x) => idOf(x) !== id)
      emit()
    },
  }
}

const initialPlaylists: Playlist[] = [
  { id: 'pl1', name: '이번 공연 셋리스트', createdBy: 'demo-user', createdAt: now },
  { id: 'pl2', name: '연습하고 싶은 곡', createdBy: 'demo-user', createdAt: now - 1000 },
]

const initialTracks: Record<string, Track[]> = {
  pl1: [
    { id: 't1', url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', videoId: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg', order: now, addedBy: 'demo-user', addedByName: '김데모', addedAt: now },
    { id: 't2', url: 'https://www.youtube.com/watch?v=1w7OgIMMRc4', videoId: '1w7OgIMMRc4', title: 'Sweet Child O\' Mine', artist: "Guns N' Roses", thumbnail: 'https://img.youtube.com/vi/1w7OgIMMRc4/mqdefault.jpg', order: now + 1000, addedBy: 'demo-user', addedByName: '이기타', addedAt: now + 1000 },
  ],
}

const eventsCol = makeCollection<BandEvent>(initialEvents)
const placesCol = makeCollection<Place>(initialPlaces)
const membersCol = makeCollection<Member>(initialMembers)
const playlistsCol = makeCollection<Playlist>(initialPlaylists)

// 참석은 이벤트별 컬렉션
const attendanceCols = new Map<string, Collection<Attendance>>()
function attendanceCol(eventId: string): Collection<Attendance> {
  let col = attendanceCols.get(eventId)
  if (!col) {
    col = makeCollection<Attendance>(initialAttendance[eventId] ?? [])
    attendanceCols.set(eventId, col)
  }
  return col
}

// 재생목록별 곡 컬렉션 (참석 컬렉션과 동일한 패턴)
const trackCols = new Map<string, Collection<Track>>()
function trackCol(playlistId: string): Collection<Track> {
  let col = trackCols.get(playlistId)
  if (!col) {
    col = makeCollection<Track>(initialTracks[playlistId] ?? [])
    trackCols.set(playlistId, col)
  }
  return col
}

export const demoDb = {
  watchMembers: (cb: Sub<Member[]>) => membersCol.watch(cb),
  watchEvents: (cb: Sub<BandEvent[]>) => eventsCol.watch(cb),
  saveEvent: (ev: BandEvent) => eventsCol.upsert(ev, (x) => x.id),
  deleteEvent: (id: string) => eventsCol.remove(id, (x) => x.id),

  watchPlaces: (cb: Sub<Place[]>) => {
    return placesCol.watch((list) => cb([...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'))))
  },
  savePlace: (p: Place) => placesCol.upsert(p, (x) => x.id),
  deletePlace: (id: string) => placesCol.remove(id, (x) => x.id),

  watchAttendance: (eventId: string, cb: Sub<Attendance[]>) => attendanceCol(eventId).watch(cb),
  setAttendance: (eventId: string, att: Attendance) =>
    attendanceCol(eventId).upsert(att, (x) => x.uid),
  clearAttendance: (eventId: string, uid: string) => attendanceCol(eventId).remove(uid, (x) => x.uid),

  watchPlaylists: (cb: Sub<Playlist[]>) => {
    return playlistsCol.watch((list) => cb([...list].sort((a, b) => b.createdAt - a.createdAt)))
  },
  savePlaylist: (p: Playlist) => playlistsCol.upsert(p, (x) => x.id),
  deletePlaylist: (id: string) => playlistsCol.remove(id, (x) => x.id),

  watchTracks: (playlistId: string, cb: Sub<Track[]>) =>
    trackCol(playlistId).watch((list) =>
      cb([...list].sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt))),
    ),
  saveTrack: (playlistId: string, t: Track) => trackCol(playlistId).upsert(t, (x) => x.id),
  deleteTrack: (playlistId: string, trackId: string) =>
    trackCol(playlistId).remove(trackId, (x) => x.id),
}
