import type {
  Analysis,
  Climb,
  ClimbCategory,
  GradeBucket,
  GpxFile,
  ProfilePoint,
  SteepSection,
  Track,
  TrackPoint,
} from '../types'
import { haversine } from './geo'

const STEP = 10
const SMOOTH_HALF = 3
const GRADE_HALF = 2
const STEEP_WINDOW = 10
const MIN_MOVING_SPEED = 0.5
const MAX_PLAUSIBLE_SPEED = 30
const CLIMB_MIN_LENGTH = 400
const CLIMB_MIN_GRADE = 3
const CLIMB_NOISE = 10
const TRIM_GRADE = 2
const TRIM_WINDOW = 10
const GAIN_NOISE = 3

export const GRADE_BUCKETS: Omit<GradeBucket, 'distanceM'>[] = [
  { label: '≤ -6%', min: -Infinity, max: -6, color: '#2563eb' },
  { label: '-6 to -3%', min: -6, max: -3, color: '#38bdf8' },
  { label: '-3 to -1%', min: -3, max: -1, color: '#2dd4bf' },
  { label: '-1 to 1%', min: -1, max: 1, color: '#a1a1aa' },
  { label: '1 to 3%', min: 1, max: 3, color: '#a3e635' },
  { label: '3 to 6%', min: 3, max: 6, color: '#fbbf24' },
  { label: '6 to 9%', min: 6, max: 9, color: '#fb923c' },
  { label: '≥ 9%', min: 9, max: Infinity, color: '#f43f5e' },
]

export function gradeColor(grade: number): string {
  const b = GRADE_BUCKETS.find((x) => grade >= x.min && grade < x.max) ?? GRADE_BUCKETS[GRADE_BUCKETS.length - 1]
  return b.color
}

export function primaryTrack(gpx: GpxFile): Track {
  const candidates = [...gpx.tracks, ...gpx.routes].filter((t) => t.points.length >= 2)
  return candidates.reduce((best, t) => (t.points.length > best.points.length ? t : best))
}

function forwardFillElevation(points: TrackPoint[]): number[] | null {
  if (!points.some((p) => p.ele !== null)) return null
  const out = points.map((p) => p.ele ?? NaN)
  const firstKnown = out.find((v) => !Number.isNaN(v)) as number
  let last = firstKnown
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) out[i] = last
    else last = out[i]
  }
  return out
}

// Zigzag turning points: a reversal must exceed `threshold` metres to count.
function turningPoints(ele: number[], threshold: number): number[] {
  const n = ele.length
  const tps = [0]
  let pivot = 0
  let dir = 0
  let ext = 0
  for (let i = 1; i < n; i++) {
    if (dir === 0) {
      if (ele[i] >= ele[pivot] + threshold) {
        dir = 1
        ext = i
      } else if (ele[i] <= ele[pivot] - threshold) {
        dir = -1
        ext = i
      }
    } else if (dir === 1) {
      if (ele[i] > ele[ext]) ext = i
      else if (ele[i] <= ele[ext] - threshold) {
        tps.push(ext)
        pivot = ext
        dir = -1
        ext = i
      }
    } else {
      if (ele[i] < ele[ext]) ext = i
      else if (ele[i] >= ele[ext] + threshold) {
        tps.push(ext)
        pivot = ext
        dir = 1
        ext = i
      }
    }
  }
  if (dir !== 0 && ext !== tps[tps.length - 1]) tps.push(ext)
  if (tps[tps.length - 1] !== n - 1) tps.push(n - 1)
  return tps
}

function classify(score: number): ClimbCategory {
  if (score >= 80) return 'HC'
  if (score >= 40) return '1'
  if (score >= 20) return '2'
  if (score >= 10) return '3'
  return '4'
}

