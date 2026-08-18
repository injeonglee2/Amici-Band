/**
 * 일회성 백필: 기존 밴드 멤버 → users/{uid} = { bandId } 생성 (멀티밴드 2단계)
 *
 * 클라이언트는 로그인 후 users/{uid}.bandId 로 자기 밴드를 해석한다.
 * 기존 AMICI 멤버들이 이 문서가 없으면 온보딩으로 잘못 빠지므로 미리 채워 둔다.
 * 기본 DRY-RUN, --commit 시에만 실제 쓰기. 이미 있으면 건너뜀(비파괴).
 *
 * 실행:
 *   set GOOGLE_APPLICATION_CREDENTIALS=...serviceAccount.json
 *   cd functions
 *   node backfill-users.js            # 미리보기
 *   node backfill-users.js --commit   # 실제 생성
 */
const admin = require('firebase-admin')
const COMMIT = process.argv.includes('--commit')
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'amicicalender' })
const db = admin.firestore()

async function main() {
  console.log(`\n=== users 백필 (${COMMIT ? '★ COMMIT' : 'DRY-RUN'}) ===\n`)
  const bands = await db.collection('bands').get()
  let created = 0
  let skipped = 0
  for (const band of bands.docs) {
    const members = await band.ref.collection('members').get()
    for (const m of members.docs) {
      const uid = m.id
      const existing = await db.collection('users').doc(uid).get()
      if (existing.exists && existing.get('bandId')) {
        skipped++
        continue
      }
      console.log(`  users/${uid} → bandId=${band.id}`)
      if (COMMIT) await db.collection('users').doc(uid).set({ bandId: band.id, createdAt: Date.now() }, { merge: true })
      created++
    }
  }
  console.log(`\n생성: ${created}, 건너뜀(이미 있음): ${skipped}`)
  console.log(COMMIT ? '완료.' : '미리보기 끝. --commit 으로 실제 생성.')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
