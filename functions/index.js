/**
 * Amici Band 푸시 알림 (FCM)
 * - notifyOnEventCreate: 일정 생성 시 전체 멤버에게 "새 일정 · 투표 요청"
 * - remindUndecided: (합주·공연 일정 한정) 아직 투표 안 한 미정 멤버에게 리마인더 — 앱에서 호출
 *
 * 배포: firebase deploy --only functions   (Blaze 요금제 필요)
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
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
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY')

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

// 버그 제보·의견이 올라오면 관리자에게만 푸시
exports.notifyOnFeedbackCreate = onDocumentCreated(
  { document: 'feedback/{fbId}', secrets: webPushSecrets },
  async (event) => {
    const data = event.data && event.data.data()
    if (!data) return
    const adminsSnap = await db.collection('members').where('admin', '==', true).get()
    if (adminsSnap.empty) return
    const typeLabel = data.type === 'bug' ? '버그' : data.type === 'idea' ? '개선' : '의견'
    const who = data.createdByName || '멤버'
    const text = String(data.text || '')
    const sent = await sendAllPush(adminsSnap.docs, {
      title: `새 ${typeLabel} 제보 · ${who}`,
      body: text.length > 60 ? text.slice(0, 60) + '…' : text,
    })
    console.info('feedback-create push complete', { fbId: event.params.fbId, sent })
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
  // 미정 = 아직 투표 안 함 + 명시적으로 '미정' 선택한 멤버
  const statusById = new Map(attSnap.docs.map((d) => [d.id, d.data().status]))
  const undecided = membersSnap.docs.filter(
    (d) => !statusById.has(d.id) || statusById.get(d.id) === 'undecided',
  )
  const sent = await sendAllPush(undecided, {
    title: `투표 요청: ${ev.title || '일정'}`,
    body: '아직 참석 투표를 안 하셨어요. 참석 여부를 알려주세요!',
    eventId,
  })
  return { sent }
})

/* ---------------- 유튜브 재생목록 → 기록 자동 동기화 (주 1회) ---------------- */
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
async function loadAllTracks() {
  const pls = await db.collection('playlists').get()
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
async function loadEventsByDate() {
  const snap = await db.collection('events').get()
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

// 매주 일요일 18:00(서울)에 config/recImport.playlistIds 의 재생목록을 확인해 새 영상을 기록에 추가
exports.syncRecordingsFromPlaylist = onSchedule(
  { schedule: 'every sunday 18:00', timeZone: 'Asia/Seoul', secrets: [youtubeApiKey] },
  async () => {
    const apiKey = youtubeApiKey.value()
    if (!apiKey) {
      console.error('YOUTUBE_API_KEY 시크릿이 없어요.')
      return
    }
    const cfg = await db.doc('config/recImport').get()
    const playlistIds = cfg.exists && Array.isArray(cfg.get('playlistIds')) ? cfg.get('playlistIds') : []
    if (!playlistIds.length) {
      console.info('자동 동기화할 재생목록이 없어요.')
      return
    }

    const recSnap = await db.collection('recordings').get()
    const existing = new Set()
    recSnap.forEach((d) => {
      const v = d.get('videoId')
      if (v) existing.add(v)
    })
    const tracks = await loadAllTracks()
    const eventsByDate = await loadEventsByDate()

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
        await db.collection('recordings').doc().set(rec)
        added++
      }
    }
    console.info('recordings auto-sync 완료', { playlists: playlistIds.length, added })
  },
)
