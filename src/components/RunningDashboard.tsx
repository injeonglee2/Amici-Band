import { useEffect, useMemo, useRef, useState } from 'react'
import type { RunningEntry, RunningSplit } from '../types'
import { useBackHandler } from '../backnav'
import { fullKmSplits, paceDeltaLabel, runningSplits } from '../runningSplits'
import ThemeSelect from './ThemeSelect'

/**
 * 러닝 대시보드 — 러닝 폴더 엔트리를 가공해 KPI·추세·페이스↔심박 산점도·목록으로 표시.
 * Samsung Health 동기화가 쓸 표준 필드(아래)를 읽되, 이름이 조금 달라도 관대하게 파싱한다.
 *   startTime(ms), endTime(ms), date, distanceM, durationSec, avgHr, maxHr, calories, steps
 *   samples: [{ hr, paceSec | speed(m/s), t? }]  ← 러닝 중 실시간(구간) 데이터. 있으면 세부에서 상관 산점도로 표시.
 *
 * 탭 구성:
 *   주간 — 오늘을 포함한 최근 7일 기록.
 *   월간 — 현재 달의 기록.
 *   연간 — 선택한 연도의 1월~12월 기록과 월별 거리 추세.
 */

type Period = 'week' | 'month' | 'year' | 'analysis'
type YearScope = `${number}`
type InsightTone = 'good' | 'watch' | 'info'

interface RunInsight {
  tone: InsightTone
  label: string
  message: string
}

