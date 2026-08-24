import type { RunningEntry, RunningSplit } from './types'

type Raw = Record<string, unknown>

interface TimedSample {
  timeMs: number
  distanceM?: number
  speedMps?: number
  hr?: number
  cadence?: number
}

function finite(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstNumber(source: Raw, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = finite(source[key])
    if (value !== undefined) return value
  }
  return undefined
}

function validPace(value: number): boolean {
  return value >= 120 && value <= 1800
}

/** 여러 동기화 형식의 기존 laps/splits 필드를 앱 표준 구간으로 변환한다. */
function parseStoredSplits(raw: unknown): RunningSplit[] {
  if (!Array.isArray(raw)) return []
  const parsed: RunningSplit[] = []
  raw.forEach((item, position) => {
    if (!item || typeof item !== 'object') return
    const row = item as Raw
    const durationMs = firstNumber(row, ['durationMs', 'elapsedMs'])
    const durationSec = firstNumber(row, ['durationSec', 'elapsedSec', 'splitTimeSec', 'duration']) ??
      (durationMs !== undefined ? durationMs / 1000 : undefined)
    const distanceKm = firstNumber(row, ['distanceKm', 'lengthKm'])
    const distanceM = firstNumber(row, ['distanceM', 'distanceMeters', 'lengthM', 'length']) ??
      (distanceKm !== undefined ? distanceKm * 1000 : undefined)
    let pace = firstNumber(row, ['paceSecPerKm', 'paceSec', 'pace'])
    if (pace === undefined && durationSec !== undefined && distanceM && distanceM > 0) {
      pace = durationSec / (distanceM / 1000)
    }
    if (!durationSec || !distanceM || !pace || durationSec < 5 || distanceM < 50 || !validPace(pace)) return
    parsed.push({
      index: Math.max(1, Math.round(firstNumber(row, ['index', 'km', 'lap']) ?? position + 1)),
      distanceM,
      durationSec,
      paceSecPerKm: pace,
      avgHr: firstNumber(row, ['avgHr', 'heartRateAvg', 'hrAvg']),
      avgCadence: firstNumber(row, ['avgCadence', 'cadenceAvg']),
      partial: row.partial === true || distanceM < 950,
      startTimeMs: firstNumber(row, ['startTimeMs', 'startTime']),
      endTimeMs: firstNumber(row, ['endTimeMs', 'endTime']),
    })
  })
  return parsed.sort((a, b) => a.index - b.index)
}

function sampleTime(row: Raw, startMs: number): number | undefined {
  const explicitMs = firstNumber(row, ['timeMs', 'timestampMs'])
  if (explicitMs !== undefined) return explicitMs
  const elapsedSec = firstNumber(row, ['elapsedSec', 'offsetSec', 'seconds'])
  if (elapsedSec !== undefined) return startMs + elapsedSec * 1000
  const raw = firstNumber(row, ['time', 'timestamp', 't'])
  if (raw === undefined) return undefined
  if (raw > 1e12) return raw
  if (raw > 1e9) return raw * 1000
  return startMs + raw * 1000
}

