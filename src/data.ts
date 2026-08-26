import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, fbApp, storage } from './firebase'
import { getCurrentBand, bandCol, bandDoc, bandStoragePath } from './band'
import { DEMO, demoDb } from './demo'
import type { Band, Attendance, BandEvent, CustomEventType, Feedback, FeedbackReply, Member, PersonalRecordEntry, PersonalVideo, Place, Playlist, RecipeIngredient, Recording, RecordingFolder, RunningEntry, Score, ScoreFile, SetlistSong, Track, TrackPart, WebPushSubscription } from './types'

const FUNCTIONS_REGION = 'asia-northeast3'

export interface BillingDailyUsage {
  date: string
  reads: number
  writes: number
  deletes: number
  storageBytes: number
}

export type SamsungHealthSyncRange = '90d' | '1y' | 'all'

export interface SamsungHealthSyncSession {
  token: string
  uploadUrl: string
  startTime: number
  endTime: number
  incremental: boolean
}

export async function createSamsungHealthSyncSession(folderId: string, range: SamsungHealthSyncRange): Promise<SamsungHealthSyncSession> {
  const call = httpsCallable<{ bandId: string; folderId: string; range: SamsungHealthSyncRange }, SamsungHealthSyncSession>(
    requireFunctions(),
    'createSamsungHealthSyncSession',
  )
  const result = await call({ bandId: getCurrentBand(), folderId, range })
  return result.data
}

export async function createAppleHealthSyncSession(folderId: string, range: SamsungHealthSyncRange): Promise<SamsungHealthSyncSession> {
  const call = httpsCallable<{ bandId: string; folderId: string; range: SamsungHealthSyncRange }, SamsungHealthSyncSession>(
    requireFunctions(),
    'createAppleHealthSyncSession',
  )
  const result = await call({ bandId: getCurrentBand(), folderId, range })
  return result.data
}

export async function getBillingUsageStats(days = 30): Promise<{ rows: BillingDailyUsage[]; generatedAt: number; timezone: string; storageAvailable: boolean }> {
  const call = httpsCallable<{ days: number }, { rows: BillingDailyUsage[]; generatedAt: number; timezone: string; storageAvailable: boolean }>(requireFunctions(), 'getBillingUsageStats')
  const result = await call({ days })
  return result.data
}

/* ---------------- members (bands/{band}/members/{uid}) ---------------- */
export async function getMember(uid: string): Promise<Member | null> {
  const snap = await getDoc(bandDoc('members', uid))
  return snap.exists() ? (snap.data() as Member) : null
}

export async function getMemberFromBand(bandId: string, uid: string): Promise<Member | null> {
  const snap = await getDoc(doc(db, 'bands', bandId, 'members', uid))
  return snap.exists() ? (snap.data() as Member) : null
}

export async function getLegacyMember(uid: string): Promise<Member | null> {
  const snap = await getDoc(doc(db, 'members', uid))
  return snap.exists() ? (snap.data() as Member) : null
}

export async function getUserProfile(uid: string): Promise<{ name?: string }> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return {}
  return {
    name: (snap.get('profileName') as string | undefined)?.trim() || undefined,
  }
}

export async function saveMember(m: Member): Promise<void> {
  const memberData = {
    ...m,
    // 파트가 없는 개인/일반 공동 채널에서는 과거에 복사된 파트도 제거한다.
    part: m.part ?? deleteField(),
  }
  await Promise.all([
    setDoc(bandDoc('members', m.uid), memberData, { merge: true }),
    // 이름만 사용자 공통 프로필이다. 파트는 밴드별 members 문서에만 둔다.
    setDoc(doc(db, 'users', m.uid), { profileName: m.name, profilePart: deleteField() }, { merge: true }),
  ])
}

