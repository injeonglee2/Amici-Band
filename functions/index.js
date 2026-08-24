/**
 * Amici Band 푸시 알림 (FCM) — 멀티밴드(bands/{bandId}/...) 스코프
 * - notifyOnEventCreate: 밴드 일정 생성 시 그 밴드 멤버에게 "새 일정 · 투표 요청"
 * - notifyOnEventUpdate: 밴드 일정(합주·공연) 변경 시 그 밴드 멤버에게 변경 요약
 * - notifyOnFeedbackCreate: 의견 제출 시 개발자에게만 (전역 feedback)
 * - remindUndecided: (합주·공연) 미정 멤버에게 리마인더 — 앱에서 밴드 admin 이 호출
 * - syncRecordingsFromPlaylist: 주 1회, 모든 밴드의 재생목록을 확인해 기록 자동 추가
 *
 * 배포: firebase deploy --only functions   (Blaze 요금제 필요)
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { setGlobalOptions } = require('firebase-functions/v2')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { MetricServiceClient } = require('@google-cloud/monitoring')
const webpush = require('web-push')
const crypto = require('crypto')

initializeApp()
const db = getFirestore()
const messaging = getMessaging()
const webPushPublicKey = defineSecret('WEB_PUSH_PUBLIC_KEY')
const webPushPrivateKey = defineSecret('WEB_PUSH_PRIVATE_KEY')
const webPushSecrets = [webPushPublicKey, webPushPrivateKey]
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY')
// 모듈 최상위에서 생성하면 배포 분석(로드) 시 자격증명 탐색으로 멈춰 타임아웃 → 지연 생성.
let _monitoringClient
function monitoringClient() {
  if (!_monitoringClient) _monitoringClient = new MetricServiceClient()
  return _monitoringClient
}

// Firestore(서울)와 같은 리전
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

/** 밴드 문서 참조 */
const bandRef = (bandId) => db.collection('bands').doc(bandId)

const healthSyncSessionRef = (hash) => db.collection('healthSyncSessions').doc(hash)
const healthSyncHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

/** Samsung Health 네이티브 리더가 사용할 10분짜리 일회용 업로드 세션. */
exports.createSamsungHealthSyncSession = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const bandId = String(req.data && req.data.bandId || '')
  const folderId = String(req.data && req.data.folderId || '')
  const range = String(req.data && req.data.range || '90d')
  if (!bandId || !folderId) throw new HttpsError('invalid-argument', '채널과 러닝 폴더가 필요해요.')
  if (!['90d', '1y', 'all'].includes(range)) throw new HttpsError('invalid-argument', '지원하지 않는 동기화 기간이에요.')

  const [bandSnap, folderSnap] = await Promise.all([
    bandRef(bandId).get(),
    bandRef(bandId).collection('recordFolders').doc(folderId).get(),
  ])
  if (!bandSnap.exists || bandSnap.get('ownerUid') !== req.auth.uid) {
    throw new HttpsError('permission-denied', '개인 채널 소유자만 동기화할 수 있어요.')
  }
  if (!folderSnap.exists || folderSnap.get('templateId') !== 'running') {
    throw new HttpsError('failed-precondition', '러닝 폴더를 찾을 수 없어요.')
  }

  const now = Date.now()
  let startTime = now - (range === '1y' ? 365 : 90) * 86400000
  let incremental = false
  if (range === 'all') {
    const latest = await bandRef(bandId).collection('recordFolders').doc(folderId)
      .collection('entries').orderBy('startTime', 'desc').limit(1).get()
    if (folderSnap.get('samsungHealthFullSyncAt') && !latest.empty) {
      // 수정되거나 늦게 들어온 운동을 놓치지 않도록 마지막 기록과 7일 겹친다.
      startTime = Math.max(Date.UTC(2000, 0, 1), Number(latest.docs[0].get('startTime')) - 7 * 86400000)
      incremental = true
    } else {
      startTime = Date.UTC(2000, 0, 1)
    }
  }

  const token = crypto.randomBytes(32).toString('base64url')
  await healthSyncSessionRef(healthSyncHash(token)).set({
    uid: req.auth.uid,
    bandId,
    folderId,
    range,
    uploadedCount: 0,
    createdAt: now,
    expiresAt: now + 30 * 60 * 1000,
  })
  return {
    token,
    uploadUrl: 'https://asia-northeast3-amicicalender.cloudfunctions.net/uploadSamsungHealthRuns',
    startTime,
    endTime: now,
    incremental,
  }
})

