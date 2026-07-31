# Amici Band 일정 · 참석 투표 앱

밴드 동호회용 일정 관리 + 멤버별 참석 투표(참석 / 늦참 / 조퇴) PWA.
Vite + React + TypeScript + Firebase(Auth · Firestore · Hosting).

## 주요 기능
- **구글 로그인** — 최초 1회 실명(2~4자) 설정 후 모든 화면에 실명 표시
- **일정 관리** — 유형(정기연습·공연·번개·회의), 날짜, 합주 시간, 장소, 메모 / 다음 일정 D-day / 유형 필터 / 월별 그룹 / 장소 원터치 복사
- **참석 투표(실시간)** — 참석 / 늦참 / 조퇴. 늦참은 도착 시각, 조퇴는 나가는 시각을 **합주 시간(기본 18:00~22:00) 안에서만** 선택. 투표하면 모든 멤버 화면에 즉시 반영
- **PWA** — 홈 화면 추가로 앱처럼 사용

## 1. Firebase 콘솔 준비 (계정 소유자)
1. https://console.firebase.google.com → **프로젝트 만들기** (예: `amici-band`)
2. **Authentication → Sign-in method → Google** 사용 설정
3. **Firestore Database → 데이터베이스 만들기** (프로덕션 모드, 리전은 `asia-northeast3`(서울) 권장)
4. **프로젝트 설정 → 내 앱 → 웹앱 추가(`</>`)** → 나오는 `firebaseConfig` 값 확인

## 2. 로컬 실행
```bash
npm install
cp .env.example .env.local   # 그리고 firebaseConfig 값 채우기
npm run dev
```
`.env.local` 예시:
```
VITE_FB_API_KEY=AIza...
VITE_FB_AUTH_DOMAIN=amici-band.firebaseapp.com
VITE_FB_PROJECT_ID=amici-band
VITE_FB_STORAGE_BUCKET=amici-band.appspot.com
VITE_FB_SENDER_ID=1234567890
VITE_FB_APP_ID=1:1234567890:web:abcdef
```

### 데모 모드 (로그인 없이 UI 미리보기)
개발 서버에서 `?demo` 를 붙이면 로그인·Firebase 없이 샘플 데이터로 화면을 테스트할 수 있다.
```
http://localhost:5173/?demo
```
- 가짜 멤버(`김데모`) + 샘플 일정/장소/참석으로 채워지며, 추가·수정·투표가 인메모리로 동작(새로고침 시 리셋).
- `import.meta.env.DEV` 가드로 **프로덕션 빌드(배포본·APK)에는 포함되지 않음.** 구현: [src/demo.ts](src/demo.ts)

> 배포 CLI는 `firebase-tools`(devDependency로 설치됨). 최초 1회 로그인 필요:
> `npx firebase-tools login`

## 3. 보안 규칙 배포
```bash
npx firebase-tools login          # 최초 1회
npx firebase-tools use --add      # 위 프로젝트 선택 (amicicalender)
npx firebase-tools deploy --only firestore:rules
```

## 4. 배포 (Firebase Hosting)
```bash
npm run deploy                    # = build + firebase-tools deploy --only hosting
```
배포 후 나오는 `https://<project>.web.app` 주소를 멤버에게 공유 → 모바일 브라우저에서
**홈 화면에 추가**하면 앱처럼 쓸 수 있습니다.

### 투트랙 배포
- **웹/PWA (트랙 1)** — 위 그대로. 아이폰·모든 브라우저 커버. 아이폰은 Safari "홈 화면에 추가"가 무스토어 설치의 사실상 유일한 방법.
- **안드로이드 APK (트랙 2)** — 스토어 없이 `.apk` 설치 파일로 배포. 배포 URL을 감싼 TWA 방식. → [docs/ANDROID-APK.md](docs/ANDROID-APK.md)

> 승인된 도메인: 배포 도메인에서 구글 로그인이 되려면 Firebase **Authentication → 설정 →
> 승인된 도메인**에 `*.web.app`(기본 포함) 또는 커스텀 도메인이 있어야 합니다.

## 데이터 구조 (Firestore)
- `members/{uid}` — `{ uid, email, name, photoURL, createdAt }`
- `events/{eventId}` — `{ type, title, date, rehStart, rehEnd, loc, note, createdBy, createdAt }`
- `events/{eventId}/attendance/{uid}` — `{ uid, name, status, arriveTime?, leaveTime?, updatedAt }`
