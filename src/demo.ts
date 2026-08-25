/**
 * 로그인 없이 UI를 테스트하기 위한 데모 모드.
 *
 * - `npm run dev` (개발 모드)에서 URL에 `?demo` 가 있을 때만 켜진다.
 *   예) http://localhost:5173/?demo
 * - `import.meta.env.DEV` 가드로 프로덕션 빌드(배포본·APK)에는 절대 포함되지 않는다.
 * - Firebase 를 전혀 건드리지 않고, 아래 인메모리 스토어가 실시간 구독을 흉내낸다.
 *   (새로고침하면 초기 데이터로 리셋됨)
 */
import type { Attendance, Band, BandEvent, Member, Place, Playlist, Recording, RecordingFolder, RunningEntry, SetlistSong, Track, TrackPart } from './types'

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
  get(): T[]
}

function makeCollection<T>(initial: T[]): Collection<T> {
  let items = initial.map((x) => ({ ...x }))
  const subs = new Set<Sub<T[]>>()
  const emit = () => subs.forEach((f) => f(items.map((x) => ({ ...x }))))
  return {
    get() {
      return items.map((x) => ({ ...x }))
    },
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
    { id: 't1', url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', videoId: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody', artist: 'Queen', thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg', order: now, addedBy: 'demo-user', addedByName: '김데모', addedAt: now, participants: { 'demo-user': 'guitar', u2: 'guitar', u3: 'bass', u4: 'drum', u5: 'vocal', u6: 'keyboard' } },
    { id: 't2', url: 'https://www.youtube.com/watch?v=1w7OgIMMRc4', videoId: '1w7OgIMMRc4', title: 'Sweet Child O\' Mine', artist: "Guns N' Roses", thumbnail: 'https://img.youtube.com/vi/1w7OgIMMRc4/mqdefault.jpg', order: now + 1000, addedBy: 'demo-user', addedByName: '이기타', addedAt: now + 1000, participants: { u2: 'guitar', u4: 'drum', u5: 'vocal', u7: '코러스' } },
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

// 일정별 합주곡 컬렉션
const setlistCols = new Map<string, Collection<SetlistSong>>()
function setlistCol(eventId: string): Collection<SetlistSong> {
  let col = setlistCols.get(eventId)
  if (!col) {
    col = makeCollection<SetlistSong>([])
    setlistCols.set(eventId, col)
  }
  return col
}

/* ---------------- 데모 채널(워크스페이스): 밴드 + 개인 ---------------- */
export const DEMO_BAND: Band = { id: 'demo', name: 'Amici Band', ownerUid: DEMO_MEMBER.uid, templateId: 'band', createdAt: now }
export const DEMO_PERSONAL: Band = { id: 'demo-personal', name: '내 기록', ownerUid: DEMO_MEMBER.uid, templateId: 'personal', createdAt: now }
export const DEMO_CHANNELS: Band[] = [DEMO_BAND, DEMO_PERSONAL]

// URL 의 ?demo=personal 이면 개인 채널, 그 외(?demo, ?demo=band)면 밴드 채널
const demoChannelParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') : ''
export function demoActiveWorkspace(): Band {
  return demoChannelParam === 'personal' ? DEMO_PERSONAL : DEMO_BAND
}
export function setDemoChannel(bandId: string): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.set('demo', bandId === DEMO_PERSONAL.id ? 'personal' : 'band')
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

/* ---------------- 개인 채널 기록 폴더 + 러닝 샘플 데이터 ---------------- */
const RUNNING_FOLDER_ID = 'demo-run'
const initialRecordFolders: RecordingFolder[] = [
  { id: RUNNING_FOLDER_ID, name: '러닝', templateId: 'running', order: now, createdBy: DEMO_MEMBER.uid, createdAt: now },
  { id: 'demo-daily', name: '일상', order: now + 1, createdBy: DEMO_MEMBER.uid, createdAt: now + 1 },
]
const recordFoldersCol = makeCollection<RecordingFolder>(initialRecordFolders)

// [며칠 전, 거리(km), 시간(분), 평균 심박, 최대 심박] — 뒤로 갈수록 같은 페이스에 심박이 낮아지는(향상) 추세
const runSpecs: [number, number, number, number, number][] = [
  [33, 5.0, 32, 168, 182],
  [30, 6.2, 40, 170, 184],
  [26, 4.5, 28, 165, 178],
  [21, 7.0, 44, 166, 180],
  [17, 5.5, 33, 160, 175],
  [12, 8.0, 49, 162, 178],
  [6, 5.0, 29, 155, 170],
  [2, 6.5, 37, 154, 169],
  [1, 5.2, 29, 152, 168],
]
// 러닝 중 실시간(구간) 샘플 합성 — 페이스↔심박이 상관되도록(빠를수록·시간 지날수록 심박↑)
function genSamples(avgPaceSec: number, avgHr: number, maxHr: number): { hr: number; paceSec: number }[] {
  const N = 22
  const out: { hr: number; paceSec: number }[] = []
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1)
    const wobble = 0.06 * Math.sin(f * Math.PI * 3) + 0.03 * Math.sin(f * 17)
    const paceSec = avgPaceSec * (1 + wobble - 0.02 * Math.sin(f * Math.PI)) // 중반 살짝 빠르게
    const drift = (maxHr - avgHr) * (0.35 + 0.5 * f) // 카디악 드리프트
    const intensity = ((avgPaceSec - paceSec) / avgPaceSec) * avgHr * 0.6 // 빠를수록 심박↑
    const hr = Math.max(avgHr - 12, Math.min(maxHr, avgHr - (maxHr - avgHr) * 0.35 + drift + intensity))
    out.push({ hr: Math.round(hr), paceSec: Math.round(paceSec) })
  }
  return out
}
function genSplits(km: number, durationSec: number, avgHr: number): RunningEntry['splits'] {
  const distances: number[] = Array.from({ length: Math.floor(km) }, () => 1000)
  const remainder = Math.round((km - Math.floor(km)) * 1000)
  if (remainder >= 200) distances.push(remainder)
  const weights = distances.map((distanceM, index) => (distanceM / 1000) * (1 + 0.045 * Math.sin(index * 1.7) - 0.025 * Math.cos(index * 0.9)))
  const scale = durationSec / weights.reduce((sum, weight) => sum + weight, 0)
  return distances.map((distanceM, index) => {
    const splitDuration = weights[index] * scale
    return {
      index: index + 1,
      distanceM,
      durationSec: Math.round(splitDuration),
      paceSecPerKm: splitDuration / (distanceM / 1000),
      avgHr: Math.round(avgHr - 5 + index * 1.8 + Math.sin(index) * 2),
      avgCadence: Math.round(158 + index * 1.2 + Math.cos(index) * 2),
      partial: distanceM < 950,
    }
  })
}
function buildDemoRuns(): RunningEntry[] {
  return runSpecs.map(([daysAgo, km, min, avgHr, maxHr], i) => {
    const startTime = now - daysAgo * 86400000
    const durationSec = min * 60
    return {
      id: `run-${i}`,
      folderId: RUNNING_FOLDER_ID,
      date: new Date(startTime).toISOString().slice(0, 10),
      startTime,
      endTime: startTime + durationSec * 1000,
      distanceM: Math.round(km * 1000),
      durationSec,
      avgHr,
      maxHr,
      calories: Math.round(km * 65),
      steps: Math.round(km * 1450),
      samples: genSamples(durationSec / km, avgHr, maxHr),
      splits: genSplits(km, durationSec, avgHr),
      createdAt: startTime,
    }
  })
}
const runEntriesCols = new Map<string, Collection<RunningEntry>>()
function runEntriesCol(folderId: string): Collection<RunningEntry> {
  let col = runEntriesCols.get(folderId)
  if (!col) {
    col = makeCollection<RunningEntry>(folderId === RUNNING_FOLDER_ID ? buildDemoRuns() : [])
    runEntriesCols.set(folderId, col)
  }
  return col
}

/* ---------------- 밴드 영상(기록) + 이름 폴더 ---------------- */
const initialRecordingFolders: RecordingFolder[] = [
  { id: 'rf-hapju', name: '합주', order: now, createdBy: DEMO_MEMBER.uid, createdAt: now, playlistIds: ['PLdemoRehearsals'] },
  { id: 'rf-live', name: '공연', order: now + 1, createdBy: DEMO_MEMBER.uid, createdAt: now + 1 },
]
const initialRecordings: Recording[] = [
  { id: 'rec1', title: '8/15 합주 · Bohemian Rhapsody', date: '2026-08-15', url: 'https://youtu.be/fJ9rUzIMcZQ', videoId: 'fJ9rUzIMcZQ', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '김데모', createdAt: now, credits: { 보컬: ['정보컬'], 기타: ['이기타'] } },
  { id: 'rec2', title: "8/15 합주 · Sweet Child O' Mine", date: '2026-08-15', url: 'https://youtu.be/1w7OgIMMRc4', videoId: '1w7OgIMMRc4', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '김데모', createdAt: now + 1 },
  { id: 'rec3', title: '8/8 합주 연습', date: '2026-08-08', url: 'https://youtu.be/fJ9rUzIMcZQ', videoId: 'fJ9rUzIMcZQ', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '김데모', createdAt: now + 2 },
  { id: 'rec4', title: '여름 정기공연', date: '2026-08-22', url: 'https://youtu.be/1w7OgIMMRc4', videoId: '1w7OgIMMRc4', folderId: 'rf-live', addedBy: DEMO_MEMBER.uid, addedByName: '김데모', createdAt: now + 3 },
]
const recordingsCol = makeCollection<Recording>(initialRecordings)
const recordingFoldersCol = makeCollection<RecordingFolder>(initialRecordingFolders)

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
  getMonthlyPracticeParticipation: (startDate: string, endDate: string) => {
    const participating = new Set(['present', 'late', 'leave'])
    const counts: Record<string, number> = {}
    eventsCol.get()
      .filter((event) => event.type === 'practice' && event.date >= startDate && event.date < endDate)
      .forEach((event) => attendanceCol(event.id).get().forEach((attendance) => {
        if (participating.has(attendance.status)) counts[attendance.uid] = (counts[attendance.uid] ?? 0) + 1
      }))
    return counts
  },
  setAttendance: (eventId: string, att: Attendance) =>
    attendanceCol(eventId).upsert(att, (x) => x.uid),
  clearAttendance: (eventId: string, uid: string) => attendanceCol(eventId).remove(uid, (x) => x.uid),

  watchPlaylists: (cb: Sub<Playlist[]>) => {
    return playlistsCol.watch((list) => cb([...list].sort((a, b) => b.createdAt - a.createdAt)))
  },
  savePlaylist: (p: Playlist) => playlistsCol.upsert(p, (x) => x.id),
  deletePlaylist: (id: string) => playlistsCol.remove(id, (x) => x.id),

  watchSetlist: (eventId: string, cb: Sub<SetlistSong[]>) =>
    setlistCol(eventId).watch((list) =>
      cb([...list].sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt))),
    ),
  addSetlistSong: (eventId: string, song: SetlistSong) =>
    setlistCol(eventId).upsert(song, (x) => x.id),
  removeSetlistSong: (eventId: string, songId: string) =>
    setlistCol(eventId).remove(songId, (x) => x.id),

  watchTracks: (playlistId: string, cb: Sub<Track[]>) =>
    trackCol(playlistId).watch((list) =>
      cb([...list].sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt))),
    ),
  saveTrack: (playlistId: string, t: Track) => trackCol(playlistId).upsert(t, (x) => x.id),
  deleteTrack: (playlistId: string, trackId: string) =>
    trackCol(playlistId).remove(trackId, (x) => x.id),

  setTrackParticipation: (playlistId: string, trackId: string, uid: string, part: TrackPart) => {
    const col = trackCol(playlistId)
    const t = col.get().find((x) => x.id === trackId)
    if (!t) return
    col.upsert({ ...t, participants: { ...(t.participants ?? {}), [uid]: part } }, (x) => x.id)
  },
  clearTrackParticipation: (playlistId: string, trackId: string, uid: string) => {
    const col = trackCol(playlistId)
    const t = col.get().find((x) => x.id === trackId)
    if (!t) return
    const rest = { ...(t.participants ?? {}) }
    delete rest[uid]
    col.upsert({ ...t, participants: rest }, (x) => x.id)
  },

  // 개인 채널: 기록 폴더 + 러닝 데이터
  watchRecordFolders: (cb: Sub<RecordingFolder[]>) =>
    recordFoldersCol.watch((list) => cb([...list].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)))),
  saveRecordFolder: (f: RecordingFolder) => recordFoldersCol.upsert(f, (x) => x.id),
  deleteRecordFolder: (id: string) => recordFoldersCol.remove(id, (x) => x.id),
  watchRunningEntries: (folderId: string, cb: Sub<RunningEntry[]>) =>
    runEntriesCol(folderId).watch((list) =>
      cb([...list].sort((a, b) => (Number(b.startTime) || 0) - (Number(a.startTime) || 0))),
    ),

  // 밴드 영상(기록) + 이름 폴더
  watchRecordings: (cb: Sub<Recording[]>) => recordingsCol.watch(cb),
  saveRecording: (r: Recording) => recordingsCol.upsert(r, (x) => x.id),
  deleteRecording: (id: string) => recordingsCol.remove(id, (x) => x.id),
  watchRecordingFolders: (cb: Sub<RecordingFolder[]>) =>
    recordingFoldersCol.watch((list) => cb([...list].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)))),
  saveRecordingFolder: (f: RecordingFolder) => recordingFoldersCol.upsert(f, (x) => x.id),
  deleteRecordingFolder: (id: string) => recordingFoldersCol.remove(id, (x) => x.id),
  addRecordingFolderPlaylist: (folderId: string, pid: string) => {
    const f = recordingFoldersCol.get().find((x) => x.id === folderId)
    if (f) recordingFoldersCol.upsert({ ...f, playlistIds: [...new Set([...(f.playlistIds ?? []), pid])] }, (x) => x.id)
  },
  removeRecordingFolderPlaylist: (folderId: string, pid: string) => {
    const f = recordingFoldersCol.get().find((x) => x.id === folderId)
    if (f) recordingFoldersCol.upsert({ ...f, playlistIds: (f.playlistIds ?? []).filter((p) => p !== pid) }, (x) => x.id)
  },
}