function cleanFinite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function cleanSamsungRun(run) {
  const startTime = cleanFinite(run && run.startTime)
  const endTime = cleanFinite(run && run.endTime)
  if (!run || !run.sourceId || !startTime || !endTime || endTime <= startTime) return null
  const cleaned = {
    source: 'samsung-health',
    sourceId: String(run.sourceId).slice(0, 200),
    startTime,
    endTime,
    durationSec: cleanFinite(run.durationSec) || Math.round((endTime - startTime) / 1000),
    syncedAt: Date.now(),
  }
  for (const key of ['distanceM', 'avgHr', 'maxHr', 'calories', 'steps', 'avgCadence', 'maxCadence', 'altitudeGain', 'vo2Max']) {
    const value = cleanFinite(run[key])
    if (value !== undefined) cleaned[key] = value
  }
  if (run.title) cleaned.title = String(run.title).slice(0, 100)
  if (Array.isArray(run.samples)) {
    const samples = run.samples.slice(0, 1200).map((sample) => {
      const t = cleanFinite(sample && sample.t)
      if (t === undefined || t < startTime - 60000 || t > endTime + 60000) return null
      const cleanedSample = { t }
      const hr = cleanFinite(sample && sample.hr)
      const speed = cleanFinite(sample && sample.speed)
      const cadence = cleanFinite(sample && sample.cadence)
      if (hr !== undefined && hr >= 30 && hr <= 260) cleanedSample.hr = hr
      if (speed !== undefined && speed >= 0 && speed <= 20) cleanedSample.speed = speed
      if (cadence !== undefined && cadence >= 0 && cadence <= 300) cleanedSample.cadence = cadence
      return Object.keys(cleanedSample).length > 1 ? cleanedSample : null
    }).filter(Boolean)
    if (samples.length) cleaned.samples = samples
  }
  return cleaned
}

/** Android Samsung Health Data SDK 리더가 선택한 러닝 요약을 Firestore에 저장한다. */
exports.uploadSamsungHealthRuns = onRequest(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return }
  const token = String(req.body && req.body.token || '')
  const sessionRef = healthSyncSessionRef(healthSyncHash(token))
  const sessionSnap = token ? await sessionRef.get() : null
  if (!sessionSnap || !sessionSnap.exists || sessionSnap.get('expiresAt') < Date.now()) {
    res.status(401).json({ error: 'expired-session' }); return
  }
  const runs = Array.isArray(req.body && req.body.runs)
    ? req.body.runs.slice(0, 100).map(cleanSamsungRun).filter(Boolean)
    : []
  const complete = req.body && req.body.complete === true
  const { bandId, folderId, uid, range } = sessionSnap.data()
  const batch = db.batch()
  runs.forEach((run) => {
    const id = crypto.createHash('sha256').update(`${uid}:${run.sourceId}`).digest('hex').slice(0, 32)
    batch.set(bandRef(bandId).collection('recordFolders').doc(folderId).collection('entries').doc(id), run, { merge: true })
  })
  if (complete) {
    if (range === 'all') {
      batch.set(bandRef(bandId).collection('recordFolders').doc(folderId), {
        samsungHealthFullSyncAt: Date.now(),
      }, { merge: true })
    }
    batch.delete(sessionRef)
  } else {
    batch.update(sessionRef, {
      uploadedCount: FieldValue.increment(runs.length),
      expiresAt: Date.now() + 30 * 60 * 1000,
    })
  }
  await batch.commit()
  res.status(200).json({ imported: runs.length, complete })
})

