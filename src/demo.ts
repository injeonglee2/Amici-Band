/**
 * 로그인 없이 UI를 테스트하기 위한 데모 모드.
 *
 * - `npm run dev` (개발 모드)에서 URL에 `?demo` 가 있을 때만 켜진다.
 *   예) http://localhost:5173/?demo
 * - `?role=member` 를 추가하면 로그인 사용자가 밴드 관리자가 아닌 일반 멤버로 전환된다.
 *   예) http://localhost:5173/?demo&role=member
 * - `import.meta.env.DEV` 가드로 프로덕션 빌드(배포본·APK)에는 절대 포함되지 않는다.
 * - Firebase 를 전혀 건드리지 않고, 아래 인메모리 스토어가 실시간 구독을 흉내낸다.
 *   (새로고침하면 초기 데이터로 리셋됨)
 */
import type { Attendance, Band, BandEvent, CustomEventType, DateVote, EventComment, EventType, Member, MemberGroup, PersonalDailyMemo, Place, Playlist, Recording, RecordingFolder, RunningEntry, Score, SetlistSong, Track, TrackPart } from './types'
import { UNDATED_DATE } from './types'

export const DEMO =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('demo')

const demoIsAdmin = !(
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('role') === 'member'
)

export const DEMO_MEMBER: Member = {
  uid: 'demo-user',
  email: 'demo@amici.band',
  name: '이인정',
  part: 'keyboard',
  admin: demoIsAdmin,
  createdAt: Date.now(),
}

const now = Date.now()
// 마감일은 데모를 언제 열어도 '진행 중'으로 보이도록 오늘 기준 +7일
const inAWeek = new Date(now + 7 * 86400000).toLocaleDateString('sv-SE')

const initialMembers: Member[] = [
  { uid: 'demo-user', email: 'demo@amici.band', name: '이인정', part: 'keyboard', admin: demoIsAdmin, createdAt: now },
  { uid: 'm-kym', email: '', name: '김용민', part: 'bass', admin: true, createdAt: now },
  { uid: 'm-sgd', email: '', name: '서광동', part: 'drum', admin: true, createdAt: now },
  { uid: 'm-ong', email: '', name: '오남규', part: 'vocal', admin: true, createdAt: now },
  { uid: 'm-kdh', email: '', name: '김담희', part: 'vocal', createdAt: now },
  { uid: 'm-kss', email: '', name: '김성수', part: 'guitar', createdAt: now },
  { uid: 'm-khe', email: '', name: '김하은', part: 'vocal', createdAt: now },
  { uid: 'm-pjh', email: '', name: '박정환', part: 'guitar', createdAt: now },
  { uid: 'm-sjm', email: '', name: '서정민', part: 'keyboard', createdAt: now },
  { uid: 'm-wsm', email: '', name: '왕성민', part: 'keyboard', createdAt: now },
  { uid: 'm-igi', email: '', name: '이가인', part: 'bass', createdAt: now },
  { uid: 'm-csb', email: '', name: '최수빈', part: 'drum', createdAt: now },
  { uid: 'm-hyk', email: '', name: '한유경', part: 'vocal', createdAt: now },
]

const initialPlaces: Place[] = [
  { id: 'p-podo', name: '포도나무 합주실', address: '경기도 수원시 장안구 영화동 424-16', memo: '주차: 건물 뒤편 공영주차장 (합주실 이름 대면 2시간 무료)\n현관 비밀번호: 1234*', createdAt: now },
  { id: 'p-mudari', name: '무다리분식', address: '경기도 수원시 장안구', createdAt: now },
]