/** 전체 멤버 명단 구독 (미정 계산용) */
export function watchMembers(
  cb: (members: Member[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchMembers(cb)
  return onSnapshot(
    bandCol('members'),
    (snap) => cb(snap.docs.map((d) => d.data() as Member)),
    (err) => {
      console.error('watchMembers', err)
      onError?.(err)
    },
  )
}

/** 이 기기의 푸시 토큰을 내 멤버 문서에 누적 저장 */
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  if (DEMO) return
  await setDoc(bandDoc('members', uid), { fcmTokens: arrayUnion(token) }, { merge: true })
}

/** iPhone 홈 화면 PWA 등 표준 Web Push 구독을 멤버 문서에 저장 */
export async function saveWebPushSubscription(uid: string, subscription: WebPushSubscription): Promise<void> {
  if (DEMO) return
  await setDoc(
    bandDoc('members', uid),
    { webPushSubscriptions: arrayUnion(subscription) },
    { merge: true },
  )
}

export interface ReminderDeliveryResult {
  undecided: number
  registeredMembers: number
  sent: number
  failed: number
  fcmTokens: number
  webPushSubscriptions: number
}

/** 아직 투표 안 한(미정) 멤버에게 투표 요청 푸시 — 대상·등록·성공·실패를 구분해 반환 */
export async function remindUndecided(eventId: string): Promise<ReminderDeliveryResult> {
  if (DEMO || !fbApp) return { undecided: 0, registeredMembers: 0, sent: 0, failed: 0, fcmTokens: 0, webPushSubscriptions: 0 }
  const call = httpsCallable<{ eventId: string; bandId: string }, ReminderDeliveryResult>(
    getFunctions(fbApp, FUNCTIONS_REGION),
    'remindUndecided',
  )
  const res = await call({ eventId, bandId: getCurrentBand() })
  return res.data
}

/* ---------------- 밴드 계정·멤버십 (users / bands / inviteCodes) ---------------- */
/** 로그인 사용자가 속한 밴드 id (없으면 null) */
export async function getUserBand(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? ((snap.get('bandId') as string) || null) : null
}

/** users 문서가 없어도 legacy AMICI 멤버면 자동 치유해 amici 로 연결 (전환기 안전망) */
export async function healUserBand(uid: string): Promise<string | null> {
  const legacy = await getDoc(doc(db, 'bands', 'amici', 'members', uid))
  if (legacy.exists()) {
    await setDoc(doc(db, 'users', uid), { bandId: 'amici', createdAt: Date.now() }, { merge: true })
    return 'amici'
  }
  return null
}

function requireFunctions() {
  if (!fbApp) throw new Error('Firebase 가 초기화되지 않았어요.')
  return getFunctions(fbApp, FUNCTIONS_REGION)
}

/** 새 밴드 생성 (생성자가 관리자). 반환: 생성된 bandId + 초대코드 */
export async function createBand(name: string, templateId: string = 'band'): Promise<{ bandId: string; code?: string }> {
  const call = httpsCallable<{ name: string; templateId: string }, { bandId: string; code?: string }>(requireFunctions(), 'createBand')
  const res = await call({ name, templateId })
  return res.data
}

/** 초대 코드로 가입. 반환: 가입한 bandId */
export async function joinBand(code: string): Promise<{ bandId: string }> {
  const call = httpsCallable<{ code: string }, { bandId: string }>(requireFunctions(), 'joinBand')
  const res = await call({ code })
  return res.data
}

/** 초대 코드 재발급(회전) — 밴드 관리자만. 반환: 새 코드 */
export async function rotateInviteCode(bandId: string): Promise<{ code: string }> {
  const call = httpsCallable<{ bandId: string }, { code: string }>(requireFunctions(), 'rotateInviteCode')
  const res = await call({ bandId })
  return res.data
}

/** 밴드 문서 조회 (소유자·인원 등) */
export async function getBand(bandId: string): Promise<Band | null> {
  const snap = await getDoc(doc(db, 'bands', bandId))
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Band, 'id'>) }) : null
}

/** 멤버 강퇴 (밴드 관리자만) */
export async function kickMember(bandId: string, uid: string): Promise<void> {
  await httpsCallable<{ bandId: string; uid: string }, { ok: boolean }>(requireFunctions(), 'kickMember')({ bandId, uid })
}

/** 관리자 지정/해제 (밴드 관리자만) */
export async function setMemberAdmin(bandId: string, uid: string, admin: boolean): Promise<void> {
  await httpsCallable<{ bandId: string; uid: string; admin: boolean }, { ok: boolean }>(requireFunctions(), 'setMemberAdmin')({ bandId, uid, admin })
}

/** 이 밴드의 현재 활성 초대 코드 (없으면 null) */
export async function getActiveInviteCode(bandId: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, 'inviteCodes'), where('bandId', '==', bandId), where('active', '==', true)),
  )
  return snap.empty ? null : snap.docs[0].id
}

/** (개발자 전용) 전체 밴드 현황 구독 — 과금 모니터링용 */
export function watchAllBands(
  cb: (bands: Band[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'bands'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Band, 'id'>) }))
      list.sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
      cb(list)
    },
    (err) => {
      console.error('watchAllBands', err)
      onError?.(err)
    },
  )
}

/* ---------------- events (bands/{band}/events) ---------------- */
export function watchEvents(
  cb: (events: BandEvent[]) => void,
  onError?: (e: Error) => void,
  since?: string, // 주면 date >= since 만 실시간 구독(읽기 비용 상한). 미래 일정은 항상 포함됨.
): () => void {
  if (DEMO) return demoDb.watchEvents(cb)
  // 정렬은 클라이언트(Main)에서 하므로 orderBy 없이 조회. since 는 단일 필드 범위라 복합 색인 불필요.
  const ref = since ? query(bandCol('events'), where('date', '>=', since)) : bandCol('events')
  return onSnapshot(
    ref,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BandEvent, 'id'>) })))
    },
    (err) => {
      console.error('watchEvents', err)
      onError?.(err)
    },
  )
}

/** 지난 일정 '더보기' — before(날짜) 이전의 지난 일정을 최신순으로 한 묶음(max개) 1회 조회 */
export async function loadOlderEvents(before: string, max = 50): Promise<BandEvent[]> {
  if (DEMO) return []
  const snap = await getDocs(
    query(bandCol('events'), where('date', '<', before), orderBy('date', 'desc'), limit(max)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BandEvent, 'id'>) }))
}