// 소유자 전용: Cloud Monitoring의 Firestore 과금 기준 지표를 최근 N일 일별로 집계한다.
exports.getBillingUsageStats = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const email = String((req.auth.token && req.auth.token.email) || '').toLowerCase()
  if (email !== DEVELOPER_EMAIL) throw new HttpsError('permission-denied', '앱 소유자만 볼 수 있어요.')

  const days = Math.min(90, Math.max(7, Number(req.data && req.data.days) || 30))
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) throw new HttpsError('internal', '프로젝트 정보를 확인할 수 없어요.')
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - days + 1))
  const metrics = {
    reads: 'firestore.googleapis.com/document/read_count',
    writes: 'firestore.googleapis.com/document/write_count',
    deletes: 'firestore.googleapis.com/document/delete_count',
  }

  async function dailyMetric(metricType, aligner = 'ALIGN_SUM') {
    const [series] = await monitoringClient().listTimeSeries({
      name: monitoringClient().projectPath(projectId),
      filter: `metric.type = "${metricType}"`,
      interval: {
        startTime: { seconds: Math.floor(start.getTime() / 1000) },
        endTime: { seconds: Math.floor(end.getTime() / 1000) },
      },
      view: 'FULL',
      aggregation: {
        alignmentPeriod: { seconds: 86400 },
        perSeriesAligner: aligner,
        crossSeriesReducer: 'REDUCE_SUM',
      },
    })
    const values = new Map()
    for (const item of series) for (const point of item.points || []) {
      const rawSeconds = point.interval && point.interval.endTime && point.interval.endTime.seconds
      const seconds = typeof rawSeconds === 'number' ? rawSeconds : Number(rawSeconds && rawSeconds.toString())
      if (!seconds) continue
      const date = new Date(seconds * 1000 - 1).toISOString().slice(0, 10)
      const raw = point.value && (point.value.int64Value ?? point.value.doubleValue)
      values.set(date, (values.get(date) || 0) + Number(raw || 0))
    }
    return values
  }

  try {
    const [reads, writes, deletes, storage] = await Promise.all([
      ...Object.values(metrics).map((metric) => dailyMetric(metric)),
      dailyMetric('storage.googleapis.com/storage/total_bytes', 'ALIGN_MAX').catch((error) => {
        console.error('storage total_bytes unavailable', error)
        return new Map()
      }),
    ])
    const rows = []
    let lastStorageBytes = 0
    for (let i = 0; i < days; i++) {
      const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
      if (storage.has(date)) lastStorageBytes = storage.get(date) || 0
      rows.push({ date, reads: reads.get(date) || 0, writes: writes.get(date) || 0, deletes: deletes.get(date) || 0, storageBytes: lastStorageBytes })
    }
    return { rows, generatedAt: Date.now(), timezone: 'UTC', source: 'Cloud Monitoring', storageAvailable: storage.size > 0 }
  } catch (error) {
    console.error('getBillingUsageStats', error)
    throw new HttpsError('internal', 'Cloud Monitoring 사용량을 불러오지 못했어요. Monitoring Viewer 권한을 확인해 주세요.')
  }
})

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

async function eventPlaceName(data, bandId) {
  if (!data.placeId) return displayValue(data.loc)
  const place = await bandRef(bandId).collection('places').doc(data.placeId).get()
  return place.exists ? displayValue(place.get('name')) : '등록된 장소'
}

async function buildEventChangeSummary(before, after, bandId) {
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
      eventPlaceName(before, bandId),
      eventPlaceName(after, bandId),
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

/** 멀티캐스트 발송 + 무효 토큰 정리 (토큰은 어느 밴드 멤버 문서에나 있을 수 있어 collectionGroup 로 정리) */
async function sendPush(tokens, { title, body, eventId }) {
  if (!tokens.length) return { sent: 0, failed: 0 }
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
    const members = await db.collectionGroup('members').where('fcmTokens', 'array-contains-any', invalid.slice(0, 10)).get()
    const batch = db.batch()
    members.forEach((m) => {
      batch.update(m.ref, { fcmTokens: FieldValue.arrayRemove(...invalid) })
    })
    await batch.commit().catch(() => {})
  }
  return { sent: res.successCount, failed: res.failureCount }
}

async function sendStandardWebPush(memberDocs, { title, body, eventId }) {
  const subscriptions = collectWebPushSubscriptions(memberDocs)
  if (!subscriptions.length) return { sent: 0, failed: 0 }

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
        webPushSubscriptions: FieldValue.arrayRemove(...stale),
      })
    })
    await batch.commit().catch(() => {})
  }
  return { sent: successCount, failed: results.length - successCount }
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
  const fcmTokens = collectTokens(memberDocs)
  const webPushSubscriptions = collectWebPushSubscriptions(memberDocs)
  const registeredMembers = memberDocs.filter((member) => {
    const tokens = member.get('fcmTokens')
    const subscriptions = member.get('webPushSubscriptions')
    return (Array.isArray(tokens) && tokens.length > 0) ||
      (Array.isArray(subscriptions) && subscriptions.length > 0)
  }).length
  const fcmResult = fcm.status === 'fulfilled'
    ? fcm.value
    : { sent: 0, failed: fcmTokens.length }
  const webResult = web.status === 'fulfilled'
    ? web.value
    : { sent: 0, failed: webPushSubscriptions.length }
  return {
    sent: fcmResult.sent + webResult.sent,
    failed: fcmResult.failed + webResult.failed,
    registeredMembers,
    fcmTokens: fcmTokens.length,
    webPushSubscriptions: webPushSubscriptions.length,
  }
}

