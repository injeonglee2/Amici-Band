import { useMemo, useState } from 'react'
import type { RunningEntry } from '../types'
import { useBackHandler } from '../backnav'

/**
 * 러닝 대시보드 — 러닝 폴더 엔트리를 가공해 KPI·추세·페이스↔심박 산점도·목록으로 표시.
 * Samsung Health 동기화가 쓸 표준 필드(아래)를 읽되, 이름이 조금 달라도 관대하게 파싱한다.
 *   startTime(ms), endTime(ms), date, distanceM, durationSec, avgHr, maxHr, calories, steps
 *   samples: [{ hr, paceSec | speed(m/s), t? }]  ← 러닝 중 실시간(구간) 데이터. 있으면 세부에서 상관 산점도로 표시.
 *
 * 탭 구성:
 *   주간 — 주간 거리 추세 + 목록. 페이스↔심박은 목록에서 러닝 세부로 들어가면 표시.
 *   월간 — 페이스↔심박(인라인) + 목록. 거리 추세 없음.
 *   연간 — 월간(12개월) 거리 추세 + 목록.
 */

type Period = 'week' | 'month' | 'year'

interface Sample { hr: number; paceSec: number }
interface Run {
  id: string
  startMs: number
  distanceKm?: number
  durationSec?: number
  paceSecPerKm?: number
  avgHr?: number
  maxHr?: number
  calories?: number
  steps?: number
  samples: Sample[]
}

