export default function SetupNotice() {
  return (
    <div className="centered">
      <div className="card-notice">
        <h1>Firebase 설정이 필요해요</h1>
        <p>
          앱을 실행하려면 Firebase 웹앱 설정값이 있어야 합니다. 프로젝트 루트의{' '}
          <code>.env.example</code> 파일을 복사해 <code>.env.local</code> 로 만들고,
          Firebase 콘솔의 <b>프로젝트 설정 &gt; 내 앱(웹앱)</b> 에서 받은 값을 채운 뒤 개발
          서버를 다시 시작하세요.
        </p>
        <pre>
{`VITE_FB_API_KEY=...
VITE_FB_AUTH_DOMAIN=...
VITE_FB_PROJECT_ID=...
VITE_FB_STORAGE_BUCKET=...
VITE_FB_SENDER_ID=...
VITE_FB_APP_ID=...`}
        </pre>
        <p className="muted">
          이 값들은 클라이언트에 공개돼도 되는 설정입니다. 실제 보안은 Firestore 규칙으로
          지킵니다.
        </p>
      </div>
    </div>
  )
}
