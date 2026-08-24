const { configstore } = require('firebase-tools/lib/configstore')
const { getAccessToken, setRefreshToken } = require('firebase-tools/lib/apiv2')

const PROJECT_ID = 'amicicalender'
const FOLDER_NAME = '혼자 공부하는 머신러닝+딥러닝'
const PREFIX = '[머신러닝+딥러닝 기초 강의]'
const APPLY = process.argv.includes('--apply')

function clean(title) {
  return String(title || '').replaceAll(PREFIX, '').replace(/\s{2,}/g, ' ').trim()
}

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
  const personalBands = bands.filter((band) => band.fields?.templateId?.stringValue === 'personal')
  const folders = []
  for (const band of personalBands) {
    const bandId = band.name.split('/').pop()
    const candidates = await listDocuments(`/documents/bands/${bandId}/videoFolders`)
    folders.push(...candidates.filter((folder) => folder.fields?.name?.stringValue === FOLDER_NAME))
  }
  if (folders.length !== 1) throw new Error(`대상 폴더가 ${folders.length}개입니다. 정확히 1개여야 합니다.`)

  const folder = folders[0]
  const marker = '/documents/'
  const relative = folder.name.slice(folder.name.indexOf(marker) + marker.length)
  const [root, bandId] = relative.split('/')
  if (root !== 'bands' || !bandId) throw new Error('대상 폴더 경로가 올바르지 않습니다.')
  const videos = await listDocuments(`/documents/${relative}/videos`)

  const updates = videos.map((document) => {
    const previous = document.fields?.title?.stringValue || ''
    return { document, previous, title: clean(previous) }
  }).filter(({ previous, title }) => title && title !== previous)

  console.log(`대상 폴더 1개 · 전체 영상 ${videos.length}개 · 변경 대상 ${updates.length}개`)
  if (!APPLY || !updates.length) {
    console.log(APPLY ? '변경할 제목이 없습니다.' : '미리보기만 완료했습니다. --apply를 붙이면 저장합니다.')
    return
  }

  for (let offset = 0; offset < updates.length; offset += 400) {
    const writes = updates.slice(offset, offset + 400).map(({ document, title }) => ({
      update: { name: document.name, fields: { title: { stringValue: title } } },
      updateMask: { fieldPaths: ['title'] },
    }))
    await api('/documents:batchWrite', { method: 'POST', body: { writes } })
  }
  console.log(`영상 제목 ${updates.length}개를 저장했습니다.`)
}

main().catch((error) => {
  const detail = error?.context?.body?.error?.message || error?.context?.body?.error || error.message || error
  console.error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  process.exitCode = 1
})