const initialEvents: BandEvent[] = [
  { id: 'e-hapju5', type: 'practice', title: '8월 5차 정기합주', date: '2026-08-29', rehStart: '18:00', rehEnd: '22:00', placeId: 'p-podo', note: '', createdBy: 'demo-user', createdAt: now },
  { id: 'e-jochan', type: 'flash', title: '운영진 조찬', date: '2026-09-05', rehStart: '16:30', rehEnd: '18:00', placeId: 'p-mudari', note: '', adminOnly: true, createdBy: 'demo-user', createdAt: now },
  { id: 'e-hapju9', type: 'practice', title: '9월 1차 정기합주', date: '2026-09-05', rehStart: '18:00', rehEnd: '22:00', placeId: 'p-podo', note: '', createdBy: 'demo-user', createdAt: now },
  { id: 'e-hapju9b', type: 'practice', title: '9월 2차 정기합주', date: '2026-09-12', rehStart: '18:00', rehEnd: '22:00', placeId: 'p-podo', note: '', createdBy: 'demo-user', createdAt: now },
  { id: 'e-show9', type: 'show', title: '9월 공연', date: '2026-09-26', rehStart: '18:00', rehEnd: '22:00', placeId: 'p-podo', note: '', createdBy: 'demo-user', createdAt: now },
  // 추천곡 마감 일정 — 음악 목록의 '추가중 / 투표중' 배지가 이 일정을 읽는다
  { id: 'recommendation-vote-deadline-pl-rec', type: 'practice', title: '추천곡 투표 마감', date: inAWeek, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: 'pl-rec', recommendationPlaylistName: '10월 공연 추천곡', musicDeadlineKind: 'vote', voteSelectionCount: 2, note: '', createdBy: 'demo-user', createdAt: now },
  { id: 'recommendation-deadline-pl-rec2', type: 'practice', title: '추천곡 추가 마감', date: inAWeek, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: 'pl-rec2', recommendationPlaylistName: '송년회 추천곡', musicDeadlineKind: 'recommendation', recommendationLimit: 2, note: '', createdBy: 'demo-user', createdAt: now },
]