export async function saveEvent(ev: BandEvent): Promise<void> {
  if (DEMO) return demoDb.saveEvent(ev)
  const { id, ...rest } = ev
  // undefined 필드는 Firestore가 거부하므로 제거
  const data = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  )
  // 전체 덮어쓰기(merge 아님) — 장소를 비우는 등 필드 제거가 반영되도록. 폼이 모든 필드를 제공함.
  await setDoc(bandDoc('events', id), data)
}

export async function deleteEvent(id: string): Promise<void> {
  if (DEMO) return demoDb.deleteEvent(id)
  await deleteDoc(bandDoc('events', id))
}

/** (공연) 연결 재생목록만 갱신 — playlistId 만 merge, null 이면 연결 해제 */
export async function setEventPlaylist(ev: BandEvent, playlistId: string | null): Promise<void> {
  if (DEMO) return demoDb.saveEvent({ ...ev, playlistId: playlistId ?? undefined })
  await setDoc(
    bandDoc('events', ev.id),
    { playlistId: playlistId ?? deleteField() },
    { merge: true },
  )
}

/* ---------------- places (bands/{band}/places) ---------------- */
export function watchPlaces(
  cb: (places: Place[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchPlaces(cb)
  return onSnapshot(
    bandCol('places'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Place, 'id'>) }))
      list.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      cb(list)
    },
    (err) => {
      console.error('watchPlaces', err)
      onError?.(err)
    },
  )
}

export async function savePlace(p: Place): Promise<void> {
  if (DEMO) return demoDb.savePlace(p)
  const { id, ...data } = p
  await setDoc(bandDoc('places', id), data, { merge: true })
}

export async function deletePlace(id: string): Promise<void> {
  if (DEMO) return demoDb.deletePlace(id)
  await deleteDoc(bandDoc('places', id))
}

/* ---------------- attendance (bands/{band}/events/{id}/attendance/{uid}) ---------------- */
export function watchAttendance(
  eventId: string,
  cb: (list: Attendance[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchAttendance(eventId, cb)
  return onSnapshot(
    bandCol('events', eventId, 'attendance'),
    (snap) => {
      cb(snap.docs.map((d) => d.data() as Attendance))
    },
    (err) => {
      console.error('watchAttendance', err)
      onError?.(err)
    },
  )
}

/** 지정한 달의 합주에서 참석·늦참·조퇴로 응답한 횟수를 멤버별로 집계한다. */
/** 참여 통계가 존재할 수 있는 가장 이른 이벤트 날짜(YYYY-MM-DD). 없으면 null. */
export async function getEarliestEventDate(): Promise<string | null> {
  if (DEMO) return demoDb.getEarliestEventDate()
  const snap = await getDocs(query(bandCol('events'), orderBy('date', 'asc'), limit(1)))
  return snap.empty ? null : ((snap.docs[0].get('date') as string) ?? null)
}

export async function getMonthlyPracticeParticipation(startDate: string, endDate: string): Promise<Record<string, number>> {
  if (DEMO) return demoDb.getMonthlyPracticeParticipation(startDate, endDate)
  const events = await getDocs(query(
    bandCol('events'),
    where('date', '>=', startDate),
    where('date', '<', endDate),
  ))
  const practiceIds = events.docs
    .filter((event) => event.get('type') === 'practice')
    .map((event) => event.id)
  const attendanceLists = await Promise.all(practiceIds.map((eventId) =>
    getDocs(bandCol('events', eventId, 'attendance')),
  ))
  const participating = new Set(['present', 'late', 'leave'])
  const counts: Record<string, number> = {}
  attendanceLists.forEach((attendance) => attendance.docs.forEach((item) => {
    const row = item.data() as Partial<Attendance>
    if (!row.status || !participating.has(row.status)) return
    const uid = row.uid || item.id
    counts[uid] = (counts[uid] ?? 0) + 1
  }))
  return counts
}

export async function setAttendance(eventId: string, att: Attendance): Promise<void> {
  if (DEMO) return demoDb.setAttendance(eventId, att)
  // undefined 필드는 Firestore가 거부하므로 정리
  const clean: Attendance = { ...att }
  if (clean.status !== 'late') delete clean.arriveTime
  if (clean.status !== 'leave') delete clean.leaveTime
  if (!clean.note) delete clean.note
  await setDoc(bandDoc('events', eventId, 'attendance', att.uid), clean)
}

export async function clearAttendance(eventId: string, uid: string): Promise<void> {
  if (DEMO) return demoDb.clearAttendance(eventId, uid)
  await deleteDoc(bandDoc('events', eventId, 'attendance', uid))
}

/* ---------------- playlists (bands/{band}/playlists) ---------------- */
export function watchPlaylists(
  cb: (playlists: Playlist[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchPlaylists(cb)
  return onSnapshot(
    bandCol('playlists'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Playlist, 'id'>) }))
      // 최근에 만든 재생목록이 위로
      list.sort((a, b) => b.createdAt - a.createdAt)
      cb(list)
    },
    (err) => {
      console.error('watchPlaylists', err)
      onError?.(err)
    },
  )
}

export async function savePlaylist(p: Playlist): Promise<void> {
  if (DEMO) return demoDb.savePlaylist(p)
  const { id, ...data } = p
  await setDoc(bandDoc('playlists', id), data, { merge: true })
}