export function analyse(gpx: GpxFile): Analysis {
  const track = primaryTrack(gpx)
  const pts = track.points
  const ele = forwardFillElevation(pts)
  const hasElevation = ele !== null

  const cum = new Array<number>(pts.length)
  cum[0] = 0
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon)
  }
  const total = cum[cum.length - 1]
  if (total < 20) throw new Error('This route is too short to analyse.')

  const targets: number[] = []
  for (let d = 0; d <= total; d += STEP) targets.push(d)
  if (targets[targets.length - 1] < total) targets.push(total)

  const rawEle = ele ?? pts.map(() => 0)
  const resampled = resampleAt(pts, rawEle, cum, targets)
  const n = resampled.length
  const d = resampled.map((r) => r.d)

  const se = new Array<number>(n)
  for (let k = 0; k < n; k++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, k - SMOOTH_HALF); j <= Math.min(n - 1, k + SMOOTH_HALF); j++) {
      sum += resampled[j].ele
      count++
    }
    se[k] = sum / count
  }

  const grade = new Array<number>(n)
  for (let k = 0; k < n; k++) {
    const lo = Math.max(0, k - GRADE_HALF)
    const hi = Math.min(n - 1, k + GRADE_HALF)
    const run = d[hi] - d[lo]
    const g = run > 0 ? ((se[hi] - se[lo]) / run) * 100 : 0
    grade[k] = Math.max(-40, Math.min(40, g))
  }

  const hrSeries = pts.some((p) => p.hr !== null)
    ? resampleAt(pts, fillForward(pts.map((p) => p.hr)), cum, targets).map((r) => r.ele)
    : null
  const timeSeries = pts.every((p) => p.time !== null)
    ? resampleAt(pts, pts.map((p) => (p.time as Date).getTime() / 1000), cum, targets).map((r) => r.ele)
    : null
  const powerSeries = pts.some((p) => p.power !== null)
    ? resampleAt(pts, movingAverage(fillForward(pts.map((p) => p.power)), 4), cum, targets).map((r) => r.ele)
    : null
  const cadSeries = pts.some((p) => p.cad !== null)
    ? resampleAt(pts, fillForward(pts.map((p) => p.cad)), cum, targets).map((r) => r.ele)
    : null
  const speedHalf = 5
  const speedAt = (k: number) => {
    if (!timeSeries) return null
    const lo = Math.max(0, k - speedHalf)
    const hi = Math.min(n - 1, k + speedHalf)
    const dt = timeSeries[hi] - timeSeries[lo]
    return dt > 0 ? ((d[hi] - d[lo]) / dt) * 3.6 : null
  }

  const profile: ProfilePoint[] = resampled.map((r, k) => ({
    d: r.d,
    lat: r.lat,
    lon: r.lon,
    ele: se[k],
    grade: grade[k],
    hr: hrSeries ? hrSeries[k] : null,
    power: powerSeries ? powerSeries[k] : null,
    cad: cadSeries ? cadSeries[k] : null,
    speed: speedAt(k),
    t: timeSeries ? timeSeries[k] - timeSeries[0] : null,
  }))

  const gradeBuckets: GradeBucket[] = GRADE_BUCKETS.map((b) => ({ ...b, distanceM: 0 }))
  for (let k = 0; k < n - 1; k++) {
    const step = d[k + 1] - d[k]
    const b = gradeBuckets.find((x) => grade[k] >= x.min && grade[k] < x.max)
    if (b) b.distanceM += step
  }

  let elevGainM = 0
  let elevLossM = 0
  const tpsGain = turningPoints(se, GAIN_NOISE)
  for (let i = 1; i < tpsGain.length; i++) {
    const delta = se[tpsGain[i]] - se[tpsGain[i - 1]]
    if (delta > 0) elevGainM += delta
    else elevLossM -= delta
  }

  const gradeOver = (i: number, j: number) => {
    const run = d[j] - d[i]
    return run > 0 ? ((se[j] - se[i]) / run) * 100 : 0
  }

  const climbs: Climb[] = []
  const tpsClimb = turningPoints(se, CLIMB_NOISE)
  for (let i = 1; i < tpsClimb.length; i++) {
    let a = tpsClimb[i - 1]
    let b = tpsClimb[i]
    while (a < b - TRIM_WINDOW && gradeOver(a, a + TRIM_WINDOW) < TRIM_GRADE) a++
    while (b > a + TRIM_WINDOW && gradeOver(b - TRIM_WINDOW, b) < TRIM_GRADE) b--
    const gain = se[b] - se[a]
    const lengthM = d[b] - d[a]
    if (gain <= 0 || lengthM < CLIMB_MIN_LENGTH) continue
    const avgGrade = (gain / lengthM) * 100
    if (avgGrade < CLIMB_MIN_GRADE) continue
    let maxGrade = 0
    for (let k = a; k <= b; k++) maxGrade = Math.max(maxGrade, grade[k])
    const score = (lengthM / 1000) * avgGrade * avgGrade
    climbs.push({
      id: climbs.length + 1,
      startD: d[a],
      endD: d[b],
      lengthM,
      gainM: gain,
      avgGrade,
      maxGrade,
      category: classify(score),
      score,
      startIdx: a,
      endIdx: b,
    })
  }

  const steep = steepSections(d, se)

  const times = pts.map((p) => p.time)
  const hasTime = times[0] !== null && times[times.length - 1] !== null
  let movingS: number | null = null
  let movingDist = 0
  let maxSpeed: number | null = null
  if (hasTime) {
    movingS = 0
    for (let i = 1; i < pts.length; i++) {
      const t1 = times[i - 1]
      const t2 = times[i]
      if (!t1 || !t2) continue
      const dt = (t2.getTime() - t1.getTime()) / 1000
      if (dt <= 0) continue
      const dist = cum[i] - cum[i - 1]
      const v = dist / dt
      if (v > MAX_PLAUSIBLE_SPEED) continue
      maxSpeed = Math.max(maxSpeed ?? 0, v)
      if (v >= MIN_MOVING_SPEED) {
        movingS += dt
        movingDist += dist
      }
    }
  }

  const startTime = times[0]
  const endTime = times[times.length - 1]
  const elapsedS = hasTime && startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : null

  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const max = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null)
    return v.length ? Math.max(...v) : null
  }

  const eles = pts.map((p) => p.ele).filter((x): x is number => x !== null)
  const lats = pts.map((p) => p.lat)
  const lons = pts.map((p) => p.lon)
  const first = pts[0]
  const last = pts[pts.length - 1]

  return {
    name: gpx.name,
    pointCount: pts.length,
    totalDistanceM: total,
    hasElevation,
    hasTime,
    startTime,
    endTime,
    elapsedS,
    movingS,
    avgMovingSpeed: movingS && movingS > 0 ? movingDist / movingS : null,
    maxSpeed,
    elevGainM: hasElevation ? elevGainM : 0,
    elevLossM: hasElevation ? elevLossM : 0,
    minEle: eles.length ? Math.min(...eles) : null,
    maxEle: eles.length ? Math.max(...eles) : null,
    gainPerKm: hasElevation ? elevGainM / (total / 1000) : 0,
    maxGrade: hasElevation ? Math.max(...grade) : 0,
    minGrade: hasElevation ? Math.min(...grade) : 0,
    avgHr: avg(pts.map((p) => p.hr)),
    maxHr: max(pts.map((p) => p.hr)),
    avgCad: avg(pts.map((p) => p.cad).filter((c) => c === null || c > 0)),
    avgTemp: avg(pts.map((p) => p.temp)),
    avgPower: avg(pts.map((p) => p.power)),
    maxPower: max(pts.map((p) => p.power)),
    profile,
    gradeBuckets,
    climbs,
    steepUp: steep.up,
    steepDown: steep.down,
    bounds: {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    },
    start: { lat: first.lat, lon: first.lon },
    end: { lat: last.lat, lon: last.lon },
  }
}