const initialAttendance: Record<string, Attendance[]> = {
  'e-hapju5': [
    { uid: 'm-sgd', name: '서광동', status: 'present', updatedAt: now },
    { uid: 'm-csb', name: '최수빈', status: 'present', updatedAt: now },
    { uid: 'm-kym', name: '김용민', status: 'present', updatedAt: now },
    { uid: 'm-pjh', name: '박정환', status: 'present', updatedAt: now },
    { uid: 'm-sjm', name: '서정민', status: 'present', updatedAt: now },
    { uid: 'm-ong', name: '오남규', status: 'present', updatedAt: now },
    { uid: 'demo-user', name: '이인정', status: 'late', arriveTime: '18:30', updatedAt: now },
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
  { id: 'pl-rec', name: '10월 공연 추천곡', templateId: 'recommendation', voteOpen: true, voteType: 'instrument', voteSelectionCount: 2, voteVoterLimits: { 'demo-user': 2, 'm-kym': 2, 'm-sgd': 2, 'm-kss': 2, 'm-pjh': 2, 'm-sjm': 3, 'm-kdh': 3 }, voteOpenedAt: now - 86400000, voteDeadline: inAWeek, createdBy: 'demo-user', createdAt: now + 1000 },
  { id: 'pl-rec2', name: '송년회 추천곡', templateId: 'recommendation', recommendationLimit: 2, recommendationDeadline: inAWeek, createdBy: 'demo-user', createdAt: now + 999 },
  { id: 'pl-sep', name: '2026 9월 공연', createdBy: 'demo-user', createdAt: now },
  { id: 'pl-jazz', name: '재즈>_<', createdBy: 'demo-user', createdAt: now - 1000 },
]

const yt = (v: string) => ({ url: `https://www.youtube.com/watch?v=${v}`, videoId: v, thumbnail: `https://img.youtube.com/vi/${v}/mqdefault.jpg` })
// 8월 5차 합주 참여 파트(곡별) — 실제 파트 배정 예시
const fullBand: Record<string, TrackPart> = { 'demo-user': 'keyboard', 'm-kym': 'bass', 'm-sgd': 'drum', 'm-pjh': 'guitar', 'm-ong': 'vocal' }

const initialTracks: Record<string, Track[]> = {
  // 추천곡 — 멤버들이 올린 후보곡에 악기 파트가 투표 중
  'pl-rec': [
    { id: 'rc-antifreeze', ...yt('ZjDLIZC1ork'), title: '언체인드', artist: '실리카겔', order: now + 0, addedBy: 'm-pjh', addedByName: '박정환', addedAt: now + 0, candidateStatus: 'review', votes: { 'm-kym': true, 'm-sgd': true, 'm-pjh': true, 'demo-user': true } },
    { id: 'rc-ditto', ...yt('Km71Rr9K-Bw'), title: 'Ditto', artist: 'NewJeans', order: now + 1, addedBy: 'm-khe', addedByName: '김하은', addedAt: now + 1, candidateStatus: 'review', votes: { 'm-sjm': true, 'm-kss': true, 'm-kym': true } },
    { id: 'rc-love', ...yt('vBy0nyaZ1iU'), title: '사랑하게 될 줄 알았어', artist: '전건호', order: now + 2, addedBy: 'm-ong', addedByName: '오남규', addedAt: now + 2, candidateStatus: 'review', votes: { 'm-sgd': true } },
    { id: 'rc-honest', ...yt('vcNzHeAR8m4'), title: '한페이지가 될 수 있게', artist: '데이식스', order: now + 3, addedBy: 'm-igi', addedByName: '이가인', addedAt: now + 3, candidateStatus: 'review', votes: {} },
    { id: 'rc-beautiful', ...yt('4TWR90KJl84'), title: '밤하늘의 별을', artist: '경서예지', order: now + 4, addedBy: 'm-hyk', addedByName: '한유경', addedAt: now + 4, candidateStatus: 'review', votes: {} },
  ],
  // 합주곡 보관함 — 카드 전체를 눌러 재생하는 목록
  'rehearsal-library': [
    { id: 'rh-butter', ...yt('5BONQ39cP9k'), title: 'Butter-Fly [디지몬 어드벤처]', artist: '전영호', order: now + 0, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 0, participants: fullBand },
    { id: 'rh-pret', ...yt('37W7Y2RRyiM'), title: 'Pretender', artist: 'OFFICIAL HIGE DANDISM', order: now + 1, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 1, participants: { ...fullBand, 'm-sjm': 'keyboard' } },
    { id: 'rh-back', ...yt('sxs2LHOmmoU'), title: 'Back in Time', artist: 'Nerd Connection', order: now + 2, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 2 },
    { id: 'rh-romeo', ...yt('KMwFTUV6u1M'), title: 'romeo n juliet', artist: '죠지, 유라', order: now + 3, addedBy: 'm-ong', addedByName: '오남규', addedAt: now + 3 },
    { id: 'rh-jib', ...yt('XxM5yQj86s0'), title: 'ㅈㅣㅂ', artist: '한로로', order: now + 4, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 4 },
  ],
  // 아직 투표 전 — 멤버들이 곡을 모으는 중
  'pl-rec2': [
    { id: 'rc2-carol', ...yt('E8gmARGvPlI'), title: 'All I Want For Christmas Is You', artist: 'Mariah Carey', order: now + 0, addedBy: 'm-kdh', addedByName: '김담희', addedAt: now + 0, candidateStatus: 'review' },
    { id: 'rc2-snow', ...yt('BoJ0Jh0X4tk'), title: '첫 눈', artist: 'EXO', order: now + 1, addedBy: 'm-hyk', addedByName: '한유경', addedAt: now + 1, candidateStatus: 'review' },
  ],
  'pl-sep': [
    { id: 'tr-candidate-demo', ...yt('dQw4w9WgXc'), title: 'Never Gonna Give You Up', artist: 'Rick Astley', addedBy: 'm-pjh', addedByName: '박정환', addedAt: now + 20, candidateStatus: 'review', recommendation: '함께 연주할 후보곡이에요.', reviews: { 'm-pjh': { part: 'guitar', name: '박정환', result: '조건부 가능', note: '리듬 편곡이 필요해요.' } } },
    { id: 'tr-fly', ...yt('AuuMtPdKUf0'), title: 'Fly away', artist: '권진아', order: now + 0, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 0 },
    { id: 'tr-pink', ...yt('FsJDnrY1Cuk'), title: 'PINKTOP', artist: 'The Volunteers', order: now + 1, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 1 },
    { id: 'tr-romeo', ...yt('KMwFTUV6u1M'), title: 'romeo n juliet', artist: '죠지, 유라', order: now + 2, addedBy: 'demo-user', addedByName: '오남규', addedAt: now + 2, participants: { ...fullBand, 'm-khe': 'vocal' } },
    { id: 'tr-back', ...yt('sxs2LHOmmoU'), title: 'Back in Time', artist: 'Nerd Connection', order: now + 3, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 3, participants: fullBand },
    { id: 'tr-pret', ...yt('37W7Y2RRyiM'), title: 'Pretender', artist: 'OFFICIAL HIGE DANDISM', order: now + 4, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 4, participants: { ...fullBand, 'm-sjm': 'keyboard' } },
    { id: 'tr-spring', ...yt('8i-B1ieI_kY'), title: '시퍼런 봄', artist: 'THORNAPPLE', order: now + 5, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 5 },
    { id: 'tr-jib', ...yt('XxM5yQj86s0'), title: 'ㅈㅣㅂ', artist: '한로로', order: now + 6, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 6 },
    { id: 'tr-alu', ...yt('CnL10_X0hv0'), title: '알루미늄', artist: 'Broken Valentine', order: now + 7, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 7 },
    { id: 'tr-butter', ...yt('5BONQ39cP9k'), title: 'Butter-Fly [디지몬 어드벤처]', artist: '전영호', order: now + 8, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 8, participants: fullBand },
  ],
  'pl-jazz': [
    { id: 'trj-fly', ...yt('AuuMtPdKUf0'), title: 'Fly away', artist: '권진아', order: now, addedBy: 'demo-user', addedByName: '이인정', addedAt: now },
    { id: 'trj-spring', ...yt('8i-B1ieI_kY'), title: '시퍼런 봄', artist: 'THORNAPPLE', order: now + 1, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 1 },
    { id: 'trj-jib', ...yt('XxM5yQj86s0'), title: 'ㅈㅣㅂ', artist: '한로로', order: now + 2, addedBy: 'demo-user', addedByName: '이인정', addedAt: now + 2 },
  ],
}

// 8월 5차 정기합주 셋리스트 (재생목록 '2026 9월 공연'에서 담음)
const initialSetlists: Record<string, SetlistSong[]> = {
  'e-hapju5': [
    { id: 'tr-butter', playlistId: 'pl-sep', playlistName: '2026 9월 공연', title: 'Butter-Fly [디지몬 어드벤처]', artist: '전영호', videoId: '5BONQ39cP9k', thumbnail: 'https://img.youtube.com/vi/5BONQ39cP9k/mqdefault.jpg', order: 0, addedBy: 'demo-user', addedAt: now },
    { id: 'tr-pret', playlistId: 'pl-sep', playlistName: '2026 9월 공연', title: 'Pretender', artist: 'OFFICIAL HIGE DANDISM', videoId: '37W7Y2RRyiM', thumbnail: 'https://img.youtube.com/vi/37W7Y2RRyiM/mqdefault.jpg', order: 1, addedBy: 'demo-user', addedAt: now },
    { id: 'tr-back', playlistId: 'pl-sep', playlistName: '2026 9월 공연', title: 'Back in Time', artist: 'Nerd Connection', videoId: 'sxs2LHOmmoU', thumbnail: 'https://img.youtube.com/vi/sxs2LHOmmoU/mqdefault.jpg', order: 2, addedBy: 'demo-user', addedAt: now },
    { id: 'tr-romeo', playlistId: 'pl-sep', playlistName: '2026 9월 공연', title: 'romeo n juliet', artist: '죠지, 유라', videoId: 'KMwFTUV6u1M', thumbnail: 'https://img.youtube.com/vi/KMwFTUV6u1M/mqdefault.jpg', order: 3, addedBy: 'demo-user', addedAt: now },
  ],
}

// 악보 — 내 파트(건반) 악보 3곡
const initialScores: Score[] = [
  { id: 'sc-butter', trackId: 'tr-butter', playlistId: 'pl-sep', songTitle: 'Butter-Fly [디지몬 어드벤처]', songArtist: '전영호', thumbnail: 'https://img.youtube.com/vi/5BONQ39cP9k/mqdefault.jpg', part: 'keyboard', title: '건반 풀스코어', kind: 'images', files: [], addedBy: 'demo-user', addedByName: '이인정', createdAt: now + 2 },
  { id: 'sc-pret', trackId: 'tr-pret', playlistId: 'pl-sep', songTitle: 'Pretender', songArtist: 'OFFICIAL HIGE DANDISM', thumbnail: 'https://img.youtube.com/vi/37W7Y2RRyiM/mqdefault.jpg', part: 'keyboard', title: '건반 코드', kind: 'images', files: [], addedBy: 'demo-user', addedByName: '이인정', createdAt: now + 1 },
  { id: 'sc-alu', trackId: 'tr-alu', playlistId: 'pl-sep', songTitle: '알루미늄', songArtist: 'Broken Valentine', thumbnail: 'https://img.youtube.com/vi/CnL10_X0hv0/mqdefault.jpg', part: 'keyboard', title: '건반 악보', kind: 'images', files: [], addedBy: 'demo-user', addedByName: '이인정', createdAt: now },
]
export const demoScores = initialScores

const eventsCol = makeCollection<BandEvent>(initialEvents)

// 개인 채널 데모: 사용자 정의 유형 + 개인 일정 (밴드 이벤트와 분리)
const demoPersonalTypes: CustomEventType[] = [
  { id: 'pt-run', name: '운동', emoji: 'activity', color: '#BDE4C8', order: 0 },
  { id: 'pt-study', name: '공부', emoji: 'book', color: '#A8D8F0', order: 1 },
  { id: 'pt-meet', name: '약속', emoji: 'users', color: '#F8B8C8', order: 2 },
]
const dstr = (day: number) => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
const personalEvents: BandEvent[] = [
  { id: 'pe1', type: 'pt-run' as unknown as EventType, title: '아침 러닝', date: dstr(26), rehStart: '07:00', rehEnd: '', note: '5km 목표', createdBy: DEMO_MEMBER.uid, createdAt: now },
  { id: 'pe2', type: 'pt-study' as unknown as EventType, title: '알고리즘 스터디', date: dstr(27), rehStart: '20:00', rehEnd: '22:00', note: '', createdBy: DEMO_MEMBER.uid, createdAt: now },
  { id: 'pe3', type: 'pt-meet' as unknown as EventType, title: '동창 모임', date: dstr(29), rehStart: '19:00', rehEnd: '', note: '홍대입구역', createdBy: DEMO_MEMBER.uid, createdAt: now },
]
const personalEventsCol = makeCollection<BandEvent>(personalEvents)
const eventTypesCol = makeCollection<CustomEventType>(demoPersonalTypes)
const dailyMemosCol = makeCollection<PersonalDailyMemo>([])
// 친구 채널 일정 — 유형 id 는 밴드와 같지만 라벨은 모임·번개·여행·기타로 표시된다
const friendsEvents: BandEvent[] = [
  { id: 'fe1', type: 'meeting', title: '동창 저녁 모임', date: dstr(5), rehStart: '19:00', rehEnd: '22:00', loc: '홍대 포차거리', note: '2차는 노래방?', createdBy: DEMO_MEMBER.uid, createdAt: now },
  { id: 'fe2', type: 'flash', title: '퇴근 후 맥주', date: dstr(2), rehStart: '19:30', rehEnd: '21:30', note: '', createdBy: 'm-kss', createdAt: now },
  { id: 'fe3', type: 'show', title: '강릉 1박 2일', date: dstr(20), endDate: dstr(21), rehStart: '09:00', rehEnd: '18:00', note: '차 2대 필요', createdBy: 'm-pjh', createdAt: now },
  { id: 'fe4', type: 'other', color: '#ef6f91', allDay: true, title: '수빈 생일', date: dstr(12), rehStart: '00:00', rehEnd: '00:01', note: '', createdBy: DEMO_MEMBER.uid, createdAt: now },
  // 날짜 미정 약속 — 후보 날짜에 가능 여부를 모아 확정한다
  { id: 'fe5', type: 'meeting', undated: true, period: '이번 달 주말', dateOptions: [dstr(25), dstr(26)], title: '송년회 겸 집들이', date: UNDATED_DATE, rehStart: '18:00', rehEnd: '22:00', note: '명지네 집', createdBy: DEMO_MEMBER.uid, createdAt: now - 3600000 },
]
const friendsEventsCol = makeCollection<BandEvent>(friendsEvents)
const activeEventsCol = () => {
  const templateId = demoActiveWorkspace().templateId
  return templateId === 'personal' ? personalEventsCol : templateId === 'friends' ? friendsEventsCol : eventsCol
}
const placesCol = makeCollection<Place>(initialPlaces)
const membersCol = makeCollection<Member>(initialMembers)
const memberGroupsCol = makeCollection<MemberGroup>([])
const playlistsCol = makeCollection<Playlist>(initialPlaylists)

// 참석은 이벤트별 컬렉션
// 날짜 미정 약속의 후보 날짜 투표도 이벤트별 컬렉션
const dateVoteCols = new Map<string, Collection<DateVote>>()
function dateVoteCol(eventId: string): Collection<DateVote> {
  let col = dateVoteCols.get(eventId)
  if (!col) {
    col = makeCollection<DateVote>(eventId === 'fe5' ? [{ uid: 'm-kss', name: '김성수', available: [dstr(25)], updatedAt: now }] : [])
    dateVoteCols.set(eventId, col)
  }
  return col
}

// 일정 댓글도 이벤트별 컬렉션
const commentCols = new Map<string, Collection<EventComment>>()
function commentCol(eventId: string): Collection<EventComment> {
  let col = commentCols.get(eventId)
  if (!col) {
    col = makeCollection<EventComment>(eventId === 'fe3' ? [{ id: 'c1', uid: 'm-kss', name: '김성수', text: '차는 제가 한 대 가져갈게요', createdAt: now - 7200000 }] : [])
    commentCols.set(eventId, col)
  }
  return col
}

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
    col = makeCollection<SetlistSong>(initialSetlists[eventId] ?? [])
    setlistCols.set(eventId, col)
  }
  return col
}

