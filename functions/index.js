/**
 * Amici Band 푸시 알림 (FCM)
 * - notifyOnEventCreate: 일정 생성 시 전체 멤버에게 "새 일정 · 투표 요청"
 * - remindUndecided: (합주·공연 일정 한정) 아직 투표 안 한 미정 멤버에게 리마인더 — 앱에서 호출
 *
 * 배포: firebase deploy --only functions   (Blaze 요금제 필요)
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()
const messaging = admin.messaging()

// Firestore(서울)와 같은 리전
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

// 리마인더 허용 유형
const REMINDABLE_TYPES = ['practice', 'show']

/** 여러 멤버 문서에서 fcmTokens 를 모아 중복 제거 */
function collectTokens(memberDocs) {
  const tokens = []
  memberDocs.forEach((d) => {
    const t = d.get('fcmTokens')
    if (Array.isArray(t)) tokens.push(...t)
  })
  return [...new Set(tokens)]
}

/** 멀티캐스트 발송 + 무효 토큰 정리 */
async function sendPush(tokens, { title, body, eventId }) {
  if (!tokens.length) return 0
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { eventId: String(eventId || '') },
    webpush: {
      notification: { icon: '/logo.png', badge: '/logo.png' },
      fcmOptions: { link: eventId ? `/?event=${eventId}` : '/' },
    },
  })
  // 만료·무효 토큰 제거
  const invalid = []
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
      invalid.push(tokens[i])
    }
  })
  if (invalid.length) {
    const members = await db.collection('members').where('fcmTokens', 'array-contains-any', invalid.slice(0, 10)).get()
    const batch = db.batch()
    members.forEach((m) => {
      batch.update(m.ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid) })
    })
    await batch.commit().catch(() => {})
  }
  return res.successCount
}

exports.notifyOnEventCreate = onDocumentCreated('events/{eventId}', async (event) => {
  const data = event.data && event.data.data()
  if (!data) return
  const membersSnap = await db.collection('members').get()
  const tokens = collectTokens(membersSnap.docs)
  await sendPush(tokens, {
    title: `새 일정: ${data.title || '일정'}`,
    body: `${data.date || ''} · 참석 투표를 해주세요`,
    eventId: event.params.eventId,
  })
})

exports.remindUndecided = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')

  // 관리자만 투표 요청 발송 가능
  const callerSnap = await db.doc(`members/${req.auth.uid}`).get()
  if (!callerSnap.exists || callerSnap.get('admin') !== true) {
    throw new HttpsError('permission-denied', '관리자만 투표 요청을 보낼 수 있어요.')
  }

  const eventId = req.data && req.data.eventId
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId 가 필요해요.')

  const evSnap = await db.doc(`events/${eventId}`).get()
  if (!evSnap.exists) throw new HttpsError('not-found', '일정을 찾을 수 없어요.')
  const ev = evSnap.data()
  if (!REMINDABLE_TYPES.includes(ev.type)) {
    throw new HttpsError('failed-precondition', '리마인더는 합주·공연 일정에서만 보낼 수 있어요.')
  }

  const [membersSnap, attSnap] = await Promise.all([
    db.collection('members').get(),
    db.collection(`events/${eventId}/attendance`).get(),
  ])
  const voted = new Set(attSnap.docs.map((d) => d.id))
  const undecided = membersSnap.docs.filter((d) => !voted.has(d.id))
  const tokens = collectTokens(undecided)
  const sent = await sendPush(tokens, {
    title: `투표 요청: ${ev.title || '일정'}`,
    body: '아직 참석 투표를 안 하셨어요. 참석 여부를 알려주세요!',
    eventId,
  })
  return { sent }
})