/* ---------------- recordings (bands/{band}/recordings — 링크 기반) ---------------- */
export function watchRecordings(
  cb: (recordings: Recording[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchRecordings(cb)
  return onSnapshot(
    bandCol('recordings'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recording, 'id'>) }))
      // 정렬·그룹화는 템플릿별 기록 모듈이 담당한다. 데이터 계층은 원본 순서에 의존하지 않는다.
      cb(list)
    },
    (err) => {
      console.error('watchRecordings', err)
      onError?.(err)
    },
  )
}

export async function saveRecording(r: Recording): Promise<void> {
  if (DEMO) return demoDb.saveRecording(r)
  const { id, ...rest } = r
  // undefined 필드는 deleteField() 로 바꿔, 수정 시 값 지움(빈 메모·일정 연결 해제 등)이 반영되게 한다.
  // (merge:true 에서 필드를 그냥 빼면 기존 값이 남아 지워지지 않는다)
  const data = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  )
  await setDoc(bandDoc('recordings', id), data, { merge: true })
}

export async function deleteRecording(id: string): Promise<void> {
  if (DEMO) return demoDb.deleteRecording(id)
  await deleteDoc(bandDoc('recordings', id))
}

/* ---------------- 밴드 영상 이름 폴더 (bands/{band}/recordingFolders) ---------------- */
export function watchRecordingFolders(
  cb: (folders: RecordingFolder[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchRecordingFolders(cb)
  return onSnapshot(bandCol('recordingFolders'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecordingFolder, 'id'>) }))
    list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
    cb(list)
  }, (err) => onError?.(err))
}

export async function saveRecordingFolder(folder: RecordingFolder): Promise<void> {
  if (DEMO) return demoDb.saveRecordingFolder(folder)
  const { id, ...data } = folder
  await setDoc(bandDoc('recordingFolders', id), data, { merge: true })
}

export async function deleteRecordingFolder(folderId: string): Promise<void> {
  if (DEMO) return demoDb.deleteRecordingFolder(folderId)
  await deleteDoc(bandDoc('recordingFolders', folderId))
}

/** 폴더에 유튜브 재생목록 연결/해제 (수동·주간 동기화 대상) */
export async function addRecordingFolderPlaylist(folderId: string, playlistId: string): Promise<void> {
  if (DEMO) return demoDb.addRecordingFolderPlaylist(folderId, playlistId)
  await setDoc(bandDoc('recordingFolders', folderId), { playlistIds: arrayUnion(playlistId) }, { merge: true })
}
export async function removeRecordingFolderPlaylist(folderId: string, playlistId: string): Promise<void> {
  if (DEMO) return demoDb.removeRecordingFolderPlaylist(folderId, playlistId)
  await setDoc(bandDoc('recordingFolders', folderId), { playlistIds: arrayRemove(playlistId) }, { merge: true })
}

/* ---------------- 개인 채널 사용자 정의 일정 유형 (bands/{band}/eventTypes) ---------------- */
export function watchEventTypes(
  cb: (types: CustomEventType[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchEventTypes(cb)
  return onSnapshot(bandCol('eventTypes'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomEventType, 'id'>) }))
    list.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0))
    cb(list)
  }, (err) => onError?.(err))
}
export async function saveEventType(t: CustomEventType): Promise<void> {
  if (DEMO) return demoDb.saveEventType(t)
  const { id, ...data } = t
  await setDoc(bandDoc('eventTypes', id), data, { merge: true })
}
export async function deleteEventType(id: string): Promise<void> {
  if (DEMO) return demoDb.deleteEventType(id)
  await deleteDoc(bandDoc('eventTypes', id))
}

/** 개발자 채널 전환용 전체 채널 일회 조회. */
export async function getAllBands(): Promise<Band[]> {
  const snap = await getDocs(collection(db, 'bands'))
  const list = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Band, 'id'>) }))
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return list
}

/** 사용자가 접근 가능한 채널 id. 기존 bandId 단일 필드도 함께 지원한다. */
export async function getUserBandIds(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return []
  const current = (snap.get('bandId') as string) || ''
  const stored = (snap.get('bandIds') as string[] | undefined) ?? []
  return [...new Set([current, ...stored].filter(Boolean))]
}

/** 활성 채널 전환. 실제 접근 권한은 각 채널 멤버십 규칙으로 다시 검증된다. */
export async function setActiveUserBand(uid: string, bandId: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { bandId }, { merge: true })
}

/* ---------------- personal video folders ---------------- */
export function watchVideoFolders(
  cb: (folders: RecordingFolder[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) { cb([]); return () => {} }
  return onSnapshot(bandCol('videoFolders'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecordingFolder, 'id'>) }))
    list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
    cb(list)
  }, (err) => onError?.(err))
}

export async function saveVideoFolder(folder: RecordingFolder): Promise<void> {
  if (DEMO) return
  const { id, ...data } = folder
  await setDoc(bandDoc('videoFolders', id), data, { merge: true })
}