exports.notifyOnEventCreate = onDocumentCreated(
  { document: 'bands/{bandId}/events/{eventId}', secrets: webPushSecrets },
  async (event) => {
  const data = event.data && event.data.data()
  if (!data) return
  const { bandId, eventId } = event.params
  const membersSnap = await bandRef(bandId).collection('members').get()
  const isPractice = data.type === 'practice'
  const delivery = await sendAllPush(membersSnap.docs, {
    title: isPractice
      ? `참석 투표 요청: ${data.title || '합주 일정'}`
      : `새 일정: ${data.title || '일정'}`,
    body: isPractice
      ? `${data.date || ''} 합주 일정이 추가됐어요. 참석 여부를 투표해 주세요.`
      : `${data.date || ''} 새 일정이 추가됐어요. 확인해 주세요.`,
    eventId,
  })
  console.info('event-create push complete', { bandId, eventId, delivery })
  },
)

exports.notifyOnEventUpdate = onDocumentUpdated(
  { document: 'bands/{bandId}/events/{eventId}', secrets: webPushSecrets },
  async (event) => {
    const before = event.data && event.data.before.data()
    const after = event.data && event.data.after.data()
    if (!before || !after || !eventScheduleChanged(before, after)) return
    if (!REMINDABLE_TYPES.includes(before.type) && !REMINDABLE_TYPES.includes(after.type)) return

    const { bandId, eventId } = event.params
    const changeSummary = await buildEventChangeSummary(before, after, bandId)
    const membersSnap = await bandRef(bandId).collection('members').get()
    const isShow = after.type === 'show'
    const delivery = await sendAllPush(membersSnap.docs, {
      title: `${isShow ? '공연' : '합주'} 일정 변경: ${after.title || '일정'}`,
      body: changeSummary,
      eventId,
    })
    console.info('event-update push complete', {
      bandId,
      eventId,
      eventType: after.type,
      changeSummary,
      delivery,
    })
  },
)

// 버그 제보·의견이 올라오면 개발자에게만 푸시 (앱 최상위 권한자, 전역 feedback)
const DEVELOPER_EMAIL = 'kkd00055@gmail.com'
exports.notifyOnFeedbackCreate = onDocumentCreated(
  { document: 'feedback/{fbId}', secrets: webPushSecrets },
  async (event) => {
    const data = event.data && event.data.data()
    if (!data) return
    // 개발자의 멤버 문서는 어느 밴드에나 있을 수 있어 collectionGroup 로 찾는다
    const devSnap = await db.collectionGroup('members').where('email', '==', DEVELOPER_EMAIL).get()
    if (devSnap.empty) return
    const typeLabel = data.type === 'bug' ? '버그' : data.type === 'idea' ? '개선' : '의견'
    const who = data.createdByName || '멤버'
    const text = String(data.text || '')
    const delivery = await sendAllPush(devSnap.docs, {
      title: `새 ${typeLabel} 제보 · ${who}`,
      body: text.length > 60 ? text.slice(0, 60) + '…' : text,
    })
    console.info('feedback-create push complete', { fbId: event.params.fbId, delivery })
  },
)

