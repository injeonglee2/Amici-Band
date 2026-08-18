/**
 * 일회성 마이그레이션: 전역 컬렉션 → bands/amici/...  (멀티밴드 1단계)
 *
 * - 원본(전역 컬렉션)은 절대 지우지 않는다. 복사만 한다(백업 보존).
 * - feedback 은 전역 유지이므로 복사하지 않는다.
 * - 하위 컬렉션(events 의 attendance·setlist, playlists 의 tracks)까지 재귀 복사.
 * - 악보(scores) 문서의 Storage `path` 필드는 그대로 둔다 → 기존 파일은 옛 경로에서 계속 로드됨(파일 이동 불필요).
 * - 기본은 DRY-RUN(개수만 셈). 실제 쓰기는 `--commit` 플래그가 있을 때만.
 *
 * 실행(예):
 *   # 서비스 계정 키로 인증 (콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키)
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccount.json   (PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="...")
 *   cd functions
 *   node migrate-to-bands.js            # dry-run: 무엇이 얼마나 복사될지 확인
 *   node migrate-to-bands.js --commit   # 실제 복사
 */
const admin = require('firebase-admin')

const BAND_ID = 'amici'
const DEVELOPER_EMAIL = 'kkd00055@gmail.com'
// 밴드로 옮길 전역 컬렉션 (feedback 은 전역 유지이므로 제외)
const COLLECTIONS = ['members', 'events', 'places', 'playlists', 'recordings', 'scores', 'config']

const COMMIT = process.argv.includes('--commit')

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'amicicalender' })
const db = admin.firestore()

let docCount = 0

/** 한 문서를 대상 위치로 복사하고, 그 하위 컬렉션들도 재귀 복사 */
async function copyDocDeep(srcSnap, destRef) {
  docCount++
  if (COMMIT) await destRef.set(srcSnap.data())
  const subs = await srcSnap.ref.listCollections()
  for (const sub of subs) {
    const snap = await sub.get()
    for (const d of snap.docs) {
      await copyDocDeep(d, destRef.collection(sub.id).doc(d.id))
    }
  }
}

async function copyCollection(name, destCol) {
  const snap = await db.collection(name).get()
  for (const d of snap.docs) {
    await copyDocDeep(d, destCol.doc(d.id))
  }
  return snap.size
}

async function main() {
  console.log(`\n=== bands/${BAND_ID} 마이그레이션 (${COMMIT ? '★ COMMIT(실제 복사)' : 'DRY-RUN(미리보기)'}) ===\n`)

  // 개발자(소유자) uid 찾기 — 전역 members 에서 이메일로
  const devSnap = await db.collection('members').where('email', '==', DEVELOPER_EMAIL).limit(1).get()
  const ownerUid = devSnap.empty ? null : devSnap.docs[0].id
  const membersCount = (await db.collection('members').get()).size
  console.log(`소유자(ownerUid): ${ownerUid ?? '(못 찾음 — 나중에 콘솔에서 지정 필요)'}`)

  const bandDocData = {
    name: 'AMICI',
    unlimited: true, // AMICI 는 가입인원 캡·향후 멤버십 제약 면제 (영구)
    ownerUid: ownerUid || null,
    memberCount: membersCount,
    createdAt: Date.now(),
  }
  console.log('bands/amici 문서:', JSON.stringify(bandDocData))
  if (COMMIT) await db.collection('bands').doc(BAND_ID).set(bandDocData, { merge: true })

  const bRef = db.collection('bands').doc(BAND_ID)
  for (const c of COLLECTIONS) {
    docCount = 0 // 하위 포함 문서 카운트를 컬렉션별로 보고
    const top = await copyCollection(c, bRef.collection(c))
    console.log(`  ${c}: 최상위 ${top}개 (하위 포함 총 ${docCount}개 문서)`)
  }

  console.log(`\n${COMMIT ? '완료: 복사됨. 원본(전역)은 그대로 보존됨.' : '미리보기 끝. 실제 복사하려면 --commit 을 붙여 다시 실행하세요.'}\n`)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('마이그레이션 실패:', e)
  process.exit(1)
})