interface InsightCandidate extends RunInsight {
  score: number
}

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
  splits: RunningSplit[]
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
    splits: runningSplits(e),
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
function fmtFullDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`
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
type Unit = 'week' | 'month'
function unitStart(ms: number, u: Unit): number {
  return u === 'week' ? weekStart(ms) : monthStart(ms)
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

const DAY_MS = 86_400_000

function dayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function shiftDays(ms: number, amount: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + amount)
  return d.getTime()
}

function averageHeartRate(runs: Run[]): number | undefined {
  let total = 0
  let weight = 0
  for (const run of runs) {
    if (run.avgHr === undefined) continue
    const runWeight = run.durationSec ?? 1
    total += run.avgHr * runWeight
    weight += runWeight
  }
  return weight ? total / weight : undefined
}

function activeDayCount(runs: Run[]): number {
  return new Set(runs.map((run) => dayStart(run.startMs))).size
}

function longestRunStreak(runs: Run[]): number {
  const days = [...new Set(runs.map((run) => dayStart(run.startMs)))].sort((a, b) => a - b)
  let longest = 0
  let current = 0
  let previous: number | undefined
  for (const day of days) {
    current = previous !== undefined && shiftDays(previous, 1) === day ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = day
  }
  return longest
}

function secText(seconds: number): string {
  return `${Math.max(1, Math.round(Math.abs(seconds)))}초`
}

function weeklyInsight(runs: Run[], now: number): RunInsight {
  const currentStart = shiftDays(dayStart(now), -6)
  const previousStart = shiftDays(currentStart, -7)
  const current = runs.filter((run) => run.startMs >= currentStart && run.startMs <= now)
  const previous = runs.filter((run) => run.startMs >= previousStart && run.startMs < currentStart)
  const history = runs.filter((run) => run.startMs < currentStart)
  const currentAgg = agg(current)
  const previousAgg = agg(previous)
  const candidates: InsightCandidate[] = []
  const add = (score: number, message: string) => candidates.push({ score, tone: 'good', label: '오늘의 좋은 변화', message })

  const currentHr = averageHeartRate(current)
  const previousHr = averageHeartRate(previous)
  if (currentHr !== undefined && previousHr !== undefined && currentAgg.avgPace && previousAgg.avgPace) {
    const similarPace = Math.abs(currentAgg.avgPace - previousAgg.avgPace) <= Math.max(15, previousAgg.avgPace * 0.05)
    const heartGain = previousHr - currentHr
    if (similarPace && heartGain >= 2) add(100, `비슷한 페이스에서 평균 심박이 직전 7일보다 ${Math.round(heartGain)}bpm 낮아졌어요.`)
  }

  if (currentAgg.avgPace && previousAgg.avgPace) {
    const paceGain = previousAgg.avgPace - currentAgg.avgPace
    if (paceGain >= 3) add(94, `최근 7일 평균 페이스가 직전 7일보다 ${secText(paceGain)}/km 빨라졌어요.`)
  }

  const currentEligible = current.filter((run) => (run.distanceKm ?? 0) >= 3 && run.paceSecPerKm)
  const historyEligible = history.filter((run) => (run.distanceKm ?? 0) >= 3 && run.paceSecPerKm)
  if (currentEligible.length && historyEligible.length) {
    const fastestNow = Math.min(...currentEligible.map((run) => run.paceSecPerKm as number))
    const fastestBefore = Math.min(...historyEligible.map((run) => run.paceSecPerKm as number))
    if (fastestBefore - fastestNow >= 3) add(92, `최근 7일 최고 페이스가 이전 기록보다 ${secText(fastestBefore - fastestNow)}/km 빨라졌어요.`)
  }

  const longestNow = Math.max(0, ...current.map((run) => run.distanceKm ?? 0))
  const longestBefore = Math.max(0, ...history.map((run) => run.distanceKm ?? 0))
  if (longestNow >= 3 && longestNow >= longestBefore + 0.25) add(90, `최근 7일에 최장 거리 ${longestNow.toFixed(1)}km를 새로 기록했어요.`)

  if (previousAgg.totalKm >= 2 && currentAgg.totalKm >= previousAgg.totalKm + 1) {
    add(78, `최근 7일에 직전 7일보다 ${(currentAgg.totalKm - previousAgg.totalKm).toFixed(1)}km 더 달렸어요.`)
  }

  const activeNow = activeDayCount(current)
  const activeBefore = activeDayCount(previous)
  if (activeNow >= 2 && activeNow > activeBefore) add(72, `최근 7일에 ${activeNow}일 달려 직전 7일보다 ${activeNow - activeBefore}일 더 꾸준했어요.`)

  if (current.length) {
    add(42, `최근 7일 동안 ${current.length}회, 총 ${currentAgg.totalKm.toFixed(1)}km를 차곡차곡 쌓았어요.`)
    if (longestNow > 0) add(36, `최근 7일 가장 긴 러닝은 ${longestNow.toFixed(1)}km예요. 좋은 흐름을 이어가고 있어요.`)
    if (currentAgg.avgPace) add(32, `최근 7일 평균 페이스는 ${fmtPace(currentAgg.avgPace)}/km예요. 오늘의 기준으로 기억해두세요.`)
  }

  if (!candidates.length) return { tone: 'good', label: '오늘의 좋은 변화', message: '최근 7일 기록이 아직 없어요. 오늘은 짧고 가볍게 시작해도 좋아요.' }
  candidates.sort((a, b) => b.score - a.score)
  const dailyChoices = candidates.slice(0, Math.min(3, candidates.length))
  const dayNumber = Math.floor(dayStart(now) / DAY_MS)
  return dailyChoices[dayNumber % dailyChoices.length]
}

function monthlyInsight(runs: Run[], now: number): RunInsight {
  const today = new Date(now)
  const currentStart = monthStart(now)
  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime()
  const previousLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  const previousEnd = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), previousLastDay), 23, 59, 59, 999).getTime()
  const current = runs.filter((run) => run.startMs >= currentStart && run.startMs <= now)
  const previous = runs.filter((run) => run.startMs >= previousStart && run.startMs <= previousEnd)
  const currentAgg = agg(current)
  const previousAgg = agg(previous)
  const candidates: InsightCandidate[] = []
  const watch = (score: number, message: string) => candidates.push({ score, tone: 'watch', label: '이번 달 체크 포인트', message })
  const info = (score: number, message: string) => candidates.push({ score, tone: 'info', label: '이번 달 참고 변화', message })

  const latest = runs.find((run) => run.startMs <= now)
  if (latest) {
    const restDays = Math.floor((dayStart(now) - dayStart(latest.startMs)) / DAY_MS)
    if (restDays >= 10) watch(120, `마지막 러닝 후 ${restDays}일 지났어요. 다시 시작할 때는 거리와 강도를 낮춰보세요.`)
    else if (restDays >= 7) info(84, `마지막 러닝 후 ${restDays}일 지났어요. 다음 러닝은 가볍게 몸 상태를 확인하며 시작해보세요.`)
  }

  const currentHr = averageHeartRate(current)
  const previousHr = averageHeartRate(previous)
  if (current.length >= 2 && previous.length >= 2 && currentHr !== undefined && previousHr !== undefined && currentAgg.avgPace && previousAgg.avgPace) {
    const similarPace = Math.abs(currentAgg.avgPace - previousAgg.avgPace) <= Math.max(15, previousAgg.avgPace * 0.05)
    const heartRise = currentHr - previousHr
    if (similarPace && heartRise >= 5) watch(112, `비슷한 평균 페이스인데 심박이 지난달 같은 기간보다 ${Math.round(heartRise)}bpm 높아요. 수면·더위·피로 상태를 참고하세요.`)
  }

  if (previousAgg.totalKm >= 3 && currentAgg.totalKm >= previousAgg.totalKm * 1.3 && currentAgg.totalKm - previousAgg.totalKm >= 3) {
    const increase = Math.round((currentAgg.totalKm / previousAgg.totalKm - 1) * 100)
    watch(104, `지난달 같은 기간보다 러닝 거리가 ${increase}% 늘었어요. 피로가 누적되지 않도록 다음 운동 강도를 조절해보세요.`)
  }

  const streak = longestRunStreak(current)
  if (streak >= 3) watch(96, `이번 달에 ${streak}일 연속 달린 구간이 있어요. 다음 강도 높은 운동 전 회복 상태를 확인해보세요.`)

  if (previous.length >= 2 && current.length >= previous.length + 3) {
    watch(88, `지난달 같은 기간보다 러닝 횟수가 ${current.length - previous.length}회 늘었어요. 횟수와 강도를 동시에 높이지 않도록 참고하세요.`)
  }

  if (currentAgg.avgPace && previousAgg.avgPace && current.length >= 2 && previous.length >= 2) {
    const paceLoss = currentAgg.avgPace - previousAgg.avgPace
    if (paceLoss >= 8) info(76, `평균 페이스가 지난달 같은 기간보다 ${secText(paceLoss)}/km 느려졌어요. 거리·심박·컨디션 변화와 함께 참고하세요.`)
  }

  const longest = Math.max(0, ...current.map((run) => run.distanceKm ?? 0))
  if (current.length >= 2 && currentAgg.totalKm >= 5 && longest / currentAgg.totalKm >= 0.65) {
    info(64, `이번 달 거리의 ${Math.round(longest / currentAgg.totalKm * 100)}%가 가장 긴 한 번의 러닝에 집중돼 있어요.`)
  }

  if (previousAgg.totalKm > 0 && currentAgg.totalKm > 0) {
    const change = Math.round((currentAgg.totalKm / previousAgg.totalKm - 1) * 100)
    info(40, `지난달 같은 기간과 비교해 거리는 ${Math.abs(change)}% ${change >= 0 ? '늘었어요' : '줄었어요'}. 현재 훈련 흐름을 판단할 때 참고하세요.`)
  } else if (current.length) {
    info(30, `이번 달 현재 ${current.length}회, ${currentAgg.totalKm.toFixed(1)}km를 달렸어요. 비교 기록이 더 쌓이면 변화도 함께 알려드릴게요.`)
  } else {
    info(20, '이번 달 러닝 기록이 아직 없어요. 첫 기록이 들어오면 우선 확인할 변화를 알려드릴게요.')
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]
}

function useDailyNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const next = new Date(now)
    next.setHours(24, 0, 1, 0)
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1000, next.getTime() - Date.now()))
    return () => window.clearTimeout(timer)
  }, [now])
  return now
}

const PERIODS: { k: Period; label: string }[] = [
  { k: 'week', label: '주간' },
  { k: 'month', label: '월간' },
  { k: 'year', label: '연간' },
  { k: 'analysis', label: '분석' },
]

export default function RunningDashboard({ entries }: { entries: RunningEntry[] }) {
  const [period, setPeriod] = useState<Period>('week')
  const [yearScope, setYearScope] = useState<YearScope>(() => String(new Date().getFullYear()) as YearScope)
  const [selected, setSelected] = useState<string | null>(null)
  const activeYearRef = useRef<HTMLButtonElement>(null)
  const runs = useMemo(() => entries.map(normRun).sort((a, b) => b.startMs - a.startMs), [entries])

  const now = useDailyNow()
  const recentWeekStart = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 6)
    return d.getTime()
  }, [now])
  const curRuns = useMemo(() => runs.filter((r) => {
    if (period === 'week') return r.startMs >= recentWeekStart && r.startMs <= now
    if (period === 'month') return monthStart(r.startMs) === monthStart(now)
    if (period === 'analysis') return true
    return new Date(r.startMs).getFullYear() === Number(yearScope)
  }), [runs, period, yearScope, now, recentWeekStart])
  const k = agg(curRuns)
  const insight = useMemo(() => period === 'week' ? weeklyInsight(runs, now) : period === 'month' ? monthlyInsight(runs, now) : null, [period, runs, now])

  const yearOptions = useMemo(() => {
    const years = new Set(runs.filter((r) => r.startMs > 0).map((r) => new Date(r.startMs).getFullYear()))
    years.add(new Date().getFullYear())
    return [...years].sort((a, b) => b - a).map((year) => ({ value: String(year), label: `${year}년` }))
  }, [runs])

  useEffect(() => {
    if (period !== 'year') return
    const frame = window.requestAnimationFrame(() => activeYearRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [period, yearScope])

  // 거리 추세는 연간 탭에서만 월별로 표시한다.
  const trendUnit: Unit | null = period === 'year' ? 'month' : null
  const trend = useMemo(() => {
    if (!trendUnit) return []
    const out: { start: number; km: number; current?: boolean }[] = []
    const year = Number(yearScope)
    for (let month = 0; month < 12; month++) {
      const start = new Date(year, month, 1).getTime()
      const km = curRuns.filter((r) => unitStart(r.startMs, 'month') === start).reduce((sum, r) => sum + (r.distanceKm ?? 0), 0)
      out.push({ start, km, current: year === new Date(now).getFullYear() && month === new Date(now).getMonth() })
    }
    return out
  }, [curRuns, trendUnit, now, yearScope])
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

      {period === 'year' && (
        <div className="run-year-scope">
          <span>조회 기간</span>
          <div className="run-year-strip" role="group" aria-label="연간 조회 기간">
            {yearOptions.map((option) => {
              const selectedYear = yearScope === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  ref={selectedYear ? activeYearRef : undefined}
                  className={selectedYear ? 'on' : ''}
                  aria-pressed={selectedYear}
                  onClick={() => setYearScope(option.value as YearScope)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {period === 'analysis' && <AllRunAnalysis runs={runs} onSelect={setSelected} />}

      {insight && <RunInsightCard insight={insight} />}

      {period !== 'analysis' && (
        <div className="run-kpis">
          <div className="run-kpi hl"><span className="run-kpi-l">총 거리</span><span className="run-kpi-v">{fmtKm(k.totalKm)}<em> km</em></span></div>
          <div className="run-kpi"><span className="run-kpi-l">러닝</span><span className="run-kpi-v">{k.count}<em> 회</em></span></div>
          <div className="run-kpi"><span className="run-kpi-l">총 시간</span><span className="run-kpi-v">{fmtDur(k.totalSec)}</span></div>
          <div className="run-kpi"><span className="run-kpi-l">평균 페이스</span><span className="run-kpi-v">{fmtPace(k.avgPace)}<em>/km</em></span></div>
          <div className="run-kpi"><span className="run-kpi-l">평균 시간</span><span className="run-kpi-v">{fmtDur(k.avgDur)}</span></div>
        </div>
      )}

      {period === 'week' && <WeeklySplitPaceChart runs={curRuns} />}
      {period === 'year' && <YearlyPaceHeartLine runs={curRuns} />}

      {trendUnit && (
        <>
          <div className="run-sec-t">월간 거리 추세</div>
          <div className="run-trend">
            {trend.map((b) => (
              <div key={b.start} className="run-bar-col">
                <div className="run-bar" style={{ height: `${Math.round((b.km / maxTrend) * 100)}%` }} data-cur={b.current ? '1' : undefined} />
                <span className="run-bar-x">{unitLabel(b.start, trendUnit)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {(period === 'week' || period === 'month') && (
        <>
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
        </>
      )}
    </div>
  )
}

function RunInsightCard({ insight }: { insight: RunInsight }) {
  return (
    <section className={`run-insight ${insight.tone}`} aria-label={insight.label}>
      <span className="run-insight-icon" aria-hidden="true">
        {insight.tone === 'good' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m4 15 5-5 4 4 7-8" /><path d="M15 6h5v5" /></svg>
        ) : insight.tone === 'watch' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4" /><path d="M12 16.5h.01" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
        )}
      </span>
      <div><strong>{insight.label}</strong><p>{insight.message}</p></div>
    </section>
  )
}

/** 선택한 연도의 러닝을 느린 페이스→빠른 페이스 순으로 연결해 평균 심박 변화를 보여준다. */
function YearlyPaceHeartLine({ runs }: { runs: Run[] }) {
  const points = runs
    .filter((run) => run.paceSecPerKm !== undefined && run.avgHr !== undefined)
    .sort((a, b) => (b.paceSecPerKm as number) - (a.paceSecPerKm as number) || a.startMs - b.startMs)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (selectedId && !points.some((run) => run.id === selectedId)) setSelectedId(null)
  }, [points, selectedId])

  if (points.length < 2) return (
    <section className="run-pace-heart-line-section">
      <div className="run-sec-t">페이스별 심박 변화 <span className="run-sec-hint">선택 연도 운동별 평균</span></div>
      <p className="hint" style={{ margin: '0 2px' }}>페이스와 심박이 있는 러닝 2건 이상부터 표시돼요.</p>
    </section>
  )

  const W = 320, H = 176, padL = 40, padR = 12, padT = 12, padB = 28
  const paces = points.map((run) => run.paceSecPerKm as number)
  const heartRates = points.map((run) => run.avgHr as number)
  const paceMin = Math.min(...paces), paceMax = Math.max(...paces)
  const heartMin = Math.floor(Math.min(...heartRates) - 3)
  const heartMax = Math.ceil(Math.max(...heartRates) + 3)
  const x = (pace: number, index: number) => paceMax === paceMin
    ? padL + index / Math.max(1, points.length - 1) * (W - padL - padR)
    : padL + (paceMax - pace) / (paceMax - paceMin) * (W - padL - padR)
  const y = (heartRate: number) => padT + (heartMax - heartRate) / Math.max(1, heartMax - heartMin) * (H - padT - padB)
  const line = points.map((run, index) => `${x(run.paceSecPerKm as number, index)},${y(run.avgHr as number)}`).join(' ')
  const selectedIndex = points.findIndex((run) => run.id === selectedId)
  const selected = selectedIndex >= 0 ? points[selectedIndex] : null
  const selectedX = selected ? x(selected.paceSecPerKm as number, selectedIndex) : 0
  const selectedY = selected ? y(selected.avgHr as number) : 0
  const tipW = 116, tipH = 39
  const tipX = selectedX > W / 2 ? selectedX - tipW - 8 : selectedX + 8
  const tipY = Math.max(5, Math.min(H - padB - tipH - 3, selectedY - tipH / 2))

  return (
    <section className="run-pace-heart-line-section">
      <div className="run-sec-t">페이스별 심박 변화 <span className="run-sec-hint">선택 연도 운동별 평균</span></div>
      <svg className="run-pace-heart-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="선택 연도 페이스별 평균 심박 선 그래프">
        {[0, 0.5, 1].map((ratio) => {
          const heartRate = Math.round(heartMax - (heartMax - heartMin) * ratio)
          const lineY = padT + ratio * (H - padT - padB)
          return <g key={ratio}><line x1={padL} y1={lineY} x2={W - padR} y2={lineY} className="grid" /><text x={4} y={lineY + 3}>{heartRate}</text></g>
        })}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
        <polyline points={line} className="line" />
        {points.map((run, index) => {
          const pace = run.paceSecPerKm as number
          const heartRate = run.avgHr as number
          const active = run.id === selectedId
          const label = `${fmtFullDate(run.startMs)}, ${fmtPace(pace)}/km, 평균 심박 ${Math.round(heartRate)} bpm`
          return (
            <g key={run.id} className={`point${active ? ' selected' : ''}`} role="button" tabIndex={0} aria-label={`${label}, 값 보기`} onClick={() => setSelectedId(active ? null : run.id)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedId(active ? null : run.id)
              }
            }}>
              <title>{label}</title>
              {active && <circle cx={x(pace, index)} cy={y(heartRate)} r="9" className="halo" />}
              <circle cx={x(pace, index)} cy={y(heartRate)} r="4" className="dot" />
              <circle cx={x(pace, index)} cy={y(heartRate)} r="12" className="hit" />
            </g>
          )
        })}
        <text x={padL} y={H - 7}>{fmtPace(paceMax)}</text>
        <text x={W - padR} y={H - 7} textAnchor="end">{fmtPace(paceMin)}</text>
        {selected && (
          <g className="tooltip" aria-hidden="true">
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="7" />
            <text x={tipX + 8} y={tipY + 14}>{fmtFullDate(selected.startMs)}</text>
            <text x={tipX + 8} y={tipY + 29} className="value">{fmtPace(selected.paceSecPerKm)}/km · {Math.round(selected.avgHr as number)} bpm</text>
          </g>
        )}
      </svg>
      <div className="run-pace-heart-line-axis"><span>느린 페이스</span><span>빠른 페이스</span></div>
      <p>점을 누르면 해당 운동의 날짜·페이스·평균 심박을 확인할 수 있어요.</p>
    </section>
  )
}

interface WeeklySplitStat {
  index: number
  median: number
  low: number
  high: number
  count: number
}

/** 선택한 주간 운동의 1km 구간과 같은 주의 구간별 중앙값을 비교한다. */
function WeeklySplitPaceChart({ runs }: { runs: Run[] }) {
  const eligible = runs
    .filter((run) => fullKmSplits(run.splits).length >= 2)
    .sort((a, b) => b.startMs - a.startMs)
  const [selectedId, setSelectedId] = useState(() => eligible[0]?.id ?? '')
  const [selectedKm, setSelectedKm] = useState<number | null>(null)

  useEffect(() => {
    if (!eligible.length) return
    if (!eligible.some((run) => run.id === selectedId)) setSelectedId(eligible[0].id)
  }, [eligible, selectedId])

  const selectedRun = eligible.find((run) => run.id === selectedId) ?? eligible[0]
  const selectedSplits = selectedRun ? fullKmSplits(selectedRun.splits) : []

  if (!selectedRun || !selectedSplits.length) return (
    <section className="run-week-split-section">
      <div className="run-sec-t">1km 구간 페이스 <span className="run-sec-hint">최근 7일 운동 비교</span></div>
      <p className="hint" style={{ margin: '0 2px' }}>완주한 1km 구간이 2개 이상인 러닝부터 표시돼요.</p>
    </section>
  )

  const stats: WeeklySplitStat[] = selectedSplits.map((_, index) => {
    const values = eligible
      .map((run) => fullKmSplits(run.splits)[index]?.paceSecPerKm)
      .filter((value): value is number => value !== undefined)
    return {
      index,
      median: median(values),
      low: quantile(values, 0.25),
      high: quantile(values, 0.75),
      count: values.length,
    }
  })

  const W = Math.max(320, 52 + Math.max(0, selectedSplits.length - 1) * 34)
  const H = 188, padL = 40, padR = 12, padT = 14, padB = 30
  const paceValues = [
    ...selectedSplits.map((split) => split.paceSecPerKm),
    ...stats.flatMap((stat) => [stat.median, stat.low, stat.high]),
  ]
  const fastest = Math.max(120, Math.min(...paceValues) - 5)
  const slowest = Math.max(fastest + 10, Math.max(...paceValues) + 5)
  const x = (index: number) => selectedSplits.length === 1
    ? padL + (W - padL - padR) / 2
    : padL + index / (selectedSplits.length - 1) * (W - padL - padR)
  const y = (pace: number) => padT + (pace - fastest) / (slowest - fastest) * (H - padT - padB)
  const selectedLine = selectedSplits.map((split, index) => `${x(index)},${y(split.paceSecPerKm)}`).join(' ')
  const comparableStats = stats.filter((stat) => stat.count >= 2)
  const medianLine = comparableStats.map((stat) => `${x(stat.index)},${y(stat.median)}`).join(' ')
  const bandSegments: WeeklySplitStat[][] = []
  for (const stat of stats) {
    if (stat.count < 3) continue
    const previous = bandSegments[bandSegments.length - 1]
    if (previous && previous[previous.length - 1].index === stat.index - 1) previous.push(stat)
    else bandSegments.push([stat])
  }

  const chosenIndex = selectedKm === null ? -1 : selectedKm - 1
  const chosenSplit = chosenIndex >= 0 ? selectedSplits[chosenIndex] : undefined
  const chosenStat = chosenIndex >= 0 ? stats[chosenIndex] : undefined
  const chosenX = chosenIndex >= 0 ? x(chosenIndex) : 0
  const chosenY = chosenSplit ? y(chosenSplit.paceSecPerKm) : 0
  const tipW = 136, tipH = 41
  const tipX = chosenX > W / 2 ? chosenX - tipW - 8 : chosenX + 8
  const tipY = Math.max(5, Math.min(H - padB - tipH - 3, chosenY - tipH / 2))
  const difference = chosenSplit && chosenStat ? chosenSplit.paceSecPerKm - chosenStat.median : 0
  const compareText = !chosenStat || chosenStat.count < 2
    ? '같은 구간 비교 기록 없음'
    : Math.abs(difference) < 0.5
      ? '주간 중앙과 같음'
      : `주간 중앙보다 ${Math.round(Math.abs(difference))}초 ${difference < 0 ? '빠름' : '느림'}`

  const chooseRun = (id: string) => {
    setSelectedId(id)
    setSelectedKm(null)
  }

  return (
    <section className="run-week-split-section">
      <div className="run-sec-t">1km 구간 페이스 <span className="run-sec-hint">선택 운동 · 주간 중앙값 비교</span></div>
      <div className="run-week-picks" role="group" aria-label="비교할 주간 러닝">
        {eligible.map((run) => (
          <button key={run.id} type="button" className={run.id === selectedRun.id ? 'on' : ''} aria-pressed={run.id === selectedRun.id} onClick={() => chooseRun(run.id)}>
            {fmtDate(run.startMs)}<small>{fmtKm(run.distanceKm)}km</small>
          </button>
        ))}
      </div>
      <div className="run-week-chart-scroll">
        <svg className="run-week-chart" style={{ minWidth: `${W}px` }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fmtFullDate(selectedRun.startMs)} 러닝의 1km 구간 페이스와 주간 중앙값 비교`}>
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
          <text x={3} y={padT + 4}>{fmtPace(fastest)}</text>
          <text x={3} y={H - padB}>{fmtPace(slowest)}</text>
          {eligible.length >= 3 && bandSegments.map((segment, segmentIndex) => {
            if (segment.length === 1) {
              const stat = segment[0]
              return <line key={segmentIndex} x1={x(stat.index)} y1={y(stat.low)} x2={x(stat.index)} y2={y(stat.high)} className="range-single" />
            }
            const upper = segment.map((stat) => `${x(stat.index)},${y(stat.low)}`)
            const lower = [...segment].reverse().map((stat) => `${x(stat.index)},${y(stat.high)}`)
            return <polygon key={segmentIndex} points={[...upper, ...lower].join(' ')} className="range-band" />
          })}
          {comparableStats.length > 1 && <polyline points={medianLine} className="median-line" />}
          <polyline points={selectedLine} className="selected-line" />
          {selectedSplits.map((split, index) => {
            const km = index + 1
            const active = selectedKm === km
            const delta = split.paceSecPerKm - stats[index].median
            const label = `${km}km, ${fmtPace(split.paceSecPerKm)}/km${stats[index].count >= 2 ? `, 주간 중앙 대비 ${paceDeltaLabel(delta)}` : ', 같은 구간 비교 기록 없음'}`
            return (
              <g key={km} className={`split-point${active ? ' selected' : ''}`} role="button" tabIndex={0} aria-label={`${label}, 값 보기`} onClick={() => setSelectedKm(active ? null : km)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedKm(active ? null : km)
                }
              }}>
                <title>{label}</title>
                {active && <circle cx={x(index)} cy={y(split.paceSecPerKm)} r="9" className="halo" />}
                <circle cx={x(index)} cy={y(split.paceSecPerKm)} r="4" className="dot" />
                <circle cx={x(index)} cy={y(split.paceSecPerKm)} r="12" className="hit" />
              </g>
            )
          })}
          {selectedSplits.map((_, index) => {
            const show = selectedSplits.length <= 9 || index === 0 || index === selectedSplits.length - 1 || index % 2 === 1
            return show ? <text key={index} x={x(index)} y={H - 8} textAnchor={index === 0 ? 'start' : index === selectedSplits.length - 1 ? 'end' : 'middle'}>{index + 1}km</text> : null
          })}
          {chosenSplit && (
            <g className="tooltip" aria-hidden="true">
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="7" />
              <text x={tipX + 8} y={tipY + 14}>{chosenIndex + 1}km · {fmtPace(chosenSplit.paceSecPerKm)}/km</text>
              <text x={tipX + 8} y={tipY + 30} className="value">{compareText}</text>
            </g>
          )}
        </svg>
      </div>
      <div className="run-week-legend">
        <span><i className="selected" />{fmtDate(selectedRun.startMs)} 페이스</span>
        {eligible.length > 1 && <span><i className="median" />주간 중앙값</span>}
        {eligible.length >= 3 && <span><i className="range" />중간 50% 범위</span>}
      </div>
      <p>날짜를 바꿔 운동을 비교하고, 점을 누르면 해당 구간이 주간 중앙보다 얼마나 빠르거나 느린지 확인할 수 있어요.</p>
    </section>
  )
}

