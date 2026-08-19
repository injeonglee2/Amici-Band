import { useEffect, useState } from 'react'
import { deleteFeedback, getActiveInviteCode, getBand, kickMember, rotateInviteCode, saveFcmToken, saveWebPushSubscription, setFeedbackStatus, setMemberAdmin, watchAllBands, watchFeedback, watchMembers } from '../data'
import { useAuth } from '../auth'
import { notificationPermission, pushConfigured, requestNotificationRegistrations } from '../messaging'
import { getCalendarExportMode, isAndroidDevice, setCalendarExportMode, type CalendarExportMode } from '../calendar'
import ThemeSelect from './ThemeSelect'
import FeedbackSheet from './FeedbackSheet'
import ConfirmDialog from './ConfirmDialog'
import Toast, { useToast } from './Toast'
import { CopyButton } from './CopyButton'
import { versionLabel } from '../version'
import { useBackHandler } from '../backnav'
import { PART_META, type Band, type Feedback, type Member, type Part } from '../types'

const fmtDay = (ms?: number) => {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const { user, member, bandId, isDeveloper } = useAuth()
  const isAdmin = !!member?.admin
  const toast = useToast()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [tab, setTab] = useState<'general' | 'band' | 'dev'>('general')
  const tabs: { k: 'general' | 'band' | 'dev'; label: string }[] = [
    { k: 'general', label: '일반' },
    ...(isAdmin && bandId ? [{ k: 'band' as const, label: '밴드 관리' }] : []),
    ...(isDeveloper ? [{ k: 'dev' as const, label: '개발자' }] : []),
  ]
  useBackHandler(() => (feedbackOpen ? setFeedbackOpen(false) : onClose()))
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
        {tabs.length > 1 && (
          <div className="segmented set-seg" role="tablist">
            {tabs.map((t) => (
              <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>{t.label}</button>
            ))}
          </div>
        )}

        {tab === 'general' && (
          <>
            <NotifCard />
            <CalendarExportCard />
            <button type="button" className="set-entry" onClick={() => setFeedbackOpen(true)}>
              <span>의견 보내기 · 버그 제보</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </>
        )}

        {tab === 'band' && isAdmin && bandId && (
          <>
            <InviteCodeCard bandId={bandId} toast={toast} />
            <MemberManageCard bandId={bandId} myUid={user?.uid ?? ''} toast={toast} />
          </>
        )}

        {tab === 'dev' && isDeveloper && (
          <>
            <BandsStatusCard />
            <AdminFeedbackCard toast={toast} />
            <FirebaseLimitsCard />
          </>
        )}

        <p className="app-ver">{versionLabel()}</p>
      </main>

      {feedbackOpen && <FeedbackSheet toast={toast} onClose={() => setFeedbackOpen(false)} />}
      <Toast state={toast} />
    </div>
  )
}

/** 관리자 전용: 이 밴드 초대 코드 보기 + 재발급(회전) */
function InviteCodeCard({ bandId, toast }: { bandId: string; toast: ReturnType<typeof useToast> }) {
  const [code, setCode] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getActiveInviteCode(bandId)
      .then(setCode)
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [bandId])
  async function rotate() {
    if (busy) return
    setBusy(true)
    try {
      const r = await rotateInviteCode(bandId)
      setCode(r.code)
      toast.show('새 초대 코드를 발급했어요')
    } catch {
      toast.show('코드 재발급에 실패했어요')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>초대 코드</h3>
        <span className="guide-badge">관리자</span>
      </div>
      {code ? (
        <div className="invite-code">
          <span>{code}</span>
          <CopyButton text={code} onCopied={() => toast.show('코드를 복사했어요')} />
        </div>
      ) : loaded ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>아직 코드가 없어요. 아래에서 발급하세요.</p>
      ) : null}
      <button type="button" className="btn subtle block" onClick={() => void rotate()} disabled={busy}>
        {busy ? '발급 중…' : code ? '코드 재발급' : '코드 발급'}
      </button>
    </div>
  )
}