export async function deleteVideoFolder(folderId: string): Promise<void> {
  if (DEMO) return
  const videos = await getDocs(bandCol('videoFolders', folderId, 'videos'))
  const ingredients = await getDocs(bandCol('videoFolders', folderId, 'ingredients'))
  const batch = writeBatch(db)
  videos.docs.forEach((video) => batch.delete(video.ref))
  ingredients.docs.forEach((ingredient) => batch.delete(ingredient.ref))
  batch.delete(bandDoc('videoFolders', folderId))
  await batch.commit()
}

/* ---------------- personal record folders ---------------- */
export function watchPersonalRecordFolders(
  cb: (folders: RecordingFolder[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchRecordFolders(cb)
  return onSnapshot(bandCol('recordFolders'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecordingFolder, 'id'>) }))
    list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt))
    cb(list)
  }, (err) => onError?.(err))
}

export async function savePersonalRecordFolder(folder: RecordingFolder): Promise<void> {
  if (DEMO) return demoDb.saveRecordFolder(folder)
  const { id, ...data } = folder
  await setDoc(bandDoc('recordFolders', id), data, { merge: true })
}

export async function deletePersonalRecordFolder(folderId: string): Promise<void> {
  if (DEMO) return demoDb.deleteRecordFolder(folderId)
  const entries = await getDocs(bandCol('recordFolders', folderId, 'entries'))
  const files = entries.docs.flatMap((entry) => ((entry.get('files') as ScoreFile[] | undefined) ?? []))
  const freed = files.reduce((sum, file) => sum + (file.size ?? 0), 0)
  await Promise.allSettled(files.map((file) => deleteObject(storageRef(storage, file.path))))
  const batch = writeBatch(db)
  entries.docs.forEach((entry) => batch.delete(entry.ref))
  batch.delete(bandDoc('recordFolders', folderId))
  await batch.commit()
  if (freed) addStorageBytes(-freed)
}

export function watchPersonalRecordEntries(folderId: string, cb: (entries: PersonalRecordEntry[]) => void, onError?: (e: Error) => void): () => void {
  if (DEMO) { cb([]); return () => {} }
  return onSnapshot(bandCol('recordFolders', folderId, 'entries'), (snap) => {
    const entries = snap.docs.map((item) => ({ id: item.id, folderId, ...(item.data() as Omit<PersonalRecordEntry, 'id' | 'folderId'>) }))
    entries.sort((a, b) => b.createdAt - a.createdAt)
    cb(entries)
  }, (error) => onError?.(error))
}

/** 러닝 폴더 엔트리 전체 조회 — 저장된 모든 필드를 그대로 반환(전체 덤프용). 경로는 recordFolders 재사용. */
export function watchRunningEntries(folderId: string, cb: (entries: RunningEntry[]) => void, onError?: (e: Error) => void): () => void {
  if (DEMO) return demoDb.watchRunningEntries(folderId, cb)
  return onSnapshot(bandCol('recordFolders', folderId, 'entries'), (snap) => {
    const entries: RunningEntry[] = snap.docs.map((item) => ({ id: item.id, folderId, ...(item.data() as Record<string, unknown>) }))
    // 최신순: startTime → createdAt → date(문자열을 시각으로) 순으로 타임스탬프 산출
    const ts = (e: RunningEntry) => Number(e.startTime) || Number(e.createdAt) || Date.parse(String(e.date ?? '')) || 0
    entries.sort((a, b) => ts(b) - ts(a))
    cb(entries)
  }, (error) => onError?.(error))
}

export async function uploadPersonalRecordFile(folderId: string, entryId: string, file: File, index: number): Promise<ScoreFile> {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60)
  const path = bandStoragePath('recordFolders', folderId, 'entries', entryId, `${index}-${safe}`)
  const target = storageRef(storage, path)
  await uploadBytes(target, file, { contentType: file.type || undefined })
  const url = await getDownloadURL(target)
  addStorageBytes(file.size)
  return { url, path, name: file.name, size: file.size }
}

export async function savePersonalRecordEntry(entry: PersonalRecordEntry): Promise<void> {
  if (DEMO) return
  const { id, folderId, ...data } = entry
  await setDoc(bandDoc('recordFolders', folderId, 'entries', id), data)
}

export async function deletePersonalRecordEntry(entry: PersonalRecordEntry): Promise<void> {
  if (DEMO) return
  const freed = entry.files.reduce((sum, file) => sum + (file.size ?? 0), 0)
  await Promise.allSettled(entry.files.map((file) => deleteObject(storageRef(storage, file.path))))
  await deleteDoc(bandDoc('recordFolders', entry.folderId, 'entries', entry.id))
  if (freed) addStorageBytes(-freed)
}

export function watchPersonalVideos(
  folderId: string,
  cb: (videos: PersonalVideo[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) { cb([]); return () => {} }
  return onSnapshot(bandCol('videoFolders', folderId, 'videos'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersonalVideo, 'id'>) }))
    list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    cb(list)
  }, (err) => onError?.(err))
}

export async function savePersonalVideo(video: PersonalVideo): Promise<void> {
  if (DEMO) return
  const { id, folderId, ...data } = video
  await setDoc(bandDoc('videoFolders', folderId, 'videos', id), data, { merge: true })
}

