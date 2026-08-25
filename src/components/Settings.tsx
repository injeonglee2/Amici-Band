import { useEffect, useState } from 'react'
import { deleteFeedback, getActiveInviteCode, getBand, getBillingUsageStats, getEarliestEventDate, getMonthlyPracticeParticipation, kickMember, rotateInviteCode, saveFcmToken, saveWebPushSubscription, setFeedbackStatus, setMemberAdmin, watchAllBands, watchFeedback, watchMembers, type BillingDailyUsage } from '../data'
import { useAuth } from '../auth'
import { isStandaloneApp, mobileOS, notificationPermission, pushConfigured, requestNotificationRegistrations } from '../messaging'
import { getCalendarExportMode, isAndroidDevice, setCalendarExportMode, type CalendarExportMode } from '../calendar'
import ThemeSelect from './ThemeSelect'
import FeedbackSheet from './FeedbackSheet'
import ConfirmDialog from './ConfirmDialog'
import Segmented from './Segmented'
import Toast, { useToast } from './Toast'
import { CopyButton } from './CopyButton'
import Sheet from './Sheet'
import { versionLabel } from '../version'
import { useBackHandler } from '../backnav'
import { Icon } from '../icons'
import { PART_META, type Band, type Feedback, type Member, type Part } from '../types'
import { getTemplatePreview, getWorkspaceTemplate, setTemplatePreview, WORKSPACE_TEMPLATES, type WorkspaceTemplateId } from '../workspaceTemplates'

const fmtDay = (ms?: number) => {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const { user, member, bandId, workspace, isDeveloper } = useAuth()
  const isAdmin = !!member?.admin
  const toast = useToast()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [devPopup, setDevPopup] = useState<null | 'firebase' | 'feedback'>(null)
  const [devFeedback, setDevFeedback] = useState<Feedback[]>([])
  const [tab, setTab] = useState<'general' | 'band' | 'dev'>('general')
  const tabs: { k: 'general' | 'band' | 'dev'; label: string }[] = [
    { k: 'general', label: '일반' },
    ...(isAdmin && bandId && workspace?.templateId !== 'personal' ? [{ k: 'band' as const, label: '관리' }] : []),
    ...(isDeveloper ? [{ k: 'dev' as const, label: '개발자' }] : []),
  ]
  useEffect(() => {
    if (!isDeveloper) return
    return watchFeedback(setDevFeedback, () => {})
  }, [isDeveloper])
  useBackHandler(() => (devPopup ? setDevPopup(null) : feedbackOpen ? setFeedbackOpen(false) : onClose()))
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
          <Segmented className="set-seg" tabs={tabs} value={tab} onChange={(k) => setTab(k as 'general' | 'band' | 'dev')} />
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

        {tab === 'band' && isAdmin && bandId && workspace?.templateId !== 'personal' && (
          <>
            <InviteCodeCard bandId={bandId} toast={toast} />
            <MemberManageCard bandId={bandId} myUid={user?.uid ?? ''} toast={toast} />
          </>
        )}

        {tab === 'dev' && isDeveloper && (
          <>
            <TemplatePreviewCard />
            <BandsStatusCard />
            <button type="button" className="set-entry dev-entry" onClick={() => setDevPopup('firebase')}>
              <span><b>Firebase 관리</b><small>사용량과 무료 한도 확인</small></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <button type="button" className="set-entry dev-entry" onClick={() => setDevPopup('feedback')}>
              <span><b>받은 의견</b><small>버그 제보와 개선 의견 관리</small></span>
              <span className="dev-entry-side">
                {devFeedback.filter((f) => f.status === 'new').length > 0 && <b className="fb-newbadge">{devFeedback.filter((f) => f.status === 'new').length}</b>}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </span>
            </button>
          </>
        )}

        <p className="app-ver">{versionLabel()}</p>
      </main>

      {feedbackOpen && <FeedbackSheet toast={toast} onClose={() => setFeedbackOpen(false)} />}
      {devPopup === 'firebase' && (
        <DeveloperPopup
          title="Firebase 서비스별 사용량"
          onClose={() => setDevPopup(null)}
        >
          <BillingUsageCard />
        </DeveloperPopup>
      )}
      {devPopup === 'feedback' && (
        <DeveloperPopup title="받은 의견" onClose={() => setDevPopup(null)}>
          <AdminFeedbackCard toast={toast} list={devFeedback} />
        </DeveloperPopup>
      )}
      <Toast state={toast} />
    </div>
  )
}

