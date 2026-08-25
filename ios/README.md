# Amici iOS 테스트 셸

이 폴더의 Swift 파일은 웹 앱을 `WKWebView`로 열고 `amici://apple-health/sync` 요청을 HealthKit 동기화로 연결한다.

Mac의 Xcode에서 iOS App 프로젝트 `Amici`를 만든 뒤:

1. `ios/Amici`의 Swift 파일을 프로젝트에 추가한다.
2. Signing & Capabilities에서 **HealthKit**을 추가한다.
3. Info에 `Privacy - Health Share Usage Description`을 추가하고 값은 `러닝 기록과 운동 중 심박·페이스를 Amici에서 확인하기 위해 사용합니다.`로 설정한다.
4. URL Types에 scheme `amici`를 추가한다.
5. 본인의 Apple Account Team과 고유 Bundle Identifier를 선택하고 연결된 iPhone에서 실행한다.

무료 계정 테스트 빌드는 본인 기기에만 설치하며 서명 유효기간이 짧다. TestFlight/App Store 배포는 유료 Apple Developer Program이 필요하다.
