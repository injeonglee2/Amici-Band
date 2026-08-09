# 푸시 알림 설정

Amici는 기기별로 두 가지 전송 방식을 병행합니다.

- Android 및 데스크톱 브라우저: Firebase Cloud Messaging(FCM)
- iPhone/iPad 홈 화면 PWA: 표준 Web Push

## 사용자 설정

최초 로그인 후 이름과 파트를 입력하는 화면에서 `일정 및 투표 알림 받기`를 선택하고 `시작하기`를 누릅니다. 기존 사용자는 설정 화면의 `알림 켜기`를 사용합니다.

iPhone/iPad에서는 다음 조건이 모두 필요합니다.

1. iOS/iPadOS 16.4 이상
2. Safari 공유 메뉴에서 Amici를 홈 화면에 추가
3. 홈 화면의 Amici 앱으로 실행
4. 앱 안에서 알림 권한 허용

일반 Safari 탭에서는 iPhone Web Push를 등록하지 않습니다.

## 서버 설정

FCM 공개 키는 루트 `.env.local`의 `VITE_FB_VAPID_KEY`에 둡니다. 표준 Web Push 키는 다음 Firebase Secret Manager 항목으로 관리합니다.

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`

비공개 키는 소스, `.env` 또는 Git에 저장하지 않습니다.

## 발송 동작

- 합주 일정 생성: 전체 멤버에게 참석 투표 요청
- 합주 일정 변경: 날짜, 시간, 장소, 제목, 메모 또는 타임테이블이 실제 변경된 경우 전체 멤버에게 변경 안내
- 관리자 투표 독려: 아직 투표하지 않은 멤버에게만 요청

전송에 실패한 만료 FCM 토큰과 Web Push 구독(HTTP 404/410)은 Functions가 사용자 문서에서 자동으로 제거합니다.

## 배포

```bash
npm run build
firebase deploy --only functions,hosting --project amicicalender
```

Functions는 `asia-northeast3` 리전을 사용합니다. 푸시 Functions 배포에는 Firebase Blaze 요금제가 필요할 수 있습니다.

## 관련 파일

- `src/messaging.ts`: 권한 요청, FCM 토큰 및 Web Push 구독 생성
- `public/firebase-messaging-sw.js`: FCM 백그라운드 알림
- `public/web-push-sw.js`: iPhone/iPad 표준 Web Push 알림
- `functions/index.js`: FCM 및 Web Push 병행 발송
- `members/{uid}.fcmTokens[]`: FCM 토큰
- `members/{uid}.webPushSubscriptions[]`: 표준 Web Push 구독