function num(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function pick(e: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = num(e[k])
    if (n !== undefined) return n
  }
  return undefined
}
function normSamples(raw: unknown): Sample[] {
  if (!Array.isArray(raw)) return []
  const out: Sample[] = []
  for (const s of raw as Record<string, unknown>[]) {
    const hr = pick(s, ['hr', 'heartRate', 'bpm'])
    let paceSec = pick(s, ['paceSec', 'pace'])
    if (paceSec === undefined) {
      const spd = pick(s, ['speed', 'speedMps'])
      if (spd && spd > 0) paceSec = 1000 / spd
    }
    if (hr !== undefined && paceSec !== undefined) out.push({ hr, paceSec })
  }
  return out
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
  return {
    id: e.id,
    startMs,
    distanceKm,
    durationSec,
    paceSecPerKm,
    avgHr: pick(e, ['avgHr', 'heartRateAvg', 'hrAvg', 'bpmAvg']),
    maxHr: pick(e, ['maxHr', 'heartRateMax', 'hrMax', 'bpmMax']),
    calories: pick(e, ['calories', 'kcal', 'energyKcal']),
    steps: pick(e, ['steps', 'stepCount']),
    samples: normSamples((e as Record<string, unknown>).samples),
  }
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
function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function weekStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 월요일 기준
  return d.getTime()
}
function monthStart(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
function yearStart(ms: number): number {
  return new Date(new Date(ms).getFullYear(), 0, 1).getTime()
}
function periodStart(ms: number, p: Period): number {
  return p === 'week' ? weekStart(ms) : p === 'month' ? monthStart(ms) : yearStart(ms)
}

type Unit = 'week' | 'month'
function unitStart(ms: number, u: Unit): number {
  return u === 'week' ? weekStart(ms) : monthStart(ms)
}
function prevUnit(ms: number, u: Unit): number {
  const d = new Date(ms)
  if (u === 'week') d.setDate(d.getDate() - 7)
  else d.setMonth(d.getMonth() - 1)
  return unitStart(d.getTime(), u)
}
function unitLabel(ms: number, u: Unit): string {
  const d = new Date(ms)
  return u === 'week' ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getMonth() + 1}`
}

function agg(runs: Run[]) {
  const totalKm = runs.reduce((s, r) => s + (r.distanceKm ?? 0), 0)
  const totalSec = runs.reduce((s, r) => s + (r.durationSec ?? 0), 0)
  const count = runs.length
  return {
    totalKm,
    totalSec,
    count,
    avgPace: totalKm > 0 ? totalSec / totalKm : undefined,
    avgDur: count > 0 ? totalSec / count : undefined,
  }
}

const PERIODS: { k: Period; label: string }[] = [
  { k: 'week', label: '주간' },
  { k: 'month', label: '월간' },
  { k: 'year', label: '연간' },
]

export default function RunningDashboard({ entries }: { entries: RunningEntry[] }) {
  const [period, setPeriod] = useState<Period>('week')
  const [selected, setSelected] = useState<string | null>(null)
  const runs = useMemo(() => entries.map(normRun).sort((a, b) => b.startMs - a.startMs), [entries])

  const now = Date.now()
  const curStart = periodStart(now, period)
  const curRuns = useMemo(() => runs.filter((r) => periodStart(r.startMs, period) === curStart), [runs, period, curStart])
  const k = agg(curRuns)

  // 추세: 주간=최근 6주(주간 거리), 연간=최근 12개월(월간 거리), 월간=없음
  const trendUnit: Unit | null = period === 'week' ? 'week' : period === 'year' ? 'month' : null
  const trendCount = period === 'year' ? 12 : 6
  const trend = useMemo(() => {
    if (!trendUnit) return []
    const out: { start: number; km: number }[] = []
    let s = unitStart(now, trendUnit)
    for (let i = 0; i < trendCount; i++) {
      const km = runs.filter((r) => unitStart(r.startMs, trendUnit) === s).reduce((sum, r) => sum + (r.distanceKm ?? 0), 0)
      out.unshift({ start: s, km })
      s = prevUnit(s, trendUnit)
    }
    return out
  }, [runs, trendUnit, trendCount, now])
  const maxTrend = Math.max(1, ...trend.map((b) => b.km))

  if (!entries.length) {
    return (
      <div className="empty-state">
        <p>아직 러닝 데이터가 없어요.<br />위 Samsung Health 동기화로 최근 러닝을 가져와 보세요.</p>
      </div>
    )
  }

  const selectedRun = selected ? runs.find((r) => r.id === selected) : null
  if (selectedRun) return <RunDetail run={selectedRun} allRuns={runs} onBack={() => setSelected(null)} />

  return (
    <div className="run-dash">
      <div className="segmented set-seg run-period" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.k} role="tab" aria-selected={period === p.k} className={period === p.k ? 'on' : ''} onClick={() => setPeriod(p.k)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="run-kpis">
        <div className="run-kpi hl"><span className="run-kpi-l">총 거리</span><span className="run-kpi-v">{fmtKm(k.totalKm)}<em> km</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">러닝</span><span className="run-kpi-v">{k.count}<em> 회</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">총 시간</span><span className="run-kpi-v">{fmtDur(k.totalSec)}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 페이스</span><span className="run-kpi-v">{fmtPace(k.avgPace)}<em>/km</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 시간</span><span className="run-kpi-v">{fmtDur(k.avgDur)}</span></div>
      </div>

      {trendUnit && (
        <>
          <div className="run-sec-t">{trendUnit === 'week' ? '주간' : '월간'} 거리 추세</div>
          <div className="run-trend">
            {trend.map((b, i) => (
              <div key={b.start} className="run-bar-col">
                <div className="run-bar" style={{ height: `${Math.round((b.km / maxTrend) * 100)}%` }} data-cur={i === trend.length - 1 ? '1' : undefined} />
                <span className="run-bar-x">{unitLabel(b.start, trendUnit)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {period !== 'week' && <InlineCorrelation runs={curRuns} />}

      <div className="run-sec-t">러닝 기록</div>
      {curRuns.length ? (
        <div className="run-list">
          {curRuns.map((r) => (
            <button key={r.id} type="button" className="run-row" onClick={() => setSelected(r.id)}>
              <div className="run-row-date"><b>{fmtDate(r.startMs)}</b></div>
              <div className="run-row-main">
                <div className="run-row-dist">{fmtKm(r.distanceKm)} km</div>
                <div className="run-row-sub">{fmtDur(r.durationSec)} · {fmtPace(r.paceSecPerKm)}/km{r.avgHr ? ` · ♥ ${Math.round(r.avgHr)}` : ''}</div>
              </div>
              <svg className="run-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: '2px' }}>이 기간에는 러닝 기록이 없어요.</p>
      )}
    </div>
  )
}

/** 러닝 세부: 요약 + 이번 러닝의 페이스↔심박(실시간 구간 데이터). 없으면 전체 러닝 중 이 러닝 위치. */
function RunDetail({ run, allRuns, onBack }: { run: Run; allRuns: Run[]; onBack: () => void }) {
  useBackHandler(onBack)
  const d = new Date(run.startMs)
  const hasSamples = run.samples.length >= 3
  return (
    <div className="run-detail">
      <button type="button" className="run-detail-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        기록으로
      </button>
      <div className="run-detail-head">
        <b>{d.getFullYear()}. {d.getMonth() + 1}. {d.getDate()}</b>
        <span>{fmtKm(run.distanceKm)} km</span>
      </div>

      <div className="run-kpis run-detail-kpis">
        <div className="run-kpi"><span className="run-kpi-l">시간</span><span className="run-kpi-v">{fmtDur(run.durationSec)}</span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 페이스</span><span className="run-kpi-v">{fmtPace(run.paceSecPerKm)}<em>/km</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">평균 심박</span><span className="run-kpi-v">{run.avgHr ? Math.round(run.avgHr) : '-'}<em> bpm</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">최대 심박</span><span className="run-kpi-v">{run.maxHr ? Math.round(run.maxHr) : '-'}<em> bpm</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">칼로리</span><span className="run-kpi-v">{run.calories ? Math.round(run.calories) : '-'}<em> kcal</em></span></div>
        <div className="run-kpi"><span className="run-kpi-l">걸음</span><span className="run-kpi-v">{run.steps ? Math.round(run.steps).toLocaleString() : '-'}</span></div>
      </div>

      {hasSamples ? (
        <>
          <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">이번 러닝 구간별 · 빠를수록 오른쪽</span></div>
          <Scatter points={run.samples.map((s) => ({ paceSec: s.paceSec, hr: s.hr }))} radius={3.5} />
        </>
      ) : (
        <RunInHistory run={run} allRuns={allRuns} />
      )}
    </div>
  )
}

/** 실시간 구간 데이터가 없을 때: 전체 러닝(평균값) 중 이 러닝의 위치를 강조. */
function RunInHistory({ run, allRuns }: { run: Run; allRuns: Run[] }) {
  const pts = allRuns
    .filter((r) => r.paceSecPerKm !== undefined && r.avgHr !== undefined)
    .sort((a, b) => a.startMs - b.startMs)
  if (pts.length < 3) return null
  const highlightIdx = pts.findIndex((r) => r.id === run.id)
  return (
    <>
      <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">전체 러닝 중 이번 기록(강조) 위치</span></div>
      <Scatter points={pts.map((r) => ({ paceSec: r.paceSecPerKm as number, hr: r.avgHr as number }))} highlightIdx={highlightIdx} />
    </>
  )
}

/** 월간/연간 대시보드 인라인: 기간 내 러닝(평균값)의 페이스↔심박 상관. */
function InlineCorrelation({ runs }: { runs: Run[] }) {
  const pts = runs
    .filter((r) => r.paceSecPerKm !== undefined && r.avgHr !== undefined)
    .sort((a, b) => a.startMs - b.startMs)
  return (
    <>
      <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">최근일수록 진함 · 같은 페이스·낮은 심박 = 향상</span></div>
      {pts.length >= 3 ? (
        <Scatter points={pts.map((r) => ({ paceSec: r.paceSecPerKm as number, hr: r.avgHr as number }))} />
      ) : (
        <p className="hint" style={{ margin: '0 2px' }}>러닝 3건 이상 쌓이면 상관관계 그래프가 표시돼요.</p>
      )}
    </>
  )
}

/** 페이스(x, 빠를수록 오른쪽) ↔ 심박(y) 산점도. 점은 순서(오래됨→최근/시작→끝)에 따라 진해짐. */
function Scatter({ points, highlightIdx, radius = 5 }: { points: { paceSec: number; hr: number }[]; highlightIdx?: number; radius?: number }) {
  const W = 320, H = 180, padL = 40, padR = 12, padT = 12, padB = 26
  const paces = points.map((p) => p.paceSec)
  const hrs = points.map((p) => p.hr)
  const pMin = Math.min(...paces), pMax = Math.max(...paces)
  const hMin = Math.min(...hrs), hMax = Math.max(...hrs)
  const px = (p: number) => padL + (pMax === pMin ? 0.5 : (pMax - p) / (pMax - pMin)) * (W - padL - padR)
  const py = (h: number) => padT + (hMax === hMin ? 0.5 : (hMax - h) / (hMax - hMin)) * (H - padT - padB)
  const n = points.length
  return (
    <svg className="run-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="페이스 대 심박 산점도">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
      <text x={4} y={padT + 8} className="run-ax">{Math.round(hMax)}</text>
      <text x={4} y={H - padB} className="run-ax">{Math.round(hMin)}</text>
      <text x={padL} y={H - 6} className="run-ax">느림</text>
      <text x={W - padR - 24} y={H - 6} className="run-ax">빠름</text>
      {points.map((p, i) => {
        const t = n > 1 ? i / (n - 1) : 1
        const hi = i === highlightIdx
        return (
          <circle
            key={i}
            cx={px(p.paceSec)}
            cy={py(p.hr)}
            r={hi ? radius + 3 : radius}
            fill={hi ? 'var(--accent)' : `color-mix(in srgb, var(--ok) ${Math.round(30 + t * 70)}%, var(--ink-faint))`}
            stroke={hi ? 'var(--bg)' : 'none'}
            strokeWidth={hi ? 2 : 0}
          />
        )
      })}
    </svg>
  )
}
