// 투표가 열린 추천곡 재생목록에 남아 있는 "추천곡 추가 마감" 일정을 정리한다.
// 미리보기: node scripts/cleanup-recommendation-deadline-events.cjs
// 실제 삭제: node scripts/cleanup-recommendation-deadline-events.cjs --apply
const { configstore } = require('firebase-tools/lib/configstore')
const { getAccessToken, setRefreshToken } = require('firebase-tools/lib/apiv2')

const PROJECT_ID = 'amicicalender'
const APPLY = process.argv.includes('--apply')

async function main() {
  const tokens = configstore.get('tokens')
  if (!tokens?.refresh_token) throw new Error('Firebase CLI 로그인이 필요합니다.')
  setRefreshToken(tokens.refresh_token)
  const accessToken = await getAccessToken()
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`
  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${response.status}: ${text}`)
    return text ? JSON.parse(text) : {}
  }

  async function listDocuments(path) {
    const documents = []
    let pageToken = ''
    do {
      const queryString = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) })
      const page = await api(`${path}?${queryString}`)
      documents.push(...(page.documents || []))
      pageToken = page.nextPageToken || ''
    } while (pageToken)
    return documents
  }

  const bands = await listDocuments('/documents/bands')
  const targets = []
  for (const band of bands) {
    const bandId = band.name.split('/').pop()
    const playlists = await listDocuments(`/documents/bands/${bandId}/playlists`)
    const voting = playlists.filter((playlist) => playlist.fields?.voteOpen?.booleanValue === true)
    if (!voting.length) continue
    const events = await listDocuments(`/documents/bands/${bandId}/events`)
    for (const playlist of voting) {
      const playlistId = playlist.name.split('/').pop()
      const event = events.find((item) => item.name.split('/').pop() === `recommendation-deadline-${playlistId}`)
      if (!event) continue
      targets.push({
        name: event.name,
        band: band.fields?.name?.stringValue || bandId,
        playlist: playlist.fields?.name?.stringValue || playlistId,
        date: event.fields?.date?.stringValue || '',
        title: event.fields?.title?.stringValue || '',
      })
    }
  }

  console.log(`채널 ${bands.length}개 · 삭제 대상 일정 ${targets.length}개`)
  targets.forEach((target) => console.log(` - [${target.band}] ${target.playlist} · ${target.title} (${target.date})`))
  if (!APPLY || !targets.length) {
    console.log(APPLY ? '삭제할 일정이 없습니다.' : '미리보기만 완료했습니다. --apply를 붙이면 삭제합니다.')
    return
  }

  await api('/documents:batchWrite', { method: 'POST', body: { writes: targets.map((target) => ({ delete: target.name })) } })
  console.log(`추천곡 추가 마감 일정 ${targets.length}개를 삭제했습니다.`)
}

main().catch((error) => {
  const detail = error?.context?.body?.error?.message || error?.context?.body?.error || error.message || error
  console.error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  process.exitCode = 1
})