/* ---------------- 데모 채널(워크스페이스): 밴드 + 개인 + 친구 ---------------- */
export const DEMO_BAND: Band = { id: 'demo', name: 'AMICI', ownerUid: DEMO_MEMBER.uid, templateId: 'band', createdAt: now }
export const DEMO_PERSONAL: Band = { id: 'demo-personal', name: '내 기록', ownerUid: DEMO_MEMBER.uid, templateId: 'personal', createdAt: now }
export const DEMO_FRIENDS: Band = { id: 'demo-friends', name: '고등학교 친구들', ownerUid: DEMO_MEMBER.uid, templateId: 'friends', createdAt: now }
export const DEMO_CHANNELS: Band[] = [DEMO_BAND, DEMO_PERSONAL, DEMO_FRIENDS]

// URL 의 ?demo=personal 이면 개인 채널, ?demo=friends 면 친구 채널, 그 외(?demo, ?demo=band)면 밴드 채널
const demoChannelParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') : ''
export function demoActiveWorkspace(): Band {
  return demoChannelParam === 'personal' ? DEMO_PERSONAL : demoChannelParam === 'friends' ? DEMO_FRIENDS : DEMO_BAND
}
export function setDemoChannel(bandId: string): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  params.set('demo', bandId === DEMO_PERSONAL.id ? 'personal' : bandId === DEMO_FRIENDS.id ? 'friends' : 'band')
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

