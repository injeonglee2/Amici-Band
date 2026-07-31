import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db, fbApp } from './firebase'
import { DEMO, demoDb } from './demo'
import type { Attendance, BandEvent, Member, Place } from './types'

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

export function newId(): string {
  return 'e' + Math.random().toString(36).slice(2, 10)
}