function parseTimedSamples(entry: RunningEntry): TimedSample[] {
  const candidates = [entry.samples, entry.speedSamples, entry.timeline]
  const raw = candidates.find(Array.isArray)
  if (!Array.isArray(raw)) return []
  const startMs = finite(entry.startTime) ?? finite(entry.startMs) ??
    (typeof entry.date === 'string' ? Date.parse(entry.date) : 0)
  const out: TimedSample[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Raw
    const timeMs = sampleTime(row, startMs)
    if (timeMs === undefined || !Number.isFinite(timeMs)) continue
    let speedMps = firstNumber(row, ['speedMps', 'speed', 'velocityMps'])
    if (speedMps === undefined) {
      const paceSec = firstNumber(row, ['paceSecPerKm', 'paceSec', 'pace'])
      if (paceSec && validPace(paceSec)) speedMps = 1000 / paceSec
    }
    out.push({
      timeMs,
      distanceM: firstNumber(row, ['distanceM', 'cumulativeDistanceM', 'distanceMeters']),
      speedMps,
      hr: firstNumber(row, ['hr', 'heartRate', 'bpm']),
      cadence: firstNumber(row, ['cadence', 'stepsPerMinute', 'spm']),
    })
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}

/** 속도 표본만 있는 경우 표본 사이의 거리를 적분해 누적 거리로 바꾼다. */
function addCumulativeDistance(samples: TimedSample[]): TimedSample[] {
  if (samples.length < 2) return []
  const usableDistances = samples.filter((sample) => sample.distanceM !== undefined).length
  if (usableDistances >= Math.max(2, samples.length * 0.7)) {
    const first = samples.find((sample) => sample.distanceM !== undefined)?.distanceM ?? 0
    let last = 0
    return samples.map((sample) => {
      if (sample.distanceM !== undefined) last = Math.max(last, sample.distanceM - first)
      return { ...sample, distanceM: last }
    })
  }
  if (samples.filter((sample) => sample.speedMps !== undefined).length < 2) return []
  let distanceM = 0
  return samples.map((sample, index) => {
    if (index > 0) {
      const previous = samples[index - 1]
      const seconds = (sample.timeMs - previous.timeMs) / 1000
      const a = previous.speedMps
      const b = sample.speedMps
      // 긴 센서 공백은 이동한 것으로 추정하지 않는다. 경과 시간에는 그대로 반영된다.
      if (seconds > 0 && seconds <= 30 && a !== undefined && b !== undefined && a >= 0 && b >= 0 && a <= 12 && b <= 12) {
        distanceM += ((a + b) / 2) * seconds
      }
    }
    return { ...sample, distanceM }
  })
}

function interpolateTime(a: TimedSample, b: TimedSample, targetDistance: number): number {
  const from = a.distanceM ?? 0
  const to = b.distanceM ?? from
  if (to <= from) return b.timeMs
  const ratio = Math.max(0, Math.min(1, (targetDistance - from) / (to - from)))
  return a.timeMs + (b.timeMs - a.timeMs) * ratio
}

function meanInWindow(samples: TimedSample[], fromMs: number, toMs: number, field: 'hr' | 'cadence'): number | undefined {
  const values = samples
    .filter((sample) => sample.timeMs >= fromMs && sample.timeMs <= toMs)
    .map((sample) => sample[field])
    .filter((value): value is number => value !== undefined && Number.isFinite(value))
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
}

/** 시간+누적거리(또는 속도) 표본에서 실제 1km 통과 시각을 보간해 구간을 만든다. */
function deriveSplits(entry: RunningEntry): RunningSplit[] {
  const samples = addCumulativeDistance(parseTimedSamples(entry))
  if (samples.length < 2) return []
  const totalDistance = samples[samples.length - 1].distanceM ?? 0
  if (totalDistance < 200) return []
  const startTime = samples[0].timeMs
  let previousTime = startTime
  let previousDistance = 0
  let cursor = 1
  const splits: RunningSplit[] = []

  const append = (endDistance: number, partial: boolean) => {
    while (cursor < samples.length && (samples[cursor].distanceM ?? 0) < endDistance) cursor += 1
    if (cursor >= samples.length) return
    const endTime = interpolateTime(samples[cursor - 1], samples[cursor], endDistance)
    const distanceM = endDistance - previousDistance
    const durationSec = (endTime - previousTime) / 1000
    const pace = durationSec / (distanceM / 1000)
    if (durationSec >= 5 && validPace(pace)) {
      splits.push({
        index: splits.length + 1,
        distanceM,
        durationSec,
        paceSecPerKm: pace,
        avgHr: meanInWindow(samples, previousTime, endTime, 'hr'),
        avgCadence: meanInWindow(samples, previousTime, endTime, 'cadence'),
        partial,
        startTimeMs: previousTime,
        endTimeMs: endTime,
      })
    }
    previousTime = endTime
    previousDistance = endDistance
  }

  for (let distance = 1000; distance <= totalDistance; distance += 1000) append(distance, false)
  const remainder = totalDistance - previousDistance
  if (remainder >= 200) append(totalDistance, true)
  return splits
}

/** 저장된 구간을 우선 사용하고, 없을 때만 원본 표본에서 계산한다. */
export function runningSplits(entry: RunningEntry): RunningSplit[] {
  const stored = parseStoredSplits(entry.splits ?? entry.kmSplits ?? entry.laps)
  return stored.length ? stored : deriveSplits(entry)
}

export function fullKmSplits(splits: RunningSplit[]): RunningSplit[] {
  return splits.filter((split) => !split.partial && split.distanceM >= 950)
}

export function paceDeltaLabel(seconds: number): string {
  if (Math.abs(seconds) < 0.5) return '±0초'
  return `${seconds > 0 ? '+' : '−'}${Math.round(Math.abs(seconds))}초`
}