/* ---------------- 개인 채널 기록 폴더 + 러닝 샘플 데이터 ---------------- */
const RUNNING_FOLDER_ID = 'demo-run'
const initialRecordFolders: RecordingFolder[] = [
  { id: RUNNING_FOLDER_ID, name: '러닝', templateId: 'running', order: now, createdBy: DEMO_MEMBER.uid, createdAt: now },
  { id: 'demo-daily', name: '일상', order: now + 1, createdBy: DEMO_MEMBER.uid, createdAt: now + 1, tagId: 'pt-study' },
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
  { id: 'rec1', title: '8/22 합주 · Butter-Fly', date: '2026-08-22', url: 'https://youtu.be/5BONQ39cP9k', videoId: '5BONQ39cP9k', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '이인정', createdAt: now, credits: { 보컬: ['오남규'], 건반: ['이인정', '서정민'] } },
  { id: 'rec2', title: '8/22 합주 · Pretender', date: '2026-08-22', url: 'https://youtu.be/37W7Y2RRyiM', videoId: '37W7Y2RRyiM', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '이인정', createdAt: now + 1 },
  { id: 'rec3', title: '8/15 합주 · Back in Time', date: '2026-08-15', url: 'https://youtu.be/sxs2LHOmmoU', videoId: 'sxs2LHOmmoU', folderId: 'rf-hapju', addedBy: DEMO_MEMBER.uid, addedByName: '이인정', createdAt: now + 2 },
  { id: 'rec4', title: '9월 공연 리허설', date: '2026-08-22', url: 'https://youtu.be/KMwFTUV6u1M', videoId: 'KMwFTUV6u1M', folderId: 'rf-live', addedBy: DEMO_MEMBER.uid, addedByName: '이인정', createdAt: now + 3 },
]
const recordingsCol = makeCollection<Recording>(initialRecordings)
const recordingFoldersCol = makeCollection<RecordingFolder>(initialRecordingFolders)
const scoresCol = makeCollection<Score>(initialScores)

