/**
 * Amici Band 푸시 알림 (FCM)
 * - notifyOnEventCreate: 일정 생성 시 전체 멤버에게 "새 일정 · 투표 요청"
 * - remindUndecided: (합주·공연 일정 한정) 아직 투표 안 한 미정 멤버에게 리마인더 — 앱에서 호출
 *
 * 배포: firebase deploy --only functions   (Blaze 요금제 필요)
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const webpush = require('web-push')

admin.initializeApp()
const db = admin.firestore()
const messaging = admin.messaging()
const webPushPublicKey = defineSecret('WEB_PUSH_PUBLIC_KEY')
const webPushPrivateKey = defineSecret('WEB_PUSH_PRIVATE_KEY')
const webPushSecrets = [webPushPublicKey, webPushPrivateKey]

// Firestore(서울)와 같은 리전
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

// 리마인더 허용 유형
const REMINDABLE_TYPES = ['practice', 'show']
const NOTIFIABLE_EVENT_FIELDS = [
  'title',
  'type',
  'date',
  'rehStart',
  'rehEnd',
  'placeId',
  'loc',
  'customPlace',
  'location',
  'note',
  'timetable',
]

function eventScheduleChanged(before, after) {
  return NOTIFIABLE_EVENT_FIELDS.some(
    (field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null),
  )
}

function valueChanged(before, after, field) {
  return JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)
}

function displayValue(value, fallback = '미정') {
  const text = String(value ?? '').trim()
  return text || fallback
}

async function eventPlaceName(data) {
  if (!data.placeId) return displayValue(data.loc)
  const place = await db.doc(`places/${data.placeId}`).get()
  return place.exists ? displayValue(place.get('name')) : '등록된 장소'
}

async function buildEventChangeSummary(before, after) {
  const changes = []
  if (valueChanged(before, after, 'date')) {
    changes.push(`날짜: ${displayValue(before.date)} → ${displayValue(after.date)}`)
  }
  if (valueChanged(before, after, 'rehStart') || valueChanged(before, after, 'rehEnd')) {
    changes.push(
      `시간: ${displayValue(before.rehStart)}~${displayValue(before.rehEnd)} → ` +
        `${displayValue(after.rehStart)}~${displayValue(after.rehEnd)}`,
    )
  }
  if (
    valueChanged(before, after, 'placeId') ||
    valueChanged(before, after, 'loc') ||
    valueChanged(before, after, 'customPlace') ||
    valueChanged(before, after, 'location')
  ) {
    const [beforePlace, afterPlace] = await Promise.all([
      eventPlaceName(before),
      eventPlaceName(after),
    ])
    changes.push(`장소: ${beforePlace} → ${afterPlace}`)
  }
  if (valueChanged(before, after, 'title')) {
    changes.push(`제목: ${displayValue(before.title)} → ${displayValue(after.title)}`)
  }
  if (valueChanged(before, after, 'type')) changes.push('일정 유형이 변경됐어요')
  if (valueChanged(before, after, 'note')) changes.push('일정 메모가 수정됐어요')
  if (valueChanged(before, after, 'timetable')) changes.push('타임테이블이 수정됐어요')

  const visible = changes.slice(0, 3)
  if (changes.length > visible.length) visible.push(`외 ${changes.length - visible.length}건`)
  const summary = visible.join(' · ') || '일정 관련 내용이 수정됐어요'
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary
}

/** 여러 멤버 문서에서 fcmTokens 를 모아 중복 제거 */
function collectTokens(memberDocs) {
  const tokens = []
  memberDocs.forEach((d) => {
    const t = d.get('fcmTokens')
    if (Array.isArray(t)) tokens.push(...t)
  })
  return [...new Set(tokens)]
}

