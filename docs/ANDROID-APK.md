# 안드로이드 설치 파일(APK) 배포 가이드

웹앱(PWA)을 그대로 감싼 **TWA(Trusted Web Activity)** APK를 만들어,
플레이스토어를 거치지 않고 `.apk` 파일로 멤버에게 직접 배포한다.
코드는 건드리지 않는다 — APK는 배포된 웹 주소(`https://amicicalender.web.app`)를 전체화면으로 띄우는 껍데기다.

> 웹을 새로 배포하면 APK 안의 화면도 자동으로 최신이 된다. (앱 자체는 재설치 불필요)

---

## 사전 조건 (이미 세팅됨)

- `public/.well-known/assetlinks.json` — Digital Asset Links 파일. 이게 있어야 APK가 **주소창 없이** 뜬다.
- `firebase.json` — 위 파일을 `application/json`으로 서빙하도록 배선됨 (dotfile ignore 해제).
- manifest에 `id`, 512/192 아이콘 존재 → PWABuilder 검증 통과.

---

## 절차

### 1. 최신 웹 배포

```bash
npm run build
npx firebase deploy --only hosting
```

### 2. PWABuilder로 APK 생성

1. https://www.pwabuilder.com 접속
2. `https://amicicalender.web.app` 입력 → **Start**
3. 상단 **Package For Stores → Android** 선택
4. 패키지 형식은 기본값 **"Signed APK"** (또는 APK+AAB). **Package ID**를 정한다
   (예: `app.web.amicicalender.twa` — 한번 정하면 바꾸지 말 것)
   - **색상 설정(중요, All Settings에서)** — 앱이 다크 테마라 하단 내비바·스플래시를 검정으로 맞춘다:
     - Navigation bar color: `#000000` (기본 주황/밝은색이면 하단에 어색한 라인이 생김)
     - Status bar color: `#0a0a12`
     - Splash screen background color: `#000000`
     - Navigation divider color: `#000000`
5. **Download** → zip 안에 다음이 들어있다:
   - `*.apk` — 멤버에게 배포할 설치 파일
   - `signing.keystore` + `signing-key-info.txt` — **서명 키. 절대 분실 금지.**
     (나중에 업데이트 APK를 낼 때 같은 키로 서명해야 함. 이 레포 밖 안전한 곳에 백업)
   - `assetlinks.json` — 3단계에서 사용

### 3. assetlinks.json 채우고 재배포

PWABuilder가 준 `assetlinks.json`의 값(정확히는 `package_name`과 `sha256_cert_fingerprints`)을
`public/.well-known/assetlinks.json`에 반영한다. 그냥 PWABuilder 파일로 통째 덮어써도 된다.

그다음:

```bash
npm run build
npx firebase deploy --only hosting
```

확인: 브라우저에서 `https://amicicalender.web.app/.well-known/assetlinks.json` 열었을 때
JSON이 그대로 보이면 성공 (index.html이 뜨면 실패).

### 4. 멤버에게 배포

`.apk` 파일을 카톡/드라이브 링크 등으로 공유.
멤버는 받아서 열고 **"출처를 알 수 없는 앱 설치 허용"** 한 번 켜주면 설치된다.

설치 후 앱을 열어 확인:
- 상단에 브라우저 주소창이 **안 보이면** assetlinks 검증 성공(전체화면).
- 주소창이 보이면 3단계 assetlinks가 아직 반영 안 된 것 → 재배포 후 앱 재실행.

---

## 업데이트 정책

- **화면·기능 변경** → 웹만 재배포하면 끝. APK 재배포 불필요.
- **앱 이름/아이콘/패키지ID 변경** → PWABuilder로 APK 다시 생성(반드시 같은 서명 키 사용) 후 재배포.

## 알려진 체크포인트

- **구글 로그인**: TWA는 실제 Chrome 엔진이라 `signInWithPopup`이 보통 동작한다.
  실기기에서 로그인이 안 되면 `src/auth.tsx`를 `signInWithRedirect` 방식으로 바꾼다.
- **Firebase 승인 도메인**: `amicicalender.web.app`가 Authentication → 설정 → 승인된 도메인에 있어야 함(기본 포함).