/** 관리자 전용: 멤버 관리 — 관리자 지정/해제, 강퇴 */
function MemberManageCard({ bandId, myUid, toast }: { bandId: string; myUid: string; toast: ReturnType<typeof useToast> }) {
  const [members, setMembers] = useState<Member[]>([])
  const [ownerUid, setOwnerUid] = useState<string | null>(null)
  const [confirmKick, setConfirmKick] = useState<Member | null>(null)
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => watchMembers(setMembers), [])
  useEffect(() => {
    getBand(bandId).then((b) => setOwnerUid(b?.ownerUid ?? null)).catch(() => {})
  }, [bandId])
  const sorted = [...members].sort(
    (a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || (a.name ?? '').localeCompare(b.name ?? '', 'ko'),
  )
  async function toggleAdmin(m: Member) {
    setBusy(m.uid)
    try {
      await setMemberAdmin(bandId, m.uid, !m.admin)
      toast.show(m.admin ? '관리자를 해제했어요' : '관리자로 지정했어요')
    } catch {
      toast.show('변경에 실패했어요')
    } finally {
      setBusy('')
    }
  }
  async function doKick() {
    const m = confirmKick
    if (!m) return
    setConfirmKick(null)
    setBusy(m.uid)
    try {
      await kickMember(bandId, m.uid)
      toast.show(`${m.name ?? '멤버'} 님을 내보냈어요`)
    } catch {
      toast.show('내보내기에 실패했어요')
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="limits-card">
      <button type="button" className="limits-head mm-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h3>멤버 관리{members.length > 0 && <b className="fb-newbadge"> {members.length}</b>}</h3>
        <span className="guide-badge">관리자</span>
        <svg className={'mm-chev' + (open ? ' open' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
      <ul className="mm-list">
        {sorted.map((m) => {
          const isOwner = m.uid === ownerUid
          const self = m.uid === myUid
          return (
            <li key={m.uid}>
              <div className="mm-info">
                <span className="mm-name">
                  {m.name || '(이름 설정 전)'}
                  {isOwner && <em className="mm-tag owner">소유자</em>}
                  {m.admin && !isOwner && <em className="mm-tag admin">관리자</em>}
                </span>
                <span className="mm-part">{PART_META[m.part as Part]?.label ?? ''}</span>
              </div>
              {!self && !isOwner && (
                <div className="mm-actions">
                  <button type="button" className="btn subtle sm" disabled={busy === m.uid} onClick={() => void toggleAdmin(m)}>
                    {m.admin ? '관리자 해제' : '관리자 지정'}
                  </button>
                  <button type="button" className="btn danger sm" disabled={busy === m.uid} onClick={() => setConfirmKick(m)}>내보내기</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      )}
      {confirmKick && (
        <ConfirmDialog
          message={`${confirmKick.name ?? '이 멤버'} 님을 밴드에서 내보낼까요?`}
          confirmLabel="내보내기"
          cancelLabel="닫기"
          danger
          onConfirm={() => void doKick()}
          onCancel={() => setConfirmKick(null)}
        />
      )}
    </div>
  )
}

/** 개발자 전용: 전체 밴드 현황 (과금 리스크 모니터링) */
function BandsStatusCard() {
  const [bands, setBands] = useState<Band[]>([])
  useEffect(() => watchAllBands(setBands, () => {}), [])
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>밴드 현황{bands.length > 0 && <b className="fb-newbadge"> {bands.length}</b>}</h3>
        <span className="guide-badge dev">개발자</span>
      </div>
      {bands.length === 0 ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>밴드가 없어요.</p>
      ) : (
        <ul className="bands-list">
          {bands.map((b) => (
            <li key={b.id}>
              <span className="bands-name">
                {b.name}
                {b.unlimited && <em className="bands-unl">무제한</em>}
              </span>
              <span className="bands-meta">
                {b.memberCount ?? 0}{b.unlimited ? '' : '/5'}명 · {fmtDay(b.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const FB_TYPE_LABEL: Record<Feedback['type'], string> = { bug: '버그', idea: '개선', etc: '기타' }

/** 개발자 전용: 받은 의견·버그 제보 목록 + 처리 상태 토글 */
function AdminFeedbackCard({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [list, setList] = useState<Feedback[]>([])
  useEffect(() => watchFeedback(setList, () => {}), [])
  const newCount = list.filter((f) => f.status === 'new').length

  async function toggle(f: Feedback) {
    try {
      await setFeedbackStatus(f.id, f.status === 'new' ? 'done' : 'new')
    } catch {
      toast.show('상태 변경에 실패했어요.')
    }
  }
  async function remove(f: Feedback) {
    try {
      await deleteFeedback(f.id, f.images)
    } catch {
      toast.show('삭제에 실패했어요.')
    }
  }
  const when = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>받은 의견{newCount > 0 && <b className="fb-newbadge"> {newCount}</b>}</h3>
        <span className="guide-badge dev">개발자</span>
      </div>
      {list.length === 0 ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>아직 받은 의견이 없어요.</p>
      ) : (
        <ul className="fb-list">
          {list.map((f) => (
            <li key={f.id} className={'fb-item' + (f.status === 'done' ? ' done' : '')}>
              <div className="fb-item-head">
                <span className={'fb-badge fb-' + f.type}>{FB_TYPE_LABEL[f.type]}</span>
                <span className="fb-meta">{f.createdByName ?? '멤버'} · {when(f.createdAt)}</span>
              </div>
              <p className="fb-text">{f.text}</p>
              {f.images && f.images.length > 0 && (
                <div className="fb-thumbs">
                  {f.images.map((im, i) => (
                    <a key={i} href={im.url} target="_blank" rel="noopener noreferrer" className="fb-thumb">
                      <img src={im.url} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {(f.appVersion || f.userAgent) && (
                <p className="fb-ctx">v{f.appVersion} · {shortUA(f.userAgent)}</p>
              )}
              <div className="fb-item-actions">
                <button type="button" className="btn subtle" onClick={() => void toggle(f)}>
                  {f.status === 'done' ? '다시 열기' : '처리됨'}
                </button>
                <button type="button" className="btn danger" onClick={() => void remove(f)}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** userAgent 에서 기기·브라우저만 짧게 */
function shortUA(ua?: string): string {
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '기타'
  const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : ''
  return [os, br].filter(Boolean).join('·')
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

/** 개발자 전용: Firebase 무료 한도 수치 + 실시간 사용량(콘솔) 바로가기 */
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
        <span className="guide-badge dev">개발자</span>
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
