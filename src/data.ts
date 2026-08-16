import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, fbApp, storage } from './firebase'
import { DEMO, demoDb } from './demo'
import type { Attendance, BandEvent, Member, Place, Playlist, Recording, Score, ScoreFile, SetlistSong, Track, TrackPart, WebPushSubscription } from './types'

const FUNCTIONS_REGION = 'asia-northeast3'

/* ---------------- members ---------------- */
export async function getMember(uid: string): Promise<Member | null> {
  const snap = await getDoc(doc(db, 'members', uid))
  return snap.exists() ? (snap.data() as Member) : null
}

export async function saveMember(m: Member): Promise<void> {
  await setDoc(doc(db, 'members', m.uid), m, { merge: true })
}

/** 전체 멤버 명단 구독 (미정 계산용) */
export function watchMembers(
  cb: (members: Member[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchMembers(cb)
  return onSnapshot(
    collection(db, 'members'),
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
  await setDoc(doc(db, 'members', uid), { fcmTokens: arrayUnion(token) }, { merge: true })
}

/** iPhone 홈 화면 PWA 등 표준 Web Push 구독을 멤버 문서에 저장 */
export async function saveWebPushSubscription(uid: string, subscription: WebPushSubscription): Promise<void> {
  if (DEMO) return
  await setDoc(
    doc(db, 'members', uid),
    { webPushSubscriptions: arrayUnion(subscription) },
    { merge: true },
  )
}

/** 아직 투표 안 한(미정) 멤버에게 투표 요청 푸시 — Cloud Function 호출. 발송 건수 반환 */
export async function remindUndecided(eventId: string): Promise<number> {
  if (DEMO || !fbApp) return 0
  const call = httpsCallable<{ eventId: string }, { sent: number }>(
    getFunctions(fbApp, FUNCTIONS_REGION),
    'remindUndecided',
  )
  const res = await call({ eventId })
  return res.data.sent
}

/* ---------------- events ---------------- */
export function watchEvents(
  cb: (events: BandEvent[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchEvents(cb)
  // 정렬은 클라이언트(Main)에서 하므로 Firestore orderBy 없이 단순 조회 → 복합 색인 불필요
  return onSnapshot(
    collection(db, 'events'),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BandEvent, 'id'>) })))
    },
    (err) => {
      console.error('watchEvents', err)
      onError?.(err)
    },
  )
}

export async function saveEvent(ev: BandEvent): Promise<void> {
  if (DEMO) return demoDb.saveEvent(ev)
  const { id, ...rest } = ev
  // undefined 필드는 Firestore가 거부하므로 제거
  const data = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  )
  // 전체 덮어쓰기(merge 아님) — 장소를 비우는 등 필드 제거가 반영되도록. 폼이 모든 필드를 제공함.
  await setDoc(doc(db, 'events', id), data)
}

export async function deleteEvent(id: string): Promise<void> {
  if (DEMO) return demoDb.deleteEvent(id)
  await deleteDoc(doc(db, 'events', id))
}

/** (공연) 연결 재생목록만 갱신 — playlistId 만 merge, null 이면 연결 해제 */
export async function setEventPlaylist(ev: BandEvent, playlistId: string | null): Promise<void> {
  if (DEMO) return demoDb.saveEvent({ ...ev, playlistId: playlistId ?? undefined })
  await setDoc(
    doc(db, 'events', ev.id),
    { playlistId: playlistId ?? deleteField() },
    { merge: true },
  )
}

