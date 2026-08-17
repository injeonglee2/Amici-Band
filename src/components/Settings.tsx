import { useState } from 'react'
import { saveFcmToken, saveWebPushSubscription } from '../data'
import { useAuth } from '../auth'
import { notificationPermission, pushConfigured, requestNotificationRegistrations } from '../messaging'
import { getCalendarExportMode, isAndroidDevice, setCalendarExportMode, type CalendarExportMode } from '../calendar'
import ThemeSelect from './ThemeSelect'
import { versionLabel } from '../version'
import { useBackHandler } from '../backnav'

export default function Settings({ onClose }: { onClose: () => void }) {
  const { member } = useAuth()
  const isAdmin = !!member?.admin
  useBackHandler(onClose) // 뒤로가기로 설정 화면 닫기
  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <button className="ghost-btn icon" onClick={onClose} aria-label="뒤로">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="brand">
            <h1>설정</h1>
          </div>
        </div>
      </header>

      <main className="scroll">
        <NotifCard />
        <CalendarExportCard />
        {isAdmin && <FirebaseLimitsCard />}
        <p className="app-ver">{versionLabel()}</p>
      </main>
    </div>
  )
}

/** 캘린더 내보내기 방식 선택 — 네이티브 인텐트가 가능한 안드로이드에서만 노출 */
function CalendarExportCard() {
  const [mode, setMode] = useState<CalendarExportMode>(getCalendarExportMode())
  if (!isAndroidDevice()) return null // iOS·데스크톱은 항상 .ics 라 선택이 무의미
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>캘린더 내보내기</h3>
      </div>
      <ThemeSelect
        title="캘린더 내보내기 방식"
        value={mode}
        onChange={(v) => {
          const m = v as CalendarExportMode
          setCalendarExportMode(m)
          setMode(m)
        }}
        options={[
          { value: 'auto', label: '앱에서 바로 추가 (삼성·구글 캘린더)' },
          { value: 'ics', label: '파일(.ics)로 열기 (아이폰 등)' },
        ]}
      />
    </div>
  )
}

const PROJECT_ID = 'amicicalender'

/** 관리자 전용: Firebase 무료 한도 수치 + 실시간 사용량(콘솔) 바로가기 */
function FirebaseLimitsCard() {
  const limits: { name: string; quota: string }[] = [
    { name: 'Firestore', quota: '읽기 5만/일 · 쓰기 2만/일 · 저장 1GB' },
    { name: 'Storage', quota: '저장 5GB · 다운로드 1GB/일' },
    { name: 'Hosting', quota: '전송 약 10GB/월' },
    { name: 'Functions', quota: '호출 200만/월' },
    { name: 'Auth', quota: '구글 로그인 사실상 무제한' },
  ]
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>Firebase 무료 한도</h3>
        <span className="guide-badge">관리자</span>
      </div>
      <ul className="limits-list">
        {limits.map((l) => (
          <li key={l.name}>
            <span className="limits-name">{l.name}</span>
            <span className="limits-quota">{l.quota}</span>
          </li>
        ))}
      </ul>
      <a
        className="btn primary block"
        href={`https://console.firebase.google.com/project/${PROJECT_ID}/usage`}
        target="_blank"
        rel="noopener noreferrer"
      >
        실시간 사용량 보기 →
      </a>
      <p className="limits-note">
        이 한도 안이면 청구 0원. 실제 사용량은 위 버튼(콘솔)에서 확인하세요.{' '}
        <a href="https://console.cloud.google.com/billing/budgets" target="_blank" rel="noopener noreferrer">예산 알림 설정 →</a>
      </p>
    </div>
  )
}

function NotifCard() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'enabling' | 'on' | 'off' | 'denied' | 'unavailable'>(
    !pushConfigured()
      ? 'unavailable'
      : notificationPermission() === 'granted'
        ? 'on'
        : notificationPermission() === 'denied'
          ? 'denied'
          : 'idle',
  )

  async function enable() {
    if (!user) return
    setState('enabling')
    try {
      const { fcmToken, webPushSubscription } = await requestNotificationRegistrations()
      if (fcmToken || webPushSubscription) {
        await Promise.all([
          fcmToken ? saveFcmToken(user.uid, fcmToken) : Promise.resolve(),
          webPushSubscription
            ? saveWebPushSubscription(user.uid, webPushSubscription)
            : Promise.resolve(),
        ])
        setState('on')
      } else {
        setState(notificationPermission() === 'denied' ? 'denied' : 'off')
      }
    } catch {
      setState('off')
    }
  }

  const msg =
    state === 'on'
      ? '이 기기에서 알림을 받는 중이에요.'
      : state === 'denied'
        ? '브라우저에서 알림이 차단됐어요. 사이트 설정에서 허용해 주세요.'
        : state === 'unavailable'
          ? '이 환경에서는 알림을 사용할 수 없어요. (설정 필요 또는 미지원 브라우저)'
          : '새 일정·투표 요청 알림을 이 기기에서 받으려면 켜주세요.'

  return (
    <div className="notif-card">
      <div className="notif-info">
        <h3>알림</h3>
        <p>{msg}</p>
      </div>
      {state === 'on' ? (
        <span className="notif-on">✓ 켜짐</span>
      ) : state === 'idle' || state === 'off' || state === 'enabling' ? (
        <button className="btn primary" onClick={enable} disabled={state === 'enabling'}>
          {state === 'enabling' ? '설정 중…' : '알림 켜기'}
        </button>
      ) : null}
    </div>
  )
}