export const demoDb = {
  watchMembers: (cb: Sub<Member[]>) => membersCol.watch(cb),
  watchMemberGroups: (cb: Sub<MemberGroup[]>) => memberGroupsCol.watch(cb),
  saveMemberGroup: (group: MemberGroup) => memberGroupsCol.upsert(group, (item) => item.id),
  deleteMemberGroup: (id: string) => memberGroupsCol.remove(id, (item) => item.id),
  watchEvents: (cb: Sub<BandEvent[]>) => activeEventsCol().watch(cb),
  saveEvent: (ev: BandEvent) => activeEventsCol().upsert(ev, (x) => x.id),
  deleteEvent: (id: string) => activeEventsCol().remove(id, (x) => x.id),
  watchEventTypes: (cb: Sub<CustomEventType[]>) => eventTypesCol.watch((l) => cb([...l].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))),
  saveEventType: (t: CustomEventType) => eventTypesCol.upsert(t, (x) => x.id),
  deleteEventType: (id: string) => eventTypesCol.remove(id, (x) => x.id),
  watchDailyMemo: (date: string, cb: Sub<PersonalDailyMemo | null>) => dailyMemosCol.watch((list) => cb(list.find((memo) => memo.date === date) ?? null)),
  saveDailyMemo: (memo: PersonalDailyMemo) => memo.text.trim()
    ? dailyMemosCol.upsert(memo, (item) => item.date)
    : dailyMemosCol.remove(memo.date, (item) => item.date),

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
  getEarliestEventDate: (): string | null => {
    const dates = activeEventsCol().get().map((e) => e.date).filter(Boolean)
    return dates.length ? dates.sort()[0] : null
  },
  setAttendance: (eventId: string, att: Attendance) =>
    attendanceCol(eventId).upsert(att, (x) => x.uid),
  clearAttendance: (eventId: string, uid: string) => attendanceCol(eventId).remove(uid, (x) => x.uid),
  watchDateVotes: (eventId: string, cb: Sub<DateVote[]>) => dateVoteCol(eventId).watch(cb),
  setDateVote: (eventId: string, vote: DateVote) => dateVoteCol(eventId).upsert(vote, (x) => x.uid),
  watchEventComments: (eventId: string, cb: Sub<EventComment[]>) => commentCol(eventId).watch((list) => cb([...list].sort((a, b) => a.createdAt - b.createdAt))),
  addEventComment: (eventId: string, comment: EventComment) => commentCol(eventId).upsert(comment, (x) => x.id),
  deleteEventComment: (eventId: string, id: string) => commentCol(eventId).remove(id, (x) => x.id),

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

  // 악보 (내 파트 필터는 컴포넌트에서 처리)
  watchScores: (cb: Sub<Score[]>) => scoresCol.watch((l) => cb([...l].sort((a, b) => b.createdAt - a.createdAt))),

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