export async function updatePersonalVideoTitles(folderId: string, updates: { id: string; title: string }[]): Promise<void> {
  if (DEMO || !updates.length) return
  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = writeBatch(db)
    updates.slice(offset, offset + 400).forEach(({ id, title }) => {
      batch.set(bandDoc('videoFolders', folderId, 'videos', id), { title }, { merge: true })
    })
    await batch.commit()
  }
}

export async function deletePersonalVideo(folderId: string, videoId: string): Promise<void> {
  if (DEMO) return
  await deleteDoc(bandDoc('videoFolders', folderId, 'videos', videoId))
}

export function watchRecipeIngredients(
  folderId: string,
  cb: (ingredients: RecipeIngredient[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) { cb([]); return () => {} }
  return onSnapshot(bandCol('videoFolders', folderId, 'ingredients'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, folderId, ...(d.data() as Omit<RecipeIngredient, 'id' | 'folderId'>) }))
    list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    cb(list)
  }, (err) => onError?.(err))
}

export async function saveRecipeIngredient(ingredient: RecipeIngredient): Promise<void> {
  if (DEMO) return
  const { id, folderId, ...data } = ingredient
  await setDoc(bandDoc('videoFolders', folderId, 'ingredients', id), data, { merge: true })
}

export async function deleteRecipeIngredient(folderId: string, ingredientId: string): Promise<void> {
  if (DEMO) return
  await deleteDoc(bandDoc('videoFolders', folderId, 'ingredients', ingredientId))
}

/* ---------------- scores (bands/{band}/scores — 파트별 PDF·이미지, Storage) ---------------- */
export function watchScores(
  cb: (scores: Score[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) {
    cb([])
    return () => {}
  }
  return onSnapshot(
    bandCol('scores'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Score, 'id'>) }))
      list.sort((a, b) => b.createdAt - a.createdAt)
      cb(list)
    },
    (err) => {
      console.error('watchScores', err)
      onError?.(err)
    },
  )
}

/**
 * 악보 파일 하나를 Storage 에 올리고 {url, path, name} 반환.
 * path = bands/{band}/scores/{scoreId}/{i}-{안전한이름}
 * downloadName 을 주면 저장 시 그 이름으로 받아지도록 contentDisposition 을 붙이고, name 에도 담는다.
 */
export async function uploadScoreFile(
  scoreId: string,
  file: File,
  index: number,
  downloadName?: string,
): Promise<ScoreFile> {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60)
  const path = bandStoragePath('scores', scoreId, `${index}-${safe}`)
  const r = storageRef(storage, path)
  const metadata: { contentType?: string; contentDisposition?: string; cacheControl?: string } = {
    contentType: file.type || undefined,
    // 악보 파일은 업로드 후 바뀌지 않음 → 브라우저/CDN 장기 캐시로 재다운로드(egress) 절감
    cacheControl: 'public, max-age=31536000, immutable',
  }
  if (downloadName) metadata.contentDisposition = `inline; filename="${downloadName.replace(/"/g, '')}"`
  await uploadBytes(r, file, metadata)
  const url = await getDownloadURL(r)
  addStorageBytes(file.size) // 저장 용량 계량(측정용)
  return { url, path, name: downloadName || file.name, size: file.size }
}

export async function saveScore(s: Score): Promise<void> {
  if (DEMO) return
  const { id, ...rest } = s
  const data = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  )
  await setDoc(bandDoc('scores', id), data, { merge: true })
}

/** 악보 문서 + Storage 파일들을 함께 삭제 (파일 삭제 실패는 무시하고 문서는 지운다) */
export async function deleteScore(id: string, files: ScoreFile[]): Promise<void> {
  if (DEMO) return
  const freed = files.reduce((s, f) => s + (f.size ?? 0), 0)
  await Promise.allSettled(files.map((f) => deleteObject(storageRef(storage, f.path))))
  await deleteDoc(bandDoc('scores', id))
  if (freed) addStorageBytes(-freed) // 저장 용량 계량 되돌리기
}

/* ---------------- 사용량 계량 (멤버십 1-a: 측정만, 제한 없음) ---------------- */
function ymNow(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 현재 밴드 저장 용량(바이트) 증감. 계량 실패가 기능을 막지 않도록 오류는 무시. */
export function addStorageBytes(delta: number): void {
  if (DEMO || !getCurrentBand() || !delta) return
  updateDoc(bandDoc(), { storageBytes: increment(delta) }).catch(() => {})
}

/** 현재 밴드 이번 달 AI 호출 수 +1 (달 바뀌면 리셋). 실제 API 호출(캐시 미스)에서만 호출됨. */
export function bumpAiUsage(): void {
  if (DEMO || !getCurrentBand()) return
  const month = ymNow()
  const ref = bandDoc()
  runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists() ? (snap.get('aiUsage') as { month?: string } | undefined) : undefined
    if (cur && cur.month === month) tx.update(ref, { 'aiUsage.count': increment(1) })
    else tx.set(ref, { aiUsage: { month, count: 1 } }, { merge: true })
  }).catch(() => {})
}

