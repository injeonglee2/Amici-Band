/**
 * 일회성 정리(cleanup): 옛 전역(root) 컬렉션 삭제 — 멀티밴드 전환 마무리.
 *
 * ⚠️ 되돌릴 수 없는 삭제. 반드시 모든 멤버 앱이 새 버전(bands/{band}) 으로 갱신된 뒤 실행.
 * - 삭제 대상(전역): members, events(+attendance,setlist), places, playlists(+tracks), recordings, scores, config
 * - 보존: feedback, users, inviteCodes (전역 유지), bands/** (새 구조)
 * - 안전장치: bands/amici 에 멤버가 있어야(=마이그레이션 완료) 진행. 아니면 중단.
 * - 기본 DRY-RUN(개수만). 실제 삭제는 `--commit`.
 *
 * 실행:
 *   set GOOGLE_APPLICATION_CREDENTIALS=...serviceAccount.json   (PowerShell: $env:...= "...")
 *   cd functions
 *   node cleanup-legacy.js            # 미리보기(무엇이 얼마나 지워질지)
 *   node cleanup-legacy.js --commit   # 실제 삭제
 *
 * 삭제 후: firestore.rules.after-cleanup 를 firestore.rules 로 덮어쓰고 배포.
 */
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
// 삭제할 전역 컬렉션 (feedback/users/inviteCodes/bands 는 제외 = 보존)
const LEGACY = ['members', 'events', 'places', 'playlists', 'recordings', 'scores', 'config']

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'amicicalender' })
const db = admin.firestore()

// 하위 컬렉션 포함 문서 수 세기(미리보기용)
async function countDeep(ref) {
  const snap = await ref.get()
  let n = snap.size
  for (const d of snap.docs) {
    const subs = await d.ref.listCollections()
    for (const sub of subs) n += await countDeep(sub)
  }
  return n
}

async function main() {
  console.log(`\n=== 전역 컬렉션 정리 (${COMMIT ? '★ COMMIT(실제 삭제)' : 'DRY-RUN(미리보기)'}) ===\n`)

  // 안전장치: 마이그레이션 완료(=bands/amici 에 멤버 존재) 확인
  const bandMembers = await db.collection('bands').doc('amici').collection('members').limit(1).get()
  if (bandMembers.empty) {
    console.error('중단: bands/amici 에 멤버가 없습니다. 마이그레이션이 끝났는지 먼저 확인하세요.')
    process.exit(1)
  }

  for (const name of LEGACY) {
    const col = db.collection(name)
    const total = await countDeep(col)
    if (COMMIT) {
      await db.recursiveDelete(col)
      console.log(`  ${name}: ${total}개 문서 삭제됨`)
    } else {
      console.log(`  ${name}: ${total}개 문서 삭제 예정`)
    }
  }

  console.log(
    COMMIT
      ? '\n완료: 전역 컬렉션 삭제됨. 다음 → firestore.rules.after-cleanup 로 규칙 교체·배포.\n'
      : '\n미리보기 끝. 실제 삭제는 --commit 을 붙여 다시 실행.\n(feedback/users/inviteCodes/bands 는 보존됩니다)\n',
  )
}
main().then(() => process.exit(0)).catch((e) => { console.error('정리 실패:', e); process.exit(1) })