exports.remindUndecided = onCall({ secrets: webPushSecrets }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')

  const bandId = req.data && req.data.bandId
  const eventId = req.data && req.data.eventId
  if (!bandId) throw new HttpsError('invalid-argument', 'bandId 가 필요해요.')
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId 가 필요해요.')

  // 그 밴드의 관리자만 투표 요청 발송 가능
  const callerSnap = await bandRef(bandId).collection('members').doc(req.auth.uid).get()
  if (!callerSnap.exists || callerSnap.get('admin') !== true) {
    throw new HttpsError('permission-denied', '관리자만 투표 요청을 보낼 수 있어요.')
  }

  const evSnap = await bandRef(bandId).collection('events').doc(eventId).get()
  if (!evSnap.exists) throw new HttpsError('not-found', '일정을 찾을 수 없어요.')
  const ev = evSnap.data()
  if (!REMINDABLE_TYPES.includes(ev.type)) {
    throw new HttpsError('failed-precondition', '리마인더는 합주·공연 일정에서만 보낼 수 있어요.')
  }

  const [membersSnap, attSnap] = await Promise.all([
    bandRef(bandId).collection('members').get(),
    bandRef(bandId).collection('events').doc(eventId).collection('attendance').get(),
  ])
  // 미정 = 아직 투표 안 함 + 명시적으로 '미정' 선택한 멤버
  const statusById = new Map(attSnap.docs.map((d) => [d.id, d.data().status]))
  const undecided = membersSnap.docs.filter(
    (d) => !statusById.has(d.id) || statusById.get(d.id) === 'undecided',
  )
  const delivery = await sendAllPush(undecided, {
    title: `투표 요청: ${ev.title || '일정'}`,
    body: '아직 참석 투표를 안 하셨어요. 참석 여부를 알려주세요!',
    eventId,
  })
  const result = { undecided: undecided.length, ...delivery }
  console.info('undecided-reminder push complete', { bandId, eventId, ...result })
  return result
})

/* ---------------- 밴드 생성·가입·초대코드 (멀티밴드 2단계) ---------------- */
const MEMBER_CAP = 5 // 밴드 기본 가입 인원 상한 (unlimited 밴드는 면제)

// 사람이 부르기 쉬운 코드(혼동 문자 제외) — ABC-DEF
function genCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]
  return s.slice(0, 3) + '-' + s.slice(3)
}
async function uniqueCode() {
  for (let i = 0; i < 12; i++) {
    const c = genCode()
    const d = await db.collection('inviteCodes').doc(c).get()
    if (!d.exists) return c
  }
  throw new HttpsError('internal', '코드 생성에 실패했어요. 다시 시도해 주세요.')
}

// 새 채널 생성 — 일반 사용자는 1개, 앱 소유자만 여러 개인 채널을 만들 수 있다.
exports.createBand = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const uid = req.auth.uid
  const email = (req.auth.token && req.auth.token.email) || ''
  const name = String((req.data && req.data.name) || '').trim()
  const requestedTemplate = String((req.data && req.data.templateId) || 'personal')
  if (!['personal', 'gathering'].includes(requestedTemplate)) {
    throw new HttpsError('failed-precondition', '개인 또는 공동 채널만 새로 만들 수 있어요.')
  }
  const templateId = requestedTemplate
  if (!name) throw new HttpsError('invalid-argument', '채널 이름을 입력해 주세요.')

  const userDoc = await db.collection('users').doc(uid).get()
  const isDeveloper = email.toLowerCase() === DEVELOPER_EMAIL
  const currentBandId = userDoc.exists ? userDoc.get('bandId') : null
  if (currentBandId && !isDeveloper) {
    throw new HttpsError('failed-precondition', '일반 사용자는 채널을 하나만 소유하거나 참여할 수 있어요.')
  }

  const bandId = db.collection('bands').doc().id
  const code = templateId === 'personal' ? null : await uniqueCode()
  const now = Date.now()
  let reusableProfile = {
    name: userDoc.exists ? String(userDoc.get('profileName') || '').trim() : '',
    part: userDoc.exists ? userDoc.get('profilePart') : null,
  }
  if (!reusableProfile.name && currentBandId) {
    const previousMember = await bandRef(currentBandId).collection('members').doc(uid).get()
    if (previousMember.exists) {
      reusableProfile = {
        name: String(previousMember.get('name') || '').trim(),
        part: previousMember.get('part') || null,
      }
    }
  }
  const batch = db.batch()
  batch.set(db.collection('bands').doc(bandId), {
    name, templateId, ownerUid: uid, unlimited: false, memberCount: 1, createdAt: now,
  })
  batch.set(db.collection('bands').doc(bandId).collection('members').doc(uid), {
    uid, email, admin: true, createdAt: now,
    ...(reusableProfile.name ? { name: reusableProfile.name } : {}),
    ...(reusableProfile.part ? { part: reusableProfile.part } : {}),
  })
  if (code) batch.set(db.collection('inviteCodes').doc(code), { bandId, active: true, createdAt: now })
  const knownBandIds = currentBandId ? [currentBandId, bandId] : [bandId]
  batch.set(db.collection('users').doc(uid), {
    bandId,
    bandIds: FieldValue.arrayUnion(...knownBandIds),
    ...(reusableProfile.name ? { profileName: reusableProfile.name } : {}),
    ...(reusableProfile.part ? { profilePart: reusableProfile.part } : {}),
    createdAt: userDoc.exists ? (userDoc.get('createdAt') || now) : now,
  }, { merge: true })
  await batch.commit()
  return code ? { bandId, code } : { bandId }
})