/* ---------------- 기록 자동 동기화 설정 (bands/{band}/config/recImport) ---------------- */
/** 주 1회 예약 함수가 확인할 재생목록 id 목록 */
export async function getRecImportPlaylists(): Promise<string[]> {
  if (DEMO) return []
  const snap = await getDoc(bandDoc('config', 'recImport'))
  const ids = snap.exists() ? (snap.get('playlistIds') as unknown) : null
  return Array.isArray(ids) ? (ids as string[]) : []
}

/** 재생목록의 매주 자동 동기화 켜기/끄기 */
export async function setRecImportAuto(playlistId: string, on: boolean): Promise<void> {
  if (DEMO) return
  await setDoc(
    bandDoc('config', 'recImport'),
    { playlistIds: on ? arrayUnion(playlistId) : arrayRemove(playlistId) },
    { merge: true },
  )
}

export async function deletePlaylist(id: string): Promise<void> {
  if (DEMO) return demoDb.deletePlaylist(id)
  // 주의: 하위 tracks 문서는 클라이언트에서 개별 삭제해야 완전히 제거됨.
  // 재생목록 문서만 지워도 목록에서는 사라지므로 우선 문서만 삭제.
  await deleteDoc(bandDoc('playlists', id))
}

/* ---------------- tracks (bands/{band}/playlists/{id}/tracks/{trackId}) ---------------- */
export function watchTracks(
  playlistId: string,
  cb: (tracks: Track[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchTracks(playlistId, cb)
  return onSnapshot(
    bandCol('playlists', playlistId, 'tracks'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Track, 'id'>) }))
      // 사용자가 정한 순서(order)대로. order 없으면 담은 시각으로 대체
      list.sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt))
      cb(list)
    },
    (err) => {
      console.error('watchTracks', err)
      onError?.(err)
    },
  )
}

export async function saveTrack(playlistId: string, t: Track): Promise<void> {
  if (DEMO) return demoDb.saveTrack(playlistId, t)
  const { id, ...rest } = t
  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  await setDoc(bandDoc('playlists', playlistId, 'tracks', id), data)
}

export async function deleteTrack(playlistId: string, trackId: string): Promise<void> {
  if (DEMO) return demoDb.deleteTrack(playlistId, trackId)
  await deleteDoc(bandDoc('playlists', playlistId, 'tracks', trackId))
}

/**
 * 이 곡에 본인(uid)을 지정 파트로 참여시킨다.
 * participants.{uid} 단일 필드만 원자적으로 갱신하므로, 여러 명이 동시에 눌러도 서로 덮어쓰지 않는다.
 * (곡 문서는 이미 존재하므로 updateDoc 사용 — 없는 participants 맵도 자동 생성됨)
 */
export async function setTrackParticipation(
  playlistId: string,
  trackId: string,
  uid: string,
  part: TrackPart,
): Promise<void> {
  if (DEMO) return demoDb.setTrackParticipation(playlistId, trackId, uid, part)
  await updateDoc(bandDoc('playlists', playlistId, 'tracks', trackId), {
    [`participants.${uid}`]: part,
  })
}

/** 이 곡에서 본인(uid) 참여를 취소한다 (participants.{uid} 필드만 삭제). */
export async function clearTrackParticipation(
  playlistId: string,
  trackId: string,
  uid: string,
): Promise<void> {
  if (DEMO) return demoDb.clearTrackParticipation(playlistId, trackId, uid)
  await updateDoc(bandDoc('playlists', playlistId, 'tracks', trackId), {
    [`participants.${uid}`]: deleteField(),
  })
}

/* ---------------- 합주곡 셋리스트 (bands/{band}/events/{eventId}/setlist/{songId}) ---------------- */
/** 일정에 등록된 합주곡 구독 (합주 순서대로) */
export function watchSetlist(
  eventId: string,
  cb: (songs: SetlistSong[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchSetlist(eventId, cb)
  return onSnapshot(
    bandCol('events', eventId, 'setlist'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SetlistSong, 'id'>) }))
      list.sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt))
      cb(list)
    },
    (err) => {
      console.error('watchSetlist', err)
      onError?.(err)
    },
  )
}

/** 지정 날짜까지 완료된 합주 일정에 곡이 담긴 횟수를 곡별로 집계한다. */
export async function getPracticeSetlistCounts(throughDate: string, throughStart = '23:59'): Promise<Record<string, number>> {
  if (DEMO) return {}
  const eventSnap = await getDocs(query(bandCol('events'), where('date', '<=', throughDate)))
  const practiceIds = eventSnap.docs
    .filter((event) => {
      if (event.get('type') !== 'practice') return false
      const date = String(event.get('date') || '')
      const start = String(event.get('rehStart') || '00:00')
      return date < throughDate || (date === throughDate && start <= throughStart)
    })
    .map((event) => event.id)
  const setlists = await Promise.all(practiceIds.map((eventId) => getDocs(bandCol('events', eventId, 'setlist'))))
  const counts: Record<string, number> = {}
  for (const setlist of setlists) {
    const seen = new Set<string>()
    for (const song of setlist.docs) {
      const key = trackKeyForCount(String(song.get('playlistId') || ''), song.id)
      if (!seen.has(key)) counts[key] = (counts[key] ?? 0) + 1
      seen.add(key)
    }
  }
  return counts
}

