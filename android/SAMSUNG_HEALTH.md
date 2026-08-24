# Samsung Health Data SDK 연결

웹과 서버의 동기화 세션·중복 방지 저장 로직, Android 딥링크 진입점은 구현되어 있다.

## 공식 SDK 추가

1. Samsung Developer에 로그인해 Samsung Health Data SDK 1.1.0을 다운로드한다.
2. 패키지의 `samsung-health-data-api-*.aar`를 `android/app/libs/`에 둔다.
3. Android Studio에서 JDK 17로 빌드한다.

`android/app/build.gradle`은 `app/libs/*.aar`를 자동으로 포함한다. SDK AAR은 Samsung의
배포 조건을 따르도록 Git에서 제외되어 있다. AAR이 없는 빌드에서는 SDK 구현 클래스를
컴파일할 수 없으므로, Android 릴리스 빌드 전 반드시 위 파일을 로컬에 준비한다.

## 동기화 계약

웹은 다음 딥링크로 Activity를 연다.

`amici://samsung-health/sync?token=...&uploadUrl=...&folderId=...&days=90`

SDK 리더는 사용자에게 `DataTypes.EXERCISE` 읽기 권한을 요청하고 RUNNING,
TRACK_RUNNING, TREADMILL 세션만 읽는다. 결과는 `uploadUrl`에 다음 JSON으로 POST한다.

```json
{
  "token": "10분짜리 일회용 토큰",
  "runs": [
    {
      "sourceId": "Samsung exercise/session id",
      "startTime": 0,
      "endTime": 0,
      "durationSec": 0,
      "distanceM": 0,
      "avgHr": 0,
      "maxHr": 0,
      "calories": 0,
      "steps": 0,
      "avgCadence": 0,
      "maxCadence": 0,
      "altitudeGain": 0,
      "vo2Max": 0,
      "samples": [{ "t": 0, "hr": 0, "speed": 0, "cadence": 0 }]
    }
  ]
}
```

성공하면 `https://amicicalender.web.app/?healthSync=success`, 권한 거부 시
`?healthSync=permission-denied`, SDK/플랫폼 오류 시 해당 오류 코드로 돌아온다.

건강 데이터는 러닝 폴더 소유자가 동기화를 눌렀을 때만 전송한다. 세션 토큰은 한 번
사용하면 삭제되고 10분 후 만료된다. 서버는 `sourceId` 기반 고정 문서 ID로 병합하여
같은 러닝을 다시 동기화해도 중복 생성하지 않는다.