// 초대 코드로 가입 — 정원(5명, unlimited 면제) 확인 후 멤버로 추가. (1인 1밴드)
exports.joinBand = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const uid = req.auth.uid
  const email = (req.auth.token && req.auth.token.email) || ''
  const code = String((req.data && req.data.code) || '').trim().toUpperCase()
  if (!code) throw new HttpsError('invalid-argument', '초대 코드를 입력해 주세요.')

  const userDoc = await db.collection('users').doc(uid).get()
  if (userDoc.exists && userDoc.get('bandId')) {
    throw new HttpsError('failed-precondition', '이미 밴드에 속해 있어요. (지금은 1인 1밴드)')
  }

  const codeSnap = await db.collection('inviteCodes').doc(code).get()
  if (!codeSnap.exists || codeSnap.get('active') !== true) {
    throw new HttpsError('not-found', '유효하지 않은 코드예요.')
  }
  const bandId = codeSnap.get('bandId')

  const bandRefX = db.collection('bands').doc(bandId)
  await db.runTransaction(async (tx) => {
    const band = await tx.get(bandRefX)
    if (!band.exists) throw new HttpsError('not-found', '밴드를 찾을 수 없어요.')
    if (band.get('templateId') === 'personal') {
      throw new HttpsError('permission-denied', '개인 채널에는 참여할 수 없어요.')
    }
    const already = await tx.get(bandRefX.collection('members').doc(uid))
    if (already.exists) return // 재시도 안전
    const unlimited = band.get('unlimited') === true
    const count = band.get('memberCount') || 0
    if (!unlimited && count >= MEMBER_CAP) {
      throw new HttpsError('resource-exhausted', `정원이 찼어요. (최대 ${MEMBER_CAP}명)`)
    }
    tx.set(bandRefX.collection('members').doc(uid), { uid, email, admin: false, createdAt: Date.now() })
    tx.update(bandRefX, { memberCount: count + 1 })
    tx.set(db.collection('users').doc(uid), { bandId, bandIds: [bandId], createdAt: Date.now() }, { merge: true })
  })
  return { bandId }
})

// 초대 코드 회전 — 그 밴드 관리자만. 기존 활성 코드는 비활성화하고 새 코드 발급.
exports.rotateInviteCode = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const bandId = String((req.data && req.data.bandId) || '')
  if (!bandId) throw new HttpsError('invalid-argument', 'bandId 가 필요해요.')
  const me = await bandRef(bandId).collection('members').doc(req.auth.uid).get()
  if (!me.exists || me.get('admin') !== true) {
    throw new HttpsError('permission-denied', '관리자만 코드를 재발급할 수 있어요.')
  }
  const channel = await bandRef(bandId).get()
  if (channel.get('templateId') === 'personal') {
    throw new HttpsError('failed-precondition', '개인 채널은 초대 코드를 발급하지 않아요.')
  }
  const active = await db.collection('inviteCodes').where('bandId', '==', bandId).where('active', '==', true).get()
  const code = await uniqueCode()
  const batch = db.batch()
  active.forEach((d) => batch.update(d.ref, { active: false }))
  batch.set(db.collection('inviteCodes').doc(code), { bandId, active: true, createdAt: Date.now() })
  await batch.commit()
  return { code }
})