function movingAverage(vals: number[], half: number): number[] {
  return vals.map((_, i) => {
    const win = vals.slice(Math.max(0, i - half), i + half + 1)
    return win.reduce((a, b) => a + b, 0) / win.length
  })
}

function fillForward(vals: (number | null)[]): number[] {
  let last = vals.find((v): v is number => v !== null) ?? 0
  return vals.map((v) => {
    if (v !== null) last = v
    return last
  })
}

function resampleAt(pts: TrackPoint[], ele: number[], cum: number[], targets: number[]) {
  const out: { d: number; lat: number; lon: number; ele: number }[] = []
  let j = 0
  for (const d of targets) {
    while (j < cum.length - 2 && cum[j + 1] < d) j++
    const span = cum[j + 1] - cum[j]
    const t = span > 0 ? Math.min(1, Math.max(0, (d - cum[j]) / span)) : 0
    const a = pts[j]
    const b = pts[j + 1]
    out.push({
      d,
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      ele: ele[j] + (ele[j + 1] - ele[j]) * t,
    })
  }
  return out
}

function steepSections(d: number[], se: number[]) {
  const n = se.length
  const windows: { i: number; g: number }[] = []
  for (let i = 0; i + STEEP_WINDOW < n; i++) {
    const run = d[i + STEEP_WINDOW] - d[i]
    if (run <= 0) continue
    windows.push({ i, g: ((se[i + STEEP_WINDOW] - se[i]) / run) * 100 })
  }

  const pick = (sorted: { i: number; g: number }[]): SteepSection[] => {
    const chosen: SteepSection[] = []
    for (const w of sorted) {
      if (chosen.length >= 3) break
      if (chosen.some((c) => Math.abs(c.startIdx - w.i) < STEEP_WINDOW * 2)) continue
      chosen.push({
        startD: d[w.i],
        endD: d[w.i + STEEP_WINDOW],
        grade: w.g,
        startIdx: w.i,
        endIdx: w.i + STEEP_WINDOW,
      })
    }
    return chosen
  }

  const up = pick(windows.filter((w) => w.g >= 3).sort((a, b) => b.g - a.g))
  const down = pick(windows.filter((w) => w.g <= -3).sort((a, b) => a.g - b.g))
  return { up, down }
}