/* ---------------- places ---------------- */
export function watchPlaces(
  cb: (places: Place[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchPlaces(cb)
  return onSnapshot(
    collection(db, 'places'),
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
  await setDoc(doc(db, 'places', id), data, { merge: true })
}

export async function deletePlace(id: string): Promise<void> {
  if (DEMO) return demoDb.deletePlace(id)
  await deleteDoc(doc(db, 'places', id))
}

/* ---------------- attendance (events/{id}/attendance/{uid}) ---------------- */
export function watchAttendance(
  eventId: string,
  cb: (list: Attendance[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchAttendance(eventId, cb)
  return onSnapshot(
    collection(db, 'events', eventId, 'attendance'),
    (snap) => {
      cb(snap.docs.map((d) => d.data() as Attendance))
    },
    (err) => {
      console.error('watchAttendance', err)
      onError?.(err)
    },
  )
}

export async function setAttendance(eventId: string, att: Attendance): Promise<void> {
  if (DEMO) return demoDb.setAttendance(eventId, att)
  // undefined 필드는 Firestore가 거부하므로 정리
  const clean: Attendance = { ...att }
  if (clean.status !== 'late') delete clean.arriveTime
  if (clean.status !== 'leave') delete clean.leaveTime
  if (!clean.note) delete clean.note
  await setDoc(doc(db, 'events', eventId, 'attendance', att.uid), clean)
}

export async function clearAttendance(eventId: string, uid: string): Promise<void> {
  if (DEMO) return demoDb.clearAttendance(eventId, uid)
  await deleteDoc(doc(db, 'events', eventId, 'attendance', uid))
}

/* ---------------- playlists (음악 재생목록) ---------------- */
export function watchPlaylists(
  cb: (playlists: Playlist[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchPlaylists(cb)
  return onSnapshot(
    collection(db, 'playlists'),
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
  await setDoc(doc(db, 'playlists', id), data, { merge: true })
}

/* ---------------- recordings (합주 녹음/영상 기록 — 링크 기반) ---------------- */
export function watchRecordings(
  cb: (recordings: Recording[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) {
    cb([]) // DEMO(가짜 데이터)에선 기록 없음 — 실제 데이터는 배포본에서만
    return () => {}
  }
  return onSnapshot(
    collection(db, 'recordings'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recording, 'id'>) }))
      // 최근 일자 우선, 같은 날짜면 최근 등록 순
      list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)))
      cb(list)
    },
    (err) => {
      console.error('watchRecordings', err)
      onError?.(err)
    },
  )
}

export async function saveRecording(r: Recording): Promise<void> {
  if (DEMO) return
  const { id, ...rest } = r
  // undefined 필드는 deleteField() 로 바꿔, 수정 시 값 지움(빈 메모·일정 연결 해제 등)이 반영되게 한다.
  // (merge:true 에서 필드를 그냥 빼면 기존 값이 남아 지워지지 않는다)
  const data = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  )
  await setDoc(doc(db, 'recordings', id), data, { merge: true })
}

export async function deleteRecording(id: string): Promise<void> {
  if (DEMO) return
  await deleteDoc(doc(db, 'recordings', id))
}

/* ---------------- scores (악보 — 파트별 PDF·이미지, Firebase Storage) ---------------- */
export function watchScores(
  cb: (scores: Score[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) {
    cb([])
    return () => {}
  }
  return onSnapshot(
    collection(db, 'scores'),
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
 * 악보 파일 하나를 Storage 에 올리고 {url, path, name} 반환. path = scores/{scoreId}/{i}-{안전한이름}
 * downloadName 을 주면 저장 시 그 이름으로 받아지도록 contentDisposition 을 붙이고, name 에도 담는다.
 */
export async function uploadScoreFile(
  scoreId: string,
  file: File,
  index: number,
  downloadName?: string,
): Promise<ScoreFile> {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60)
  const path = `scores/${scoreId}/${index}-${safe}`
  const r = storageRef(storage, path)
  const metadata: { contentType?: string; contentDisposition?: string } = {
    contentType: file.type || undefined,
  }
  if (downloadName) metadata.contentDisposition = `inline; filename="${downloadName.replace(/"/g, '')}"`
  await uploadBytes(r, file, metadata)
  const url = await getDownloadURL(r)
  return { url, path, name: downloadName || file.name }
}

export async function saveScore(s: Score): Promise<void> {
  if (DEMO) return
  const { id, ...rest } = s
  const data = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  )
  await setDoc(doc(db, 'scores', id), data, { merge: true })
}

/** 악보 문서 + Storage 파일들을 함께 삭제 (파일 삭제 실패는 무시하고 문서는 지운다) */
export async function deleteScore(id: string, files: ScoreFile[]): Promise<void> {
  if (DEMO) return
  await Promise.allSettled(files.map((f) => deleteObject(storageRef(storage, f.path))))
  await deleteDoc(doc(db, 'scores', id))
}

/* ---------------- 기록 자동 동기화 설정 (config/recImport) ---------------- */
/** 주 1회 예약 함수가 확인할 재생목록 id 목록 */
export async function getRecImportPlaylists(): Promise<string[]> {
  if (DEMO) return []
  const snap = await getDoc(doc(db, 'config', 'recImport'))
  const ids = snap.exists() ? (snap.get('playlistIds') as unknown) : null
  return Array.isArray(ids) ? (ids as string[]) : []
}

/** 재생목록의 매주 자동 동기화 켜기/끄기 */
export async function setRecImportAuto(playlistId: string, on: boolean): Promise<void> {
  if (DEMO) return
  await setDoc(
    doc(db, 'config', 'recImport'),
    { playlistIds: on ? arrayUnion(playlistId) : arrayRemove(playlistId) },
    { merge: true },
  )
}

export async function deletePlaylist(id: string): Promise<void> {
  if (DEMO) return demoDb.deletePlaylist(id)
  // 주의: 하위 tracks 문서는 클라이언트에서 개별 삭제해야 완전히 제거됨.
  // 재생목록 문서만 지워도 목록에서는 사라지므로 우선 문서만 삭제.
  await deleteDoc(doc(db, 'playlists', id))
}

/* ---------------- tracks (playlists/{id}/tracks/{trackId}) ---------------- */
export function watchTracks(
  playlistId: string,
  cb: (tracks: Track[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchTracks(playlistId, cb)
  return onSnapshot(
    collection(db, 'playlists', playlistId, 'tracks'),
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
  await setDoc(doc(db, 'playlists', playlistId, 'tracks', id), data)
}

export async function deleteTrack(playlistId: string, trackId: string): Promise<void> {
  if (DEMO) return demoDb.deleteTrack(playlistId, trackId)
  await deleteDoc(doc(db, 'playlists', playlistId, 'tracks', trackId))
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
  await updateDoc(doc(db, 'playlists', playlistId, 'tracks', trackId), {
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
  await updateDoc(doc(db, 'playlists', playlistId, 'tracks', trackId), {
    [`participants.${uid}`]: deleteField(),
  })
}

/* ---------------- 합주곡 셋리스트 (events/{eventId}/setlist/{songId}) ---------------- */
/** 일정에 등록된 합주곡 구독 (합주 순서대로) */
export function watchSetlist(
  eventId: string,
  cb: (songs: SetlistSong[]) => void,
  onError?: (e: Error) => void,
): () => void {
  if (DEMO) return demoDb.watchSetlist(eventId, cb)
  return onSnapshot(
    collection(db, 'events', eventId, 'setlist'),
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

/** 재생목록의 곡을 이 일정의 합주곡으로 담는다 (문서 id = 원본 곡 id 이므로 중복 추가는 덮어쓰기) */
export async function addSetlistSong(eventId: string, song: SetlistSong): Promise<void> {
  if (DEMO) return demoDb.addSetlistSong(eventId, song)
  const { id, ...rest } = song
  const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  await setDoc(doc(db, 'events', eventId, 'setlist', id), data)
}

/**
 * 이미 담긴 곡의 필드를 갱신한다 (합주 순서 변경 등).
 * 문서 id 가 원본 곡 id 로 고정이라 addSetlistSong 과 같은 덮어쓰기 — 이름만 의도에 맞게 나눠 둔다.
 */
export const saveSetlistSong = addSetlistSong

export async function removeSetlistSong(eventId: string, songId: string): Promise<void> {
  if (DEMO) return demoDb.removeSetlistSong(eventId, songId)
  await deleteDoc(doc(db, 'events', eventId, 'setlist', songId))
}

export function newId(): string {
  return 'e' + Math.random().toString(36).slice(2, 10)
}
