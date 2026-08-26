import { useEffect, useState } from 'react'
import { getBillingUsageStats, type BillingDailyUsage } from '../data'

const PROJECT_ID = 'amicicalender'
const usageNumber = new Intl.NumberFormat('ko-KR')
type FirebaseService = 'firestore' | 'storage' | 'hosting' | 'functions' | 'auth'
const SERVICES: { id: FirebaseService; label: string }[] = [
  { id: 'firestore', label: 'Firestore' }, { id: 'storage', label: 'Storage' },
  { id: 'hosting', label: 'Hosting' }, { id: 'functions', label: 'Functions' }, { id: 'auth', label: 'Auth' },
]

export default function FirebaseUsage() {
  const [service, setService] = useState<FirebaseService>('firestore')
  const [rows, setRows] = useState<BillingDailyUsage[]>([])
  const [storageAvailable, setStorageAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const result = await getBillingUsageStats(30)
      setRows(result.rows); setStorageAvailable(result.storageAvailable)
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
      {SERVICES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={service === item.id} onClick={() => setService(item.id)}>{item.label}</button>)}
    </div>
    {needsMonitoring && error ? <div className="banner-err">{error}</div> : needsMonitoring && loading && !rows.length ? <p className="muted">최근 30일 사용량을 불러오는 중…</p> : <div className="firebase-service-page">
      {service === 'firestore' && <><FirebaseQuota text="읽기 5만/일 · 쓰기 2만/일 · 삭제 2만/일 · 저장 1GB" /><div className="usage-charts">
        <UsageBarChart label="읽기" rows={rows} value={(row) => row.reads} quota={50000} quotaLabel="일 50,000회" />
        <UsageBarChart label="쓰기" rows={rows} value={(row) => row.writes} quota={20000} quotaLabel="일 20,000회" />
        <UsageBarChart label="삭제" rows={rows} value={(row) => row.deletes} quota={20000} quotaLabel="일 20,000회" />
      </div>{latest && <p className="limits-note">현재 표시값: 읽기 {usageNumber.format(latest.reads)} · 쓰기 {usageNumber.format(latest.writes)} · 삭제 {usageNumber.format(latest.deletes)}</p>}</>}
      {service === 'storage' && <><FirebaseQuota text="파일 저장 5GB · 다운로드 1GB/일" /><div className="usage-charts">
        {storageAvailable ? <UsageBarChart label="파일 저장 총량" rows={rows} value={(row) => row.storageBytes} quota={5 * 1024 ** 3} quotaLabel="저장 5GB" format={formatBytes} /> : <div className="usage-chart unavailable"><b>파일 저장 총량</b><p>Cloud Storage 지표가 아직 수집되지 않았어요. 버킷 지표는 최대 하루 늦게 나타날 수 있어요.</p></div>}
      </div>{latest && storageAvailable && <p className="limits-note">현재 표시값: 파일 {formatBytes(latest.storageBytes)}</p>}</>}
      {service === 'hosting' && <FirebaseServiceSummary quota="전송 약 10GB/월" detail="Hosting 전송량은 앱에서 자동 집계하지 않아요. 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/hosting/usage`} />}
      {service === 'functions' && <FirebaseServiceSummary quota="호출 200만회/월" detail="함수별 호출·실행은 앱에서 자동 집계하지 않아요. 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/functions`} />}
      {service === 'auth' && <FirebaseServiceSummary quota="Google 로그인은 현재 규모에서 사실상 무제한" detail="로그인 사용자·인증 제공업체는 콘솔에서 확인하세요." href={`https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users`} />}
    </div>}
    <a className="btn primary block firebase-live-link" href={`https://console.firebase.google.com/project/${PROJECT_ID}/usage`} target="_blank" rel="noopener noreferrer">실시간 사용량 보기 →</a>
  </div>
}

function FirebaseQuota({ text }: { text: string }) { return <p className="firebase-quota-line"><b>무료 한도</b> · {text}</p> }
function FirebaseServiceSummary({ quota, detail, href }: { quota: string; detail: string; href: string }) {
  return <div className="firebase-service-summary"><FirebaseQuota text={quota} /><p className="hint">{detail}</p><a className="btn subtle block" href={href} target="_blank" rel="noopener noreferrer">콘솔에서 보기 →</a></div>
}
function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)}KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)}MB`
  return `${(value / 1024 ** 3).toFixed(2)}GB`
}
function UsageBarChart({ label, rows, value, quota, quotaLabel, format = (number: number) => usageNumber.format(number) }: { label: string; rows: BillingDailyUsage[]; value: (row: BillingDailyUsage) => number; quota: number; quotaLabel: string; format?: (value: number) => string }) {
  const values = rows.map(value); const current = values.at(-1) ?? 0
  const scaleMax = Math.max(quota * 1.12, ...values.map((item) => item * 1.08), 1); const threshold = Math.min(100, quota / scaleMax * 100)
  return <section className="usage-chart"><div className="usage-chart-head"><b>{label}</b><span>{format(current)}</span></div><div className="usage-chart-plot">
    <div className="usage-threshold" style={{ bottom: `${threshold}%` }}><span>과금 시작 · {quotaLabel}</span></div>
    <div className="usage-bars">{rows.map((row, index) => { const amount = values[index]; return <div className="usage-bar-slot" key={row.date} title={`${row.date} · ${format(amount)}`}><i className={amount > quota ? 'over' : ''} style={{ height: `${Math.max(amount ? 2 : 0, amount / scaleMax * 100)}%` }} /><small>{index % 5 === 0 || index === rows.length - 1 ? row.date.slice(5).replace('-', '/') : ''}</small></div> })}</div>
  </div></section>
}
