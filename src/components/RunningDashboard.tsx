import { useMemo, useState } from 'react'
import type { RunningEntry } from '../types'

/**
 * 러닝 대시보드 — 러닝 폴더 엔트리를 가공해 KPI·추세·페이스↔심박 산점도·목록으로 표시.
 * Health Connect 동기화가 쓸 표준 필드(아래)를 읽되, 이름이 조금 달라도 관대하게 파싱한다.
 *   startTime(ms), endTime(ms), date('YYYY-MM-DD'), distanceM, durationSec, avgHr, maxHr, calories, steps
 */

type Period = 'week' | 'month'

interface Run {
  id: string
  startMs: number
  distanceKm?: number
  durationSec?: number
  paceSecPerKm?: number
  avgHr?: number
  calories?: number
}

function num(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function pick(e: RunningEntry, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = num(e[k])
    if (n !== undefined) return n
  }
  return undefined
}
function normRun(e: RunningEntry): Run {
  const startMs =
    pick(e, ['startTime', 'startMs']) ??
    (typeof e.date === 'string' ? Date.parse(e.date) : undefined) ??
    pick(e, ['createdAt']) ??
    0
  const endMs = pick(e, ['endTime', 'endMs'])
  let durationSec = pick(e, ['durationSec', 'duration'])
  if (durationSec === undefined && endMs !== undefined && startMs) durationSec = Math.round((endMs - startMs) / 1000)
  const distM = pick(e, ['distanceM', 'distanceMeters', 'distance'])
  const distanceKm = distM !== undefined ? distM / 1000 : pick(e, ['distanceKm'])
  const paceSecPerKm = durationSec && distanceKm ? durationSec / distanceKm : undefined
  const avgHr = pick(e, ['avgHr', 'heartRateAvg', 'hrAvg', 'bpmAvg'])
  const calories = pick(e, ['calories', 'kcal', 'energyKcal'])
  return { id: e.id, startMs, distanceKm, durationSec, paceSecPerKm, avgHr, calories }
}

