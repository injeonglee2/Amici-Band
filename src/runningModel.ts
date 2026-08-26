import type { RunningEntry, RunningSplit } from './types'
import { runningSplits } from './runningSplits'

export type Period = 'week' | 'month' | 'year' | 'analysis'
export type YearScope = `${number}`
export type InsightTone = 'good' | 'watch' | 'info'
export interface RunInsight { tone: InsightTone; label: string; message: string }
export interface InsightCandidate extends RunInsight { score: number }
export interface Sample { elapsedSec: number; timeMs: number; hr?: number; paceSec?: number }
export interface Run {
  id: string; startMs: number; distanceKm?: number; durationSec?: number; paceSecPerKm?: number
  avgHr?: number; maxHr?: number; calories?: number; steps?: number; samples: Sample[]; splits: RunningSplit[]
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function pickNumber(entry: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const number = numberOrUndefined(entry[key])
    if (number !== undefined) return number
  }
  return undefined
}

function normalizeSamples(raw: unknown, startMs: number, durationSec?: number): Sample[] {
  if (!Array.isArray(raw)) return []
  const output: Sample[] = []
  const source = raw as Record<string, unknown>[]
  source.forEach((sample, index) => {
    const heartRate = pickNumber(sample, ['hr', 'heartRate', 'bpm'])
    let paceSec = pickNumber(sample, ['paceSec', 'pace'])
    if (paceSec === undefined) {
      const speed = pickNumber(sample, ['speed', 'speedMps'])
      if (speed && speed > 0) paceSec = 1000 / speed
    }
    const validHeartRate = heartRate !== undefined && heartRate >= 30 && heartRate <= 260 ? heartRate : undefined
    const validPace = paceSec !== undefined && paceSec >= 120 && paceSec <= 1200 ? paceSec : undefined
    if (validHeartRate === undefined && validPace === undefined) return

    let elapsedSec = pickNumber(sample, ['elapsedSec', 'offsetSec', 'seconds'])
    const rawTime = pickNumber(sample, ['timeMs', 'timestampMs', 'time', 'timestamp', 't'])
    if (elapsedSec === undefined && rawTime !== undefined) {
      if (rawTime > 1e12) elapsedSec = (rawTime - startMs) / 1000
      else if (rawTime > 1e9) elapsedSec = (rawTime * 1000 - startMs) / 1000
      else elapsedSec = rawTime
    }
    if (elapsedSec === undefined) elapsedSec = source.length > 1 && durationSec ? index / (source.length - 1) * durationSec : index
    const maxElapsed = Math.max(60, (durationSec ?? elapsedSec) + 60)
    if (!Number.isFinite(elapsedSec) || elapsedSec < -60 || elapsedSec > maxElapsed) return
    const normalizedElapsed = Math.max(0, elapsedSec)
    output.push({ elapsedSec: normalizedElapsed, timeMs: startMs + normalizedElapsed * 1000, hr: validHeartRate, paceSec: validPace })
  })
  return output.sort((a, b) => a.elapsedSec - b.elapsedSec)
}

export function normalizeRun(entry: RunningEntry): Run {
  const startMs = pickNumber(entry, ['startTime', 'startMs']) ?? (typeof entry.date === 'string' ? Date.parse(entry.date) : undefined) ?? pickNumber(entry, ['createdAt']) ?? 0
  const endMs = pickNumber(entry, ['endTime', 'endMs'])
  let durationSec = pickNumber(entry, ['durationSec', 'duration'])
  if (durationSec === undefined && endMs !== undefined && startMs) durationSec = Math.round((endMs - startMs) / 1000)
  const distanceM = pickNumber(entry, ['distanceM', 'distanceMeters', 'distance'])
  const distanceKm = distanceM !== undefined ? distanceM / 1000 : pickNumber(entry, ['distanceKm'])
  return {
    id: entry.id, startMs, distanceKm, durationSec,
    paceSecPerKm: durationSec && distanceKm ? durationSec / distanceKm : undefined,
    avgHr: pickNumber(entry, ['avgHr', 'heartRateAvg', 'hrAvg', 'bpmAvg']),
    maxHr: pickNumber(entry, ['maxHr', 'heartRateMax', 'hrMax', 'bpmMax']),
    calories: pickNumber(entry, ['calories', 'kcal', 'energyKcal']),
    steps: pickNumber(entry, ['steps', 'stepCount']),
    samples: normalizeSamples(entry.samples, startMs, durationSec),
    splits: runningSplits(entry),
  }
}

export function formatPace(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '-'
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`
}
export function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '-'
  const hours = Math.floor(sec / 3600); const minutes = Math.floor((sec % 3600) / 60); const seconds = Math.round(sec % 60)
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}
export const formatKm = (km?: number) => km !== undefined ? km.toFixed(1) : '-'
export const formatRunDate = (ms: number) => { const date = new Date(ms); return `${date.getMonth() + 1}/${date.getDate()}` }
export const formatFullRunDate = (ms: number) => { const date = new Date(ms); return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}` }

function weekStart(ms: number): number {
  const date = new Date(ms); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.getTime()
}
export function monthStart(ms: number): number { const date = new Date(ms); return new Date(date.getFullYear(), date.getMonth(), 1).getTime() }
export type RunUnit = 'week' | 'month'
export const unitStart = (ms: number, unit: RunUnit) => unit === 'week' ? weekStart(ms) : monthStart(ms)
export const unitLabel = (ms: number, unit: RunUnit) => { const date = new Date(ms); return unit === 'week' ? `${date.getMonth() + 1}/${date.getDate()}` : `${date.getMonth() + 1}` }
export function aggregateRuns(runs: Run[]) {
  const totalKm = runs.reduce((sum, run) => sum + (run.distanceKm ?? 0), 0)
  const totalSec = runs.reduce((sum, run) => sum + (run.durationSec ?? 0), 0)
  return { totalKm, totalSec, count: runs.length, avgPace: totalKm > 0 ? totalSec / totalKm : undefined, avgDur: runs.length ? totalSec / runs.length : undefined }
}