function DeveloperPopup({ title, onClose, children, headerAction }: { title: string; onClose: () => void; children: React.ReactNode; headerAction?: React.ReactNode }) {
  return (
    <Sheet onClose={onClose} className="dev-popup-sheet">
      <div className="dev-popup-head">
        <h2>{title}</h2>
        <div className="dev-popup-head-actions">
          {headerAction}
          <button type="button" className="edit-btn" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      {children}
    </Sheet>
  )
}

const usageNumber = new Intl.NumberFormat('ko-KR')

function BillingUsageCard() {
  type FirebaseService = 'firestore' | 'storage' | 'hosting' | 'functions' | 'auth'
  const services: { id: FirebaseService; label: string }[] = [
    { id: 'firestore', label: 'Firestore' },
    { id: 'storage', label: 'Storage' },
    { id: 'hosting', label: 'Hosting' },
    { id: 'functions', label: 'Functions' },
    { id: 'auth', label: 'Auth' },
  ]
  const [service, setService] = useState<FirebaseService>('firestore')
  const [rows, setRows] = useState<BillingDailyUsage[]>([])
  const [storageAvailable, setStorageAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const result = await getBillingUsageStats(30)
      setRows(result.rows)
      setStorageAvailable(result.storageAvailable)
    } catch (err) {
      const message = (err as { message?: string })?.message || ''
      setError(message.includes('Monitoring Viewer') ? 'Cloud Monitoring 조회 권한이 필요해요.' : '사용량을 불러오지 못했어요.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  const latest = rows.at(-1)
  const needsMonitoring = service === 'firestore' || service === 'storage'
  return <div className="billing-usage">
    {needsMonitoring && <div className="billing-refresh-row"><button type="button" className="mini-btn" onClick={() => void load()} disabled={loading}>{loading ? '조회 중…' : '새로고침'}</button></div>}
    <div className="firebase-service-tabs" role="tablist" aria-label="Firebase 서비스">
      {services.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={service === item.id} onClick={() => setService(item.id)}>{item.label}</button>
      ))}
    </div>
    {needsMonitoring && error ? <div className="banner-err">{error}</div> : needsMonitoring && loading && !rows.length ? <p className="muted">최근 30일 사용량을 불러오는 중…</p> : (
      <div className="firebase-service-page">
        {service === 'firestore' && <>
          <FirebaseQuota text="읽기 5만/일 · 쓰기 2만/일 · 삭제 2만/일 · 저장 1GB" />
          <div className="usage-charts">
            <UsageBarChart label="읽기" rows={rows} value={(row) => row.reads} quota={50000} quotaLabel="일 50,000회" />
            <UsageBarChart label="쓰기" rows={rows} value={(row) => row.writes} quota={20000} quotaLabel="일 20,000회" />
            <UsageBarChart label="삭제" rows={rows} value={(row) => row.deletes} quota={20000} quotaLabel="일 20,000회" />
          </div>
          {latest && <p className="limits-note">현재 표시값: 읽기 {usageNumber.format(latest.reads)} · 쓰기 {usageNumber.format(latest.writes)} · 삭제 {usageNumber.format(latest.deletes)}</p>}
        </>}
        {service === 'storage' && <>
          <FirebaseQuota text="파일 저장 5GB · 다운로드 1GB/일" />
          <div className="usage-charts">
            {storageAvailable ? <UsageBarChart label="파일 저장 총량" rows={rows} value={(row) => row.storageBytes} quota={5 * 1024 ** 3} quotaLabel="저장 5GB" format={formatBytes} /> : <div className="usage-chart unavailable"><b>파일 저장 총량</b><p>Cloud Storage 지표가 아직 수집되지 않았어요. 버킷 지표는 최대 하루 늦게 나타날 수 있어요.</p></div>}
          </div>
          {latest && storageAvailable && <p className="limits-note">현재 표시값: 파일 {formatBytes(latest.storageBytes)}</p>}
        </>}
        {service === 'hosting' && <FirebaseServiceSummary quota="전송 약 10GB/월" detail="Hosting 전송량은 앱에서 자동 집계하지 않아요. 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/hosting/usage`} />}
        {service === 'functions' && <FirebaseServiceSummary quota="호출 200만회/월" detail="함수별 호출·실행은 앱에서 자동 집계하지 않아요. 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/functions`} />}
        {service === 'auth' && <FirebaseServiceSummary quota="Google 로그인은 현재 규모에서 사실상 무제한" detail="로그인 사용자·인증 제공업체는 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users`} />}
      </div>
    )}
    <a className="btn primary block firebase-live-link" href={`https://console.firebase.google.com/project/${PROJECT_ID}/usage`} target="_blank" rel="noopener noreferrer">실시간 사용량 보기 →</a>
  </div>
}

function FirebaseQuota({ text }: { text: string }) {
  return <p className="firebase-quota-line"><b>무료 한도</b> · {text}</p>
}

function FirebaseServiceSummary({ quota, detail, href }: { quota: string; detail: string; href?: string }) {
  return (
    <div className="firebase-service-summary">
      <FirebaseQuota text={quota} />
      <p className="hint">{detail}</p>
      {href && <a className="btn subtle block" href={href} target="_blank" rel="noopener noreferrer">콘솔에서 보기 →</a>}
    </div>
  )
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)}KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)}MB`
  return `${(value / 1024 ** 3).toFixed(2)}GB`
}

function UsageBarChart({ label, rows, value, quota, quotaLabel, format = (number: number) => usageNumber.format(number) }: {
  label: string; rows: BillingDailyUsage[]; value: (row: BillingDailyUsage) => number; quota: number; quotaLabel: string; format?: (value: number) => string
}) {
  const values = rows.map(value)
  const current = values.at(-1) ?? 0
  const scaleMax = Math.max(quota * 1.12, ...values.map((item) => item * 1.08), 1)
  const threshold = Math.min(100, quota / scaleMax * 100)
  return <section className="usage-chart">
    <div className="usage-chart-head"><b>{label}</b><span>{format(current)}</span></div>
    <div className="usage-chart-plot">
      <div className="usage-threshold" style={{ bottom: `${threshold}%` }}><span>과금 시작 · {quotaLabel}</span></div>
      <div className="usage-bars">{rows.map((row, index) => {
        const amount = values[index]
        return <div className="usage-bar-slot" key={row.date} title={`${row.date} · ${format(amount)}`}><i className={amount > quota ? 'over' : ''} style={{ height: `${Math.max(amount ? 2 : 0, amount / scaleMax * 100)}%` }} /><small>{index % 5 === 0 || index === rows.length - 1 ? row.date.slice(5).replace('-', '/') : ''}</small></div>
      })}</div>
    </div>
  </section>
}

function TemplatePreviewCard() {
  const { workspace } = useAuth()
  const saved = getTemplatePreview()
  const active = saved ?? getWorkspaceTemplate(workspace?.templateId).id
  function select(id: WorkspaceTemplateId) {
    setTemplatePreview(id === getWorkspaceTemplate(workspace?.templateId).id ? null : id)
    window.location.reload()
  }
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>템플릿 미리보기</h3>
        <span className="guide-badge dev">소유자</span>
      </div>
      <p className="limits-note">현재 공간의 데이터는 바꾸지 않고 테마와 내비게이션만 시험합니다.</p>
      <div className="template-grid compact" role="radiogroup" aria-label="템플릿 미리보기">
        {Object.values(WORKSPACE_TEMPLATES).map((template) => (
          <button key={template.id} type="button" role="radio" aria-checked={active === template.id}
            className={'template-card' + (active === template.id ? ' on' : '')}
            style={{ ['--template-color' as string]: template.theme.accent }} onClick={() => select(template.id)}>
            <span className="template-symbol">{template.symbol}</span><b>{template.label}</b>
          </button>
        ))}
      </div>
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
  const [editing, setEditing] = useState(false)
  const [partFilter, setPartFilter] = useState<Part | 'all'>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0) // 0=이번 달, -1=지난 달 …
  const [earliestDate, setEarliestDate] = useState<string | null>(null)
  const [practiceCounts, setPracticeCounts] = useState<Record<string, number> | null>(null)
  useEffect(() => watchMembers(setMembers), [])
  useEffect(() => {
    getBand(bandId).then((b) => setOwnerUid(b?.ownerUid ?? null)).catch(() => {})
  }, [bandId])
  useEffect(() => {
    if (!open) return
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    let active = true
    setPracticeCounts(null)
    getMonthlyPracticeParticipation(fmt(start), fmt(end))
      .then((counts) => { if (active) setPracticeCounts(counts) })
      .catch(() => { if (active) setPracticeCounts({}) })
    return () => { active = false }
  }, [bandId, open, monthOffset])
  useEffect(() => {
    if (!open) return
    let active = true
    getEarliestEventDate().then((d) => { if (active) setEarliestDate(d) }).catch(() => {})
    return () => { active = false }
  }, [bandId, open])
  const viewMonth = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)
  const monthShort = monthOffset === 0 ? '이번 달' : `${viewMonth.getMonth() + 1}월`
  // 데이터가 존재하는 가장 이른 달까지만 뒤로 이동 허용
  const curMonthIdx = new Date().getFullYear() * 12 + new Date().getMonth()
  const minOffset = earliestDate ? (new Date(earliestDate).getFullYear() * 12 + new Date(earliestDate).getMonth()) - curMonthIdx : 0
  const sorted = [...members].sort(
    (a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || (a.name ?? '').localeCompare(b.name ?? '', 'ko'),
  )
  // 파트별 필터: 실제로 멤버가 있는 파트만 칩으로 노출
  const partChips = (['drum', 'bass', 'guitar', 'keyboard', 'vocal'] as Part[])
    .map((p) => [p, members.filter((m) => m.part === p).length] as const)
    .filter(([, count]) => count > 0)
  const visible = partFilter === 'all' ? sorted : sorted.filter((m) => m.part === partFilter)
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
    <div className={'limits-card mm-card' + (open ? ' open' : '')}>
      <div className="limits-head mm-head">
        <button type="button" className="mm-toggle" onClick={() => { setOpen((o) => !o); if (open) setEditing(false) }} aria-expanded={open}>
          <h3>멤버{members.length > 0 && <b className="fb-newbadge"> {members.length}</b>}</h3>
          <span className="guide-badge">관리자</span>
        </button>
        {open && partChips.length > 1 && (
          <div className="mm-filter-wrap">
            <button type="button" className={'mm-filter-btn' + (filterOpen || partFilter !== 'all' ? ' on' : '')} onClick={() => setFilterOpen((v) => !v)} aria-label="파트 필터" aria-pressed={filterOpen}>
              <Icon name="filter" />
            </button>
            {filterOpen && (
              <div className="mm-filter-menu" onMouseLeave={() => setFilterOpen(false)}>
                <button type="button" className={partFilter === 'all' ? 'on' : ''} onClick={() => { setPartFilter('all'); setFilterOpen(false) }}>전체 <span>{members.length}</span></button>
                {partChips.map(([part, count]) => (
                  <button key={part} type="button" className={partFilter === part ? 'on' : ''} onClick={() => { setPartFilter(part); setFilterOpen(false) }}>{PART_META[part].label} <span>{count}</span></button>
                ))}
              </div>
            )}
          </div>
        )}
        {open && partFilter !== 'all' && (
          <span className="mm-active-filter">
            {PART_META[partFilter as Part].label}
            <button type="button" onClick={() => setPartFilter('all')} aria-label="필터 해제">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </span>
        )}
        <div className="mm-right">
          {open && (
            <button type="button" className={'mm-edit' + (editing ? ' on' : '')} onClick={() => setEditing((v) => !v)} aria-label={editing ? '편집 완료' : '멤버 편집'} title={editing ? '완료' : '편집'}>
              {editing ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              )}
            </button>
          )}
          <button type="button" className="mm-open" onClick={() => { setOpen((o) => !o); if (open) setEditing(false) }} aria-label={open ? '멤버 목록 닫기' : '멤버 목록 열기'}>
            <svg className={'mm-chev' + (open ? ' open' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="mm-month">
          <button type="button" className="mm-month-nav" onClick={() => setMonthOffset((o) => Math.max(minOffset, o - 1))} disabled={monthOffset <= minOffset} aria-label="이전 달">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <b>{viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월 참여</b>
          <button type="button" className="mm-month-nav" onClick={() => setMonthOffset((o) => Math.min(0, o + 1))} disabled={monthOffset >= 0} aria-label="다음 달">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      )}
      {open && (
      <ul className={'mm-list' + (editing ? ' editing' : '')}>
        {visible.map((m) => {
          const isOwner = m.uid === ownerUid
          const self = m.uid === myUid
          return (
            <li key={m.uid}>
              <span className="mm-name">
                {m.name || '(이름 설정 전)'}
                {isOwner && <em className="mm-tag owner">소유자</em>}
                {m.admin && !isOwner && <em className="mm-tag admin">관리자</em>}
              </span>
              {editing ? (
                !self && !isOwner ? (
                  <div className="mm-actions">
                    <button type="button" className="btn subtle sm" disabled={busy === m.uid} onClick={() => void toggleAdmin(m)}>
                      {m.admin ? '관리자 해제' : '관리자 지정'}
                    </button>
                    <button type="button" className="btn danger sm" disabled={busy === m.uid} onClick={() => setConfirmKick(m)}>내보내기</button>
                  </div>
                ) : null
              ) : (
                <div className="mm-meta">
                  <span className="mm-part">{PART_META[m.part as Part]?.label ?? '파트 미정'}</span>
                  <span className="mm-sep" aria-hidden="true">·</span>
                  <em className="mm-practice-count" title="참석·늦참·조퇴 포함">{monthShort} {practiceCounts === null ? '…' : `${practiceCounts[m.uid] ?? 0}회`}</em>
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
  const personal = bands.filter((b) => b.templateId === 'personal')
  const shared = bands.filter((b) => b.templateId !== 'personal')
  const renderBands = (items: Band[], personalChannel: boolean) => (
    <ul className="bands-list">
      {items.map((b) => (
        <li key={b.id}>
          <span className="bands-name">
            {b.name}
            {b.unlimited && <em className="bands-unl">무제한</em>}
          </span>
          <span className="bands-meta">
            {!personalChannel && <>{b.memberCount ?? 0}{b.unlimited ? '' : '/5'}명 · </>}
            {((b.storageBytes ?? 0) / 1048576).toFixed(1)}MB · AI {b.aiUsage?.count ?? 0}회 · {fmtDay(b.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="limits-card">
      <div className="limits-head">
        <h3>채널 현황{bands.length > 0 && <b className="fb-newbadge"> {bands.length}</b>}</h3>
        <span className="guide-badge dev">개발자</span>
      </div>
      {bands.length === 0 ? (
        <p className="app-ver" style={{ textAlign: 'left', margin: 0 }}>밴드가 없어요.</p>
      ) : (
        <div className="bands-groups">
          {shared.length > 0 && <section><h4>공동 채널 <b>{shared.length}</b></h4>{renderBands(shared, false)}</section>}
          {personal.length > 0 && <section><h4>개인 채널 <b>{personal.length}</b></h4>{renderBands(personal, true)}</section>}
        </div>
      )}
    </div>
  )
}

const FB_TYPE_LABEL: Record<Feedback['type'], string> = { bug: '버그', idea: '개선', etc: '기타' }

/** 개발자 전용: 받은 의견·버그 제보 목록 + 처리 상태 토글 */
function AdminFeedbackCard({ toast, list }: { toast: ReturnType<typeof useToast>; list: Feedback[] }) {
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
    <>
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
    </>
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

function NotifCard() {
  const { user, bandId, isChannelMember } = useAuth()
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
    if (!user || !isChannelMember) return
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

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden' || !pushConfigured()) return
      const permission = notificationPermission()
      if (permission === 'granted') {
        void enable()
      } else {
        setState(permission === 'denied' ? 'denied' : 'idle')
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // 채널을 바꾸면 현재 채널의 멤버 문서에 알림 기기를 다시 연결한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, bandId, isChannelMember])

  const msg = !isChannelMember
    ? '개발자 점검 모드에서는 이 채널에 기기 알림 정보를 추가하지 않아요.'
    :
    state === 'on'
      ? '이 기기에서 알림을 받는 중이에요.'
      : state === 'denied'
        ? mobileOS() === 'android' && isStandaloneApp()
          ? 'Chrome 사이트 알림과 기기 설정의 Amici 알림을 모두 확인해 주세요.'
          : '브라우저에서 알림이 차단됐어요. 사이트 설정에서 허용해 주세요.'
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