function collectWebPushSubscriptions(memberDocs) {
  const subscriptions = []
  const seen = new Set()
  memberDocs.forEach((member) => {
    const values = member.get('webPushSubscriptions')
    if (!Array.isArray(values)) return
    values.forEach((subscription) => {
      if (!subscription || !subscription.endpoint || seen.has(subscription.endpoint)) return
      seen.add(subscription.endpoint)
      subscriptions.push({ memberRef: member.ref, subscription })
    })
  })
  return subscriptions
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

async function sendStandardWebPush(memberDocs, { title, body, eventId }) {
  const subscriptions = collectWebPushSubscriptions(memberDocs)
  if (!subscriptions.length) return 0

  webpush.setVapidDetails(
    'https://amicicalender.web.app',
    webPushPublicKey.value(),
    webPushPrivateKey.value(),
  )
  const payload = JSON.stringify({
    title,
    body,
    eventId: String(eventId || ''),
    url: eventId ? `/?event=${eventId}` : '/',
  })
  const results = await Promise.allSettled(
    subscriptions.map(({ subscription }) => webpush.sendNotification(subscription, payload)),
  )

  const staleByMember = new Map()
  let successCount = 0
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount += 1
      return
    }
    const statusCode = result.reason && result.reason.statusCode
    if (statusCode !== 404 && statusCode !== 410) return
    const { memberRef, subscription } = subscriptions[index]
    const stale = staleByMember.get(memberRef.path) || { memberRef, subscriptions: [] }
    stale.subscriptions.push(subscription)
    staleByMember.set(memberRef.path, stale)
  })

  if (staleByMember.size) {
    const batch = db.batch()
    staleByMember.forEach(({ memberRef, subscriptions: stale }) => {
      batch.update(memberRef, {
        webPushSubscriptions: admin.firestore.FieldValue.arrayRemove(...stale),
      })
    })
    await batch.commit().catch(() => {})
  }
  return successCount
}

async function sendAllPush(memberDocs, payload) {
  // 한 채널(FCM/웹푸시)이 실패해도 나머지는 발송되도록 allSettled 사용.
  // (Promise.all 이면 한쪽 예외로 전체가 '발송 실패'가 됐다.) 실패 원인은 로그로 남긴다.
  const [fcm, web] = await Promise.allSettled([
    sendPush(collectTokens(memberDocs), payload),
    sendStandardWebPush(memberDocs, payload),
  ])
  if (fcm.status === 'rejected') console.error('FCM 발송 실패:', fcm.reason)
  if (web.status === 'rejected') console.error('표준 웹푸시 발송 실패:', web.reason)
  const fcmSent = fcm.status === 'fulfilled' ? fcm.value : 0
  const webPushSent = web.status === 'fulfilled' ? web.value : 0
  return fcmSent + webPushSent
}

exports.notifyOnEventCreate = onDocumentCreated(
  { document: 'events/{eventId}', secrets: webPushSecrets },
  async (event) => {
  const data = event.data && event.data.data()
  if (!data) return
  const membersSnap = await db.collection('members').get()
  const isPractice = data.type === 'practice'
  const sent = await sendAllPush(membersSnap.docs, {
    title: isPractice
      ? `참석 투표 요청: ${data.title || '합주 일정'}`
      : `새 일정: ${data.title || '일정'}`,
    body: isPractice
      ? `${data.date || ''} 합주 일정이 추가됐어요. 참석 여부를 투표해 주세요.`
      : `${data.date || ''} 새 일정이 추가됐어요. 확인해 주세요.`,
    eventId: event.params.eventId,
  })
  console.info('event-create push complete', { eventId: event.params.eventId, sent })
  },
)

exports.notifyOnEventUpdate = onDocumentUpdated(
  { document: 'events/{eventId}', secrets: webPushSecrets },
  async (event) => {
    const before = event.data && event.data.before.data()
    const after = event.data && event.data.after.data()
    if (!before || !after || !eventScheduleChanged(before, after)) return
    if (!REMINDABLE_TYPES.includes(before.type) && !REMINDABLE_TYPES.includes(after.type)) return

    const changeSummary = await buildEventChangeSummary(before, after)
    const membersSnap = await db.collection('members').get()
    const isShow = after.type === 'show'
    const sent = await sendAllPush(membersSnap.docs, {
      title: `${isShow ? '공연' : '합주'} 일정 변경: ${after.title || '일정'}`,
      body: changeSummary,
      eventId: event.params.eventId,
    })
    console.info('event-update push complete', {
      eventId: event.params.eventId,
      eventType: after.type,
      changeSummary,
      sent,
    })
  },
)

exports.remindUndecided = onCall({ secrets: webPushSecrets }, async (req) => {
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
  const sent = await sendAllPush(undecided, {
    title: `투표 요청: ${ev.title || '일정'}`,
    body: '아직 참석 투표를 안 하셨어요. 참석 여부를 알려주세요!',
    eventId,
  })
  return { sent }
})