// 멤버 강퇴 — 그 밴드 관리자만. 소유자·본인은 대상 불가.
exports.kickMember = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const bandId = String((req.data && req.data.bandId) || '')
  const uid = String((req.data && req.data.uid) || '')
  if (!bandId || !uid) throw new HttpsError('invalid-argument', 'bandId·uid 가 필요해요.')
  const me = await bandRef(bandId).collection('members').doc(req.auth.uid).get()
  if (!me.exists || me.get('admin') !== true) throw new HttpsError('permission-denied', '관리자만 내보낼 수 있어요.')
  if (uid === req.auth.uid) throw new HttpsError('failed-precondition', '본인은 여기서 내보낼 수 없어요.')
  const band = await bandRef(bandId).get()
  if (band.get('ownerUid') === uid) throw new HttpsError('failed-precondition', '소유자는 내보낼 수 없어요.')
  await db.runTransaction(async (tx) => {
    const mref = bandRef(bandId).collection('members').doc(uid)
    const m = await tx.get(mref)
    if (!m.exists) return
    const count = band.get('memberCount') || 1
    tx.delete(mref)
    tx.update(bandRef(bandId), { memberCount: Math.max(0, count - 1) })
    tx.delete(db.collection('users').doc(uid))
  })
  return { ok: true }
})

// 관리자 지정/해제 — 그 밴드 관리자만. 소유자의 관리자 권한은 해제 불가.
exports.setMemberAdmin = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요해요.')
  const bandId = String((req.data && req.data.bandId) || '')
  const uid = String((req.data && req.data.uid) || '')
  const makeAdmin = (req.data && req.data.admin) === true
  if (!bandId || !uid) throw new HttpsError('invalid-argument', 'bandId·uid 가 필요해요.')
  const me = await bandRef(bandId).collection('members').doc(req.auth.uid).get()
  if (!me.exists || me.get('admin') !== true) throw new HttpsError('permission-denied', '관리자만 변경할 수 있어요.')
  const band = await bandRef(bandId).get()
  if (band.get('ownerUid') === uid && !makeAdmin) {
    throw new HttpsError('failed-precondition', '소유자의 관리자 권한은 해제할 수 없어요.')
  }
  await bandRef(bandId).collection('members').doc(uid).update({ admin: makeAdmin })
  return { ok: true }
})

/* ---------------- 유튜브 재생목록 → 기록 자동 동기화 (주 1회, 전 밴드) ---------------- */
function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')
}
function dateFromTitle(title) {
  const m = String(title || '').match(/\d{8}|\d{6}/)
  if (!m) return null
  const s = m[0]
  const y = s.length === 8 ? +s.slice(0, 4) : 2000 + +s.slice(0, 2)
  const mo = +s.slice(s.length - 4, s.length - 2)
  const d = +s.slice(s.length - 2)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function musicFromTitle(title, tracks) {
  const t = normTitle(String(title || '').replace(/\d{8}|\d{6}/, ''))
  if (t.length < 2) return null
  let best = null
  let bestLen = 0
  for (const tr of tracks) {
    const tn = normTitle(tr.title)
    if (tn.length >= 2 && t.includes(tn) && tn.length > bestLen) {
      best = tr
      bestLen = tn.length
    }
  }
  return best
}
// 구글 번역 API v2 — 실패 시 '' (키가 YouTube 전용이면 여기서 조용히 실패해도 앱은 정상)
async function translateText(text, target, apiKey) {
  const q = String(text || '').trim()
  if (!q || !apiKey) return ''
  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, target, format: 'text' }),
    })
    if (!res.ok) return ''
    const j = await res.json()
    return (j && j.data && j.data.translations && j.data.translations[0] && j.data.translations[0].translatedText) || ''
  } catch (e) {
    console.error('번역 실패', e)
    return ''
  }
}
// 문자열로 못 찾으면 제목을 en·ko 로 번역해 다시 매칭(언어가 달라도 유추)
async function musicFromTitleSmart(title, tracks, apiKey) {
  const direct = musicFromTitle(title, tracks)
  if (direct) return direct
  const base = String(title || '').replace(/\d{8}|\d{6}/, '').trim()
  if (base.length < 2 || tracks.length === 0) return null
  const [en, ko] = await Promise.all([translateText(base, 'en', apiKey), translateText(base, 'ko', apiKey)])
  for (const v of [en, ko]) {
    if (!v) continue
    const m = musicFromTitle(v, tracks)
    if (m) return m
  }
  return null
}
async function fetchPlaylistVideos(playlistId, apiKey) {
  const out = []
  let pageToken = ''
  for (let page = 0; page < 20; page++) {
    const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    u.searchParams.set('part', 'snippet')
    u.searchParams.set('maxResults', '50')
    u.searchParams.set('playlistId', playlistId)
    u.searchParams.set('key', apiKey)
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const res = await fetch(u)
    if (!res.ok) {
      console.error('playlistItems 실패', playlistId, res.status)
      break
    }
    const data = await res.json()
    for (const it of data.items || []) {
      const sn = it.snippet || {}
      const vid = sn.resourceId && sn.resourceId.videoId
      const title = sn.title || ''
      if (!vid || !title || title === 'Private video' || title === 'Deleted video') continue
      out.push({ videoId: vid, title, publishedAt: (sn.publishedAt || '').slice(0, 10), description: sn.description || '' })
    }
    pageToken = data.nextPageToken || ''
    if (!pageToken) break
  }
  return out
}
async function loadAllTracks(bRef) {
  const pls = await bRef.collection('playlists').get()
  const tracks = []
  for (const p of pls.docs) {
    const ts = await p.ref.collection('tracks').get()
    ts.forEach((t) =>
      tracks.push({
        id: t.id,
        title: t.get('title') || '',
        artist: t.get('artist') || '',
        playlistId: p.id,
        playlistName: p.get('name') || '',
      }),
    )
  }
  return tracks
}
// 날짜별 일정 목록 — 그 날짜에 일정이 하나면 기록에 자동 연결하기 위함
async function loadEventsByDate(bRef) {
  const snap = await bRef.collection('events').get()
  const byDate = new Map()
  snap.forEach((d) => {
    const date = d.get('date')
    if (!date) return
    const arr = byDate.get(date) || []
    arr.push({ id: d.id, title: d.get('title') || '' })
    byDate.set(date, arr)
  })
  return byDate
}

