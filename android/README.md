# Amici Android (TWA)

이 폴더는 PWABuilder가 생성한 Android 소스를 한 번 가져와 저장소에서 계속 관리하는 기준 프로젝트입니다.
웹 화면 변경은 Firebase Hosting 배포만 하면 APK에 자동 반영되며, 이 폴더를 다시 생성하지 않습니다.

## 삼성 캘린더 연동

웹의 캘린더 버튼은 `amicicalender://calendar/add` 딥링크를 호출합니다.
`CalendarInsertActivity`가 이를 받아 Android 표준 `ACTION_INSERT`로 삼성 캘린더 등 기기 캘린더의 일정 추가 화면을 엽니다.
제목, 시작·종료 시각, 장소, 메모가 미리 채워지고 사용자가 마지막으로 저장합니다.

## 서명된 APK/AAB 빌드

저장소 밖의 다음 파일을 사용합니다.

- `../Google Play package/signing.keystore`
- `../Google Play package/signing-key-info.txt`

프로젝트 루트에서:

```powershell
.\android\build-release.ps1
```

결과:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

서명키와 비밀번호는 Git에 포함되지 않습니다. 기존 설치 앱 업데이트를 위해 같은 패키지 ID
`app.web.amicicalender.twa`와 같은 서명키를 계속 사용해야 합니다. Play 업데이트마다 `versionCode`를 올립니다.