function trackKeyForCount(playlistId: string, trackId: string): string {
  return `${playlistId}/${trackId}`
}

/** 재생목록의 곡을 이 일정의 합주곡으로 담는다 (문서 id = 원본 곡 id 이므로 중복 추가는 덮어쓰기) */
export async function addSetlistSong(eventId: string, song: SetlistSong): Promise<void> {
  if (DEMO) return demoDb.addSetlistSong(eventId, song)
  const { id, ...rest } = song
  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  await setDoc(bandDoc('events', eventId, 'setlist', id), data)
}

/**
 * 이미 담긴 곡의 필드를 갱신한다 (합주 순서 변경 등).
 * 문서 id 가 원본 곡 id 로 고정이라 addSetlistSong 과 같은 덮어쓰기 — 이름만 의도에 맞게 나눠 둔다.
 */
export const saveSetlistSong = addSetlistSong

export async function removeSetlistSong(eventId: string, songId: string): Promise<void> {
  if (DEMO) return demoDb.removeSetlistSong(eventId, songId)
  await deleteDoc(bandDoc('events', eventId, 'setlist', songId))
}

export function newId(): string {
  return 'e' + Math.random().toString(36).slice(2, 10)
}

/* ---------------- feedback (전역 — 밴드가 아니라 앱 개발자에게 가는 채널) ---------------- */
/** 제보 첨부 사진 업로드 → { url, path }. feedbackId 는 제출 전에 newId() 로 미리 만들어 넘긴다.
 *  blob 은 압축된 이미지(image.ts), name 은 저장용 파일명. */
export async function uploadFeedbackImage(
  feedbackId: string,
  blob: Blob,
  index: number,
  name: string,
): Promise<{ url: string; path: string }> {
  const safe = (name || 'image.jpg').replace(/[^\w.-]+/g, '_').slice(-40)
  const path = `feedback/${feedbackId}/${index}-${safe}`
  const r = storageRef(storage, path)
  await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' })
  const url = await getDownloadURL(r)
  return { url, path }
}

export async function submitFeedback(f: Feedback): Promise<void> {
  if (DEMO) return
  const { id, ...rest } = f
  await setDoc(doc(db, 'feedback', id), rest)
}

export function watchFeedback(
  cb: (list: Feedback[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) {
    cb([])
    return () => {}
  }
  return onSnapshot(
    collection(db, 'feedback'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, 'id'>) }))
      list.sort((a, b) => b.createdAt - a.createdAt) // 최근 제보 먼저
      cb(list)
    },
    (err) => {
      console.error('watchFeedback', err)
      onError?.(err)
    },
  )
}

/** 로그인 사용자가 자신이 보낸 의견과 개발자 답변을 확인하기 위한 목록. */
export function watchMyFeedback(
  uid: string,
  cb: (list: Feedback[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO || !uid) {
    cb([])
    return () => {}
  }
  return onSnapshot(
    query(collection(db, 'feedback'), where('createdBy', '==', uid)),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, 'id'>) }))
      list.sort((a, b) => b.createdAt - a.createdAt)
      cb(list)
    },
    (err) => onError?.(err),
  )
}

export function watchFeedbackReplies(
  feedbackId: string,
  cb: (list: FeedbackReply[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) {
    cb([])
    return () => {}
  }
  return onSnapshot(collection(db, 'feedback', feedbackId, 'replies'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackReply, 'id'>) }))
    list.sort((a, b) => a.createdAt - b.createdAt)
    cb(list)
  }, (err) => onError?.(err))
}

export async function uploadFeedbackReplyImage(
  feedbackId: string,
  replyId: string,
  blob: Blob,
  index: number,
  name: string,
): Promise<{ url: string; path: string }> {
  const safe = (name || 'image.jpg').replace(/[^\w.-]+/g, '_').slice(-40)
  const path = `feedback/${feedbackId}/replies/${replyId}/${index}-${safe}`
  const r = storageRef(storage, path)
  await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' })
  return { url: await getDownloadURL(r), path }
}

export async function submitFeedbackReply(feedbackId: string, reply: FeedbackReply): Promise<void> {
  if (DEMO) return
  const { id, ...data } = reply
  await setDoc(doc(db, 'feedback', feedbackId, 'replies', id), data)
}

export async function setFeedbackStatus(id: string, status: Feedback['status']): Promise<void> {
  if (DEMO) return
  await updateDoc(doc(db, 'feedback', id), { status })
}

export async function deleteFeedback(id: string, images?: { path: string }[]): Promise<void> {
  if (DEMO) return
  const replies = await getDocs(collection(db, 'feedback', id, 'replies'))
  await Promise.allSettled(replies.docs.flatMap((reply) => {
    const data = reply.data() as Omit<FeedbackReply, 'id'>
    return (data.images ?? []).map((im) => deleteObject(storageRef(storage, im.path)))
  }))
  if (images?.length) {
    await Promise.allSettled(images.map((im) => deleteObject(storageRef(storage, im.path))))
  }
  if (!replies.empty) {
    const batch = writeBatch(db)
    replies.docs.forEach((reply) => batch.delete(reply.ref))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'feedback', id))
}