// 한 밴드의 재생목록을 확인해 새 영상을 그 밴드 기록에 추가
async function syncBandRecordings(bRef, apiKey) {
  const cfg = await bRef.collection('config').doc('recImport').get()
  const playlistIds = cfg.exists && Array.isArray(cfg.get('playlistIds')) ? cfg.get('playlistIds') : []
  if (!playlistIds.length) return 0

  const recSnap = await bRef.collection('recordings').get()
  const existing = new Set()
  recSnap.forEach((d) => {
    const v = d.get('videoId')
    if (v) existing.add(v)
  })
  const tracks = await loadAllTracks(bRef)
  const eventsByDate = await loadEventsByDate(bRef)

  let added = 0
  for (const pid of playlistIds) {
    const vids = await fetchPlaylistVideos(pid, apiKey)
    for (const v of vids) {
      if (existing.has(v.videoId)) continue
      existing.add(v.videoId)
      const m = await musicFromTitleSmart(v.title, tracks, apiKey)
      const recDate = dateFromTitle(v.title) || v.publishedAt || new Date().toISOString().slice(0, 10)
      const rec = {
        title: v.title,
        date: recDate,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        videoId: v.videoId,
        thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
        addedBy: 'system',
        addedByName: '자동 가져오기',
        createdAt: Date.now(),
      }
      const evs = eventsByDate.get(recDate) || []
      if (evs.length === 1) {
        rec.eventId = evs[0].id
        rec.eventTitle = evs[0].title
      }
      if (m) {
        rec.playlistId = m.playlistId
        rec.playlistName = m.playlistName
        rec.trackId = m.id
        rec.trackTitle = m.title
        if (m.artist) rec.trackArtist = m.artist
      }
      // 크레딧(파트별 멤버)은 클라이언트 Firebase AI Logic 로 채운다(기록을 열 때 백필). 서버는 생략.
      await bRef.collection('recordings').doc().set(rec)
      added++
    }
  }
  return added
}

// 매주 일요일 18:00(서울)에 모든 밴드의 config/recImport.playlistIds 를 확인해 새 영상을 기록에 추가
exports.syncRecordingsFromPlaylist = onSchedule(
  { schedule: 'every sunday 18:00', timeZone: 'Asia/Seoul', secrets: [youtubeApiKey] },
  async () => {
    const apiKey = youtubeApiKey.value()
    if (!apiKey) {
      console.error('YOUTUBE_API_KEY 시크릿이 없어요.')
      return
    }
    const bands = await db.collection('bands').get()
    let totalAdded = 0
    for (const band of bands.docs) {
      try {
        totalAdded += await syncBandRecordings(band.ref, apiKey)
      } catch (e) {
        console.error('밴드 동기화 실패', band.id, e)
      }
    }
    console.info('recordings auto-sync 완료', { bands: bands.size, added: totalAdded })
  },
)