/** 러닝 세부: 요약 + 이번 러닝의 페이스↔심박(실시간 구간 데이터). 없으면 전체 러닝 중 이 러닝 위치. */
function RunDetail({ run, allRuns, onBack }: { run: Run; allRuns: Run[]; onBack: () => void }) {
  useBackHandler(onBack)
  const d = new Date(run.startMs)
  const hasSamples = run.samples.length >= 3
  const comparisonRuns = useMemo(() => allRuns
    .filter((candidate) => candidate.id !== run.id && fullKmSplits(candidate.splits).length >= 1)
    .sort((a, b) => Math.abs((a.distanceKm ?? 0) - (run.distanceKm ?? 0)) - Math.abs((b.distanceKm ?? 0) - (run.distanceKm ?? 0))), [allRuns, run])
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareId, setCompareId] = useState(comparisonRuns[0]?.id ?? '')
  const compared = comparisonRuns.find((candidate) => candidate.id === compareId) ?? comparisonRuns[0]
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

      <SplitTable run={run} />

      {run.splits.length > 0 && comparisonRuns.length > 0 && (
        <section className="run-compare-section">
          <button type="button" className="btn subtle run-compare-toggle" onClick={() => setCompareOpen((open) => !open)} aria-expanded={compareOpen}>
            <CompareIcon /> 다른 운동과 구간 비교
          </button>
          {compareOpen && compared && (
            <div className="run-compare-panel">
              <ThemeSelect
                value={compared.id}
                options={comparisonRuns.map((candidate) => ({ value: candidate.id, label: `${fmtFullDate(candidate.startMs)} · ${fmtKm(candidate.distanceKm)} km` }))}
                onChange={setCompareId}
                title="비교할 러닝"
                variant="pill"
              />
              <SplitComparison current={run} compared={compared} />
            </div>
          )}
        </section>
      )}

      {hasSamples ? (
        <>
          <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">이번 러닝 구간별 · 빠를수록 오른쪽</span></div>
          <Scatter points={run.samples.map((s) => ({ paceSec: s.paceSec, hr: s.hr }))} radius={3.5} legendStart="시작" legendEnd="끝" />
        </>
      ) : (
        <RunInHistory run={run} allRuns={allRuns} />
      )}
    </div>
  )
}

function CompareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3" /><path d="m18 7-3 3" /><path d="M17 17H6l3 3" /><path d="m6 17 3-3" /></svg>
}

function SplitTable({ run }: { run: Run }) {
  if (!run.splits.length) {
    return <section className="run-splits-empty"><div className="run-sec-t">1km 구간</div><p>이 기록에는 구간 데이터가 없어요.<br />세부 동기화된 새 기록부터 표시됩니다.</p></section>
  }
  const fastest = Math.min(...run.splits.map((split) => split.paceSecPerKm))
  const baseline = run.paceSecPerKm ?? run.splits.reduce((sum, split) => sum + split.paceSecPerKm, 0) / run.splits.length
  return (
    <section className="run-splits">
      <div className="run-sec-t">1km 구간 <span className="run-sec-hint">평균 페이스 대비</span></div>
      <div className="run-split-table" role="table" aria-label="1km 구간 페이스">
        <div className="run-split-row head" role="row"><span>구간</span><span>페이스</span><span>차이</span><span>심박</span></div>
        {run.splits.map((split) => {
          const delta = split.paceSecPerKm - baseline
          return (
            <div className={`run-split-row${split.paceSecPerKm === fastest ? ' fastest' : ''}`} role="row" key={`${split.index}-${split.distanceM}`}>
              <span>{split.partial ? `${(split.distanceM / 1000).toFixed(2)} km` : `${split.index} km`}</span>
              <strong>{fmtPace(split.paceSecPerKm)}</strong>
              <span className={delta < -0.5 ? 'faster' : delta > 0.5 ? 'slower' : ''}>{paceDeltaLabel(delta)}</span>
              <span>{split.avgHr ? `${Math.round(split.avgHr)}` : '−'}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SplitComparison({ current, compared }: { current: Run; compared: Run }) {
  const a = fullKmSplits(current.splits)
  const b = fullKmSplits(compared.splits)
  const rows = Math.max(a.length, b.length)
  const paired = Array.from({ length: rows }, (_, index) => ({ index, current: a[index], compared: b[index] }))
  const values = paired.flatMap((row) => [row.current?.paceSecPerKm, row.compared?.paceSecPerKm]).filter((value): value is number => value !== undefined)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = 320, height = 140, left = 32, right = 12, top = 16, bottom = 24
  const x = (index: number) => left + (rows <= 1 ? 0.5 : index / (rows - 1)) * (width - left - right)
  const y = (pace: number) => top + (max === min ? 0.5 : (pace - min) / (max - min)) * (height - top - bottom)
  const points = (splits: RunningSplit[]) => splits.map((split, index) => `${x(index)},${y(split.paceSecPerKm)}`).join(' ')
  return (
    <div className="run-split-compare">
      <div className="run-compare-legend"><span className="current">이번 기록</span><span className="previous">{fmtFullDate(compared.startMs)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="운동별 1km 구간 페이스 비교">
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" />
        {Array.from({ length: rows }, (_, index) => <text key={index} x={x(index)} y={height - 6} textAnchor="middle">{index + 1}</text>)}
        {b.length > 1 && <polyline points={points(b)} className="previous" />}
        {a.length > 1 && <polyline points={points(a)} className="current" />}
        {b.map((split, index) => <circle key={`b-${index}`} cx={x(index)} cy={y(split.paceSecPerKm)} r="3" className="previous" />)}
        {a.map((split, index) => <circle key={`a-${index}`} cx={x(index)} cy={y(split.paceSecPerKm)} r="3.5" className="current" />)}
      </svg>
      <div className="run-compare-table" role="table">
        <div className="run-compare-row head"><span>km</span><span>이번</span><span>비교</span><span>차이</span></div>
        {paired.map((row) => {
          const delta = row.current && row.compared ? row.current.paceSecPerKm - row.compared.paceSecPerKm : undefined
          return <div className="run-compare-row" key={row.index}><span>{row.index + 1}</span><span>{fmtPace(row.current?.paceSecPerKm)}</span><span>{fmtPace(row.compared?.paceSecPerKm)}</span><span className={delta !== undefined && delta < 0 ? 'faster' : delta !== undefined && delta > 0 ? 'slower' : ''}>{delta === undefined ? '−' : paceDeltaLabel(delta)}</span></div>
        })}
      </div>
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * ratio
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

interface PaceHeartPoint {
  paceSec: number
  hr: number
}

/** 센서 오류와 한두 건의 극단값이 전체 축을 늘리지 않도록 양쪽 IQR 이상치를 제거한다. */
function withoutPaceHeartOutliers<T extends PaceHeartPoint>(points: T[]): T[] {
  const valid = points.filter(({ paceSec, hr }) =>
    Number.isFinite(paceSec) && paceSec >= 120 && paceSec <= 1200 &&
    Number.isFinite(hr) && hr >= 40 && hr <= 230)
  if (valid.length < 4) return valid

  const fence = (values: number[]): [number, number] | null => {
    const q1 = quantile(values, 0.25)
    const q3 = quantile(values, 0.75)
    const iqr = q3 - q1
    if (iqr <= 0) return null
    return [q1 - iqr * 1.5, q3 + iqr * 1.5]
  }
  const paceFence = fence(valid.map((point) => point.paceSec))
  const heartFence = fence(valid.map((point) => point.hr))
  return valid.filter(({ paceSec, hr }) =>
    (!paceFence || (paceSec >= paceFence[0] && paceSec <= paceFence[1])) &&
    (!heartFence || (hr >= heartFence[0] && hr <= heartFence[1])))
}

function AllRunAnalysis({ runs, onSelect }: { runs: Run[]; onSelect: (id: string) => void }) {
  return (
    <div className="run-analysis">
      <div className="run-analysis-count">전체 기록 {runs.length}회 기준</div>
      <AllRunCorrelation runs={runs} />
      <SplitPaceTrend runs={runs} onSelect={onSelect} />
    </div>
  )
}

/** 전체 러닝 평균값의 페이스↔심박 상관. */
function AllRunCorrelation({ runs }: { runs: Run[] }) {
  const rawPoints = runs
    .filter((r) => r.paceSecPerKm !== undefined && r.avgHr !== undefined)
    .sort((a, b) => a.startMs - b.startMs)
    .map((r) => ({ paceSec: r.paceSecPerKm as number, hr: r.avgHr as number }))
  const points = withoutPaceHeartOutliers(rawPoints)
  const excluded = rawPoints.length - points.length
  return (
    <section className="run-analysis-section">
      <div className="run-sec-t">페이스 ↔ 심박 <span className="run-sec-hint">같은 페이스·낮은 심박 = 향상{excluded > 0 ? ` · 이상치 ${excluded}건 제외` : ''}</span></div>
      {points.length >= 3 ? (
        <Scatter points={points} />
      ) : (
        <p className="hint" style={{ margin: '0 2px' }}>이상치를 제외한 유효한 러닝 3건 이상부터 상관관계 그래프가 표시돼요.</p>
      )}
    </section>
  )
}

interface SplitTrendPoint {
  run: Run
  pace: number
  low: number
  high: number
  flow: number
}

function SplitPaceTrend({ runs, onSelect }: { runs: Run[]; onSelect: (id: string) => void }) {
  const base = runs
    .map((run) => {
      const values = fullKmSplits(run.splits).map((split) => split.paceSecPerKm)
      if (!values.length) return null
      return { run, pace: median(values), low: quantile(values, 0.25), high: quantile(values, 0.75) }
    })
    .filter((point): point is Omit<SplitTrendPoint, 'flow'> => point !== null)
    .sort((a, b) => a.run.startMs - b.run.startMs)
  const points: SplitTrendPoint[] = base.map((point, index) => ({
    ...point,
    flow: median(base.slice(Math.max(0, index - 4), index + 1).map((item) => item.pace)),
  }))

  if (points.length < 2) return (
    <section className="run-analysis-section">
      <div className="run-sec-t">1km 페이스 변화 <span className="run-sec-hint">전체 운동을 같은 기준으로 비교</span></div>
      <p className="hint" style={{ margin: '0 2px' }}>1km 구간이 있는 러닝 2건 이상부터 변화 추세가 표시돼요.</p>
    </section>
  )

  const W = 320, H = 190, padL = 46, padR = 12, padT = 16, padB = 30
  const values = points.flatMap((point) => [point.low, point.high, point.flow])
  const fastest = Math.max(120, Math.min(...values) - 5)
  const slowest = Math.max(fastest + 10, Math.max(...values) + 5)
  const x = (index: number) => padL + index / (points.length - 1) * (W - padL - padR)
  const y = (pace: number) => padT + (pace - fastest) / (slowest - fastest) * (H - padT - padB)
  const flowPoints = points.map((point, index) => `${x(index)},${y(point.flow)}`).join(' ')
  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]

  return (
    <section className="run-analysis-section">
      <div className="run-sec-t">1km 페이스 변화 <span className="run-sec-hint">운동별 중앙값 · 최근 5회 흐름</span></div>
      <div className="run-pace-trend-wrap">
        <svg className="run-pace-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="전체 운동의 1km 구간 페이스 변화 추세">
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
          <text x={3} y={padT + 4}>{fmtPace(fastest)}</text>
          <text x={3} y={H - padB}>{fmtPace(slowest)}</text>
          <polyline points={flowPoints} className="flow" />
          {points.map((point, index) => {
            const prismColor = `hsl(${Math.round(280 - index / (points.length - 1) * 300)} 74% 48%)`
            const label = `${fmtFullDate(point.run.startMs)}, 1km 중앙 페이스 ${fmtPace(point.pace)}/km`
            return (
              <g key={point.run.id} className="pace-point" role="button" tabIndex={0} aria-label={`${label}, 상세 보기`} onClick={() => onSelect(point.run.id)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(point.run.id)
              }}>
                <title>{label}</title>
                <line x1={x(index)} y1={y(point.low)} x2={x(index)} y2={y(point.high)} className="range" />
                <circle cx={x(index)} cy={y(point.pace)} r="4" fill={prismColor} className="dot" />
                <circle cx={x(index)} cy={y(point.pace)} r="11" className="hit" />
              </g>
            )
          })}
          {tickIndexes.map((index) => <text key={index} x={x(index)} y={H - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{fmtDate(points[index].run.startMs)}</text>)}
        </svg>
        <div className="run-prism-key" aria-label="과거에서 최근 순서"><span>과거</span><i aria-hidden="true" /><span>최근</span></div>
        <div className="run-pace-trend-key">
          <span><i className="median" />점: 운동별 중앙 페이스</span>
          <span><i className="range" />세로선: 중간 50% 구간</span>
          <span><i className="flow" />선: 최근 5회 흐름</span>
        </div>
        <p>거리와 관계없이 완주한 1km 구간만 사용합니다. 점을 누르면 해당 운동의 구간 기록을 볼 수 있어요.</p>
      </div>
    </section>
  )
}

/** 페이스(x, 빠를수록 오른쪽) ↔ 심박(y) 산점도. 점은 시간순 프리즘 색상으로 구분한다. */
function Scatter({ points, highlightIdx, radius = 5, legendStart = '과거', legendEnd = '최근' }: {
  points: { paceSec: number; hr: number }[]
  highlightIdx?: number
  radius?: number
  legendStart?: string
  legendEnd?: string
}) {
  const W = 320, H = 180, padL = 40, padR = 12, padT = 12, padB = 26
  const paces = points.map((p) => p.paceSec)
  const hrs = points.map((p) => p.hr)
  const pMin = Math.min(...paces), pMax = Math.max(...paces)
  const hMin = Math.min(...hrs), hMax = Math.max(...hrs)
  const paceGap = pMax === pMin ? 10 : Math.max(5, (pMax - pMin) * 0.06)
  const heartGap = hMax === hMin ? 3 : Math.max(2, (hMax - hMin) * 0.08)
  const paceLow = pMin - paceGap, paceHigh = pMax + paceGap
  const heartLow = Math.max(30, hMin - heartGap), heartHigh = Math.min(240, hMax + heartGap)
  const px = (p: number) => padL + (paceHigh - p) / (paceHigh - paceLow) * (W - padL - padR)
  const py = (h: number) => padT + (heartHigh - h) / (heartHigh - heartLow) * (H - padT - padB)
  const n = points.length
  return (
    <div className="run-scatter-wrap">
      <svg className="run-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`페이스 대 심박 산점도, ${legendStart}부터 ${legendEnd}까지 프리즘 색상`}>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line-strong)" strokeWidth="1" />
        <text x={4} y={padT + 8} className="run-ax">{Math.round(heartHigh)}</text>
        <text x={4} y={H - padB} className="run-ax">{Math.round(heartLow)}</text>
        <text x={padL} y={H - 6} className="run-ax">느림</text>
        <text x={W - padR - 24} y={H - 6} className="run-ax">빠름</text>
        {points.map((p, i) => {
          const t = n > 1 ? i / (n - 1) : 1
          const hi = i === highlightIdx
          const prismColor = `hsl(${Math.round(280 - t * 300)} 74% 48%)`
          return (
            <circle
              key={i}
              cx={px(p.paceSec)}
              cy={py(p.hr)}
              r={hi ? radius + 3 : radius}
              fill={hi ? 'var(--accent)' : prismColor}
              stroke="var(--surface-2)"
              strokeWidth={hi ? 2 : 0.8}
            />
          )
        })}
      </svg>
      <div className="run-prism-key" aria-label={`${legendStart}에서 ${legendEnd} 순서`}>
        <span>{legendStart}</span><i aria-hidden="true" /><span>{legendEnd}</span>
      </div>
    </div>
  )
}