function fmtPace(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '-'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}
function fmtDur(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
function fmtKm(km?: number): string {
  return km !== undefined ? km.toFixed(1) : '-'
}

// 주 시작(월요일 00:00 로컬)
function weekStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // 월=0
  d.setDate(d.getDate() - day)
  return d.getTime()
}
function monthStart(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
function periodStart(ms: number, p: Period): number {
  return p === 'week' ? weekStart(ms) : monthStart(ms)
}
function prevPeriod(ms: number, p: Period): number {
  const d = new Date(ms)
  if (p === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  return periodStart(d.getTime(), p)
}
function periodLabel(ms: number, p: Period): string {
  const d = new Date(ms)
  return p === 'week' ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear() % 100}.${d.getMonth() + 1}`
}

function agg(runs: Run[]) {
  const withDist = runs.filter((r) => r.distanceKm !== undefined)
  const totalKm = withDist.reduce((s, r) => s + (r.distanceKm ?? 0), 0)
  const totalSec = runs.reduce((s, r) => s + (r.durationSec ?? 0), 0)
  const count = runs.length
  const avgPace = totalKm > 0 ? totalSec / totalKm : undefined
  const avgDur = count > 0 ? totalSec / count : undefined
  return { totalKm, totalSec, count, avgPace, avgDur }
}

export default function RunningDashboard({ entries }: { entries: RunningEntry[] }) {
  const [period, setPeriod] = useState<Period>('week')
  const runs = useMemo(() => entries.map(normRun).sort((a, b) => b.startMs - a.startMs), [entries])

  const now = Date.now()
  const curStart = periodStart(now, period)
  const curRuns = runs.filter((r) => periodStart(r.startMs, period) === curStart)
  const k = agg(curRuns)

  // 최근 6개 구간 추세(거리)
  const trend = useMemo(() => {
    const buckets: { start: number; km: number }[] = []
    let s = curStart
    for (let i = 0; i < 6; i++) {
      const km = runs
        .filter((r) => periodStart(r.startMs, period) === s)
        .reduce((sum, r) => sum + (r.distanceKm ?? 0), 0)
      buckets.unshift({ start: s, km })
      s = prevPeriod(s, period)
    }
    return buckets
  }, [runs, period, curStart])
  const maxTrend = Math.max(1, ...trend.map((b) => b.km))

  if (!entries.length) {
    return (
      <div className="empty-state">
        <p>아직 러닝 데이터가 없어요.<br />Health Connect 연동이 추가되면 여기에 통계·기록이 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div className="run-dash">
      <div className="segmented set-seg run-period" role="tablist">
        <button role="tab" aria-selected={period === 'week'} className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>주간</button>
        <button role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>월간</button>
      </div>

      <div className="run-kpis">
        <div className="run-kpi hl"><span className="run-kpi-l">총 거리</span><span className="run-kpi-v">{fmtKm(k.totalKm)}<em> km</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">러닝</span><span className="run-kpi-v">{k.count}<em> 회</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">총 시간</span><span className="run-kpi-v">{fmtDur(k.totalSec)}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 페이스</span><span className="run-kpi-v">{fmtPace(k.avgPace)}<em>/km</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 시간</span><span className="run-kpi-v">{fmtDur(k.avgDur)}</span></div>
      </div>

      <div className="run-sec-t">{period === 'week' ? '주간' : '월간'} 거리 추세</div>
      <div className="run-trend">
        {trend.map((b, i) => (
          <div key={b.start} className="run-bar-col">
            <div className="run-bar" style={{ height: `${Math.round((b.km / maxTrend) * 100)}%` }} data-cur={i === trend.length - 1 ? '1' : undefined} />
            <span className="run-bar-x">{periodLabel(b.start, period)}</span>
          </div>
        ))}
      </div>

      <PaceHrScatter runs={runs} />

      <div className="run-sec-t">러닝 기록</div>
      <div className="run-list">
        {runs.slice(0, 30).map((r) => {
          const d = new Date(r.startMs)
          return (
            <div key={r.id} className="run-row">
              <div className="run-row-date"><b>{d.getMonth() + 1}/{d.getDate()}</b></div>
              <div className="run-row-main">
                <div className="run-row-dist">{fmtKm(r.distanceKm)} km</div>
                <div className="run-row-sub">{fmtDur(r.durationSec)} · {fmtPace(r.paceSecPerKm)}/km{r.avgHr ? ` · ♥ ${Math.round(r.avgHr)}` : ''}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 페이스(x) ↔ 평균 심박(y) 산점도. 최근일수록 강조색. */
function PaceHrScatter({ runs }: { runs: Run[] }) {
  const pts = runs.filter((r) => r.paceSecPerKm !== undefined && r.avgHr !== undefined)
  if (pts.length < 3) {
    return (
      <>
        <div className="run-sec-t">페이스 ↔ 심박</div>
        <p className="hint" style={{ margin: '0 2px' }}>러닝 3건 이상 쌓이면 상관관계 그래프가 표시돼요.</p>
      </>
    )
  }
  const W = 320, H = 180, padL = 40, padR = 12, padT = 12, padB = 26
  const paces = pts.map((p) => p.paceSecPerKm as number)
  const hrs = pts.map((p) => p.avgHr as number)
  const pMin = Math.min(...paces), pMax = Math.max(...paces)
  const hMin = Math.min(...hrs), hMax = Math.max(...hrs)
  const px = (p: number) => padL + (pMax === pMin ? 0.5 : (pMax - p) / (pMax - pMin)) * (W - padL - padR) // 빠름(작은 pace) 오른쪽
  const py = (h: number) => padT + (hMax === hMin ? 0.5 : (hMax - h) / (hMax - hMin)) * (H - padT - padB)
  // recency: 오래됨(0)→최근(1). runs 는 최신순이므로 인덱스 역순.
  const order = [...pts].sort((a, b) => a.startMs - b.startMs)
  const rank = new Map(order.map((p, i) => [p.id, order.length > 1 ? i / (order.length - 1) : 1]))
  return (
    <>
      <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">최근일수록 진함 · 같은 페이스·낮은 심박 = 향상</span></div>
      <svg className="run-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="페이스 대 심박 산점도">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
        <text x={4} y={padT + 8} className="run-ax">{Math.round(hMax)}</text>
        <text x={4} y={H - padB} className="run-ax">{Math.round(hMin)}</text>
        <text x={padL} y={H - 6} className="run-ax">느림</text>
        <text x={W - padR - 24} y={H - 6} className="run-ax">빠름</text>
        {pts.map((p) => {
          const t = rank.get(p.id) ?? 1
          return <circle key={p.id} cx={px(p.paceSecPerKm as number)} cy={py(p.avgHr as number)} r={5} fill={`color-mix(in srgb, var(--ok) ${Math.round(30 + t * 70)}%, var(--ink-faint))`} />
        })}
      </svg>
    </>
  )
}
