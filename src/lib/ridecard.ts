import type { Analysis } from '../types'
import { CLIMB_COLOR } from '../components/RouteMap'
import { gradeColor } from './analysis'
import { fmtDateTime, fmtDuration, fmtKm, fmtM, fmtPct, fmtSpeed } from './format'

export interface RideCardMetric {
  key: string
  label: string
  value: (a: Analysis) => string | null
}

export const RC_METRICS: RideCardMetric[] = [
  { key: 'distance', label: 'Distance', value: (a) => fmtKm(a.totalDistanceM, 1) },
  { key: 'gain', label: 'Elevation gain', value: (a) => fmtM(a.elevGainM) },
  { key: 'moving', label: 'Moving time', value: (a) => (a.movingS !== null ? fmtDuration(a.movingS) : null) },
  { key: 'speed', label: 'Avg speed', value: (a) => (a.avgMovingSpeed !== null ? fmtSpeed(a.avgMovingSpeed) : null) },
  { key: 'climbs', label: 'Climbs', value: (a) => String(a.climbs.length) },
  { key: 'maxgrade', label: 'Max grade', value: (a) => fmtPct(a.maxGrade) },
  { key: 'elapsed', label: 'Elapsed time', value: (a) => (a.elapsedS !== null ? fmtDuration(a.elapsedS) : null) },
  { key: 'maxele', label: 'Max elevation', value: (a) => (a.maxEle !== null ? fmtM(a.maxEle) : null) },
  { key: 'avgpower', label: 'Avg power', value: (a) => (a.avgPower !== null ? `${Math.round(a.avgPower)} W` : null) },
  { key: 'maxpower', label: 'Max power', value: (a) => (a.maxPower !== null ? `${Math.round(a.maxPower)} W` : null) },
  { key: 'avghr', label: 'Avg heart rate', value: (a) => (a.avgHr !== null ? `${Math.round(a.avgHr)} bpm` : null) },
  { key: 'maxhr', label: 'Max heart rate', value: (a) => (a.maxHr !== null ? `${Math.round(a.maxHr)} bpm` : null) },
  { key: 'avgcad', label: 'Avg cadence', value: (a) => (a.avgCad !== null ? `${Math.round(a.avgCad)} rpm` : null) },
  { key: 'avgtemp', label: 'Avg temperature', value: (a) => (a.avgTemp !== null ? `${Math.round(a.avgTemp)} °C` : null) },
]

export const RC_DEFAULT = ['distance', 'gain', 'moving', 'speed', 'climbs', 'maxgrade']

const W = 1200
const H = 630
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

export function downloadRideCard(a: Analysis, slug: string, sel: string[]) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (!g) return
  paint(g, a, sel)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug}-ride-card.png`
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function paint(g: CanvasRenderingContext2D, a: Analysis, sel: string[]) {
  g.fillStyle = '#09090b'
  g.fillRect(0, 0, W, H)
  const glowA = g.createRadialGradient(0, 0, 0, 0, 0, 900)
  glowA.addColorStop(0, 'rgba(16,185,129,0.18)')
  glowA.addColorStop(1, 'rgba(16,185,129,0)')
  g.fillStyle = glowA
  g.fillRect(0, 0, W, H)
  const glowB = g.createRadialGradient(W, 0, 0, W, 0, 800)
  glowB.addColorStop(0, 'rgba(56,189,248,0.14)')
  glowB.addColorStop(1, 'rgba(56,189,248,0)')
  g.fillStyle = glowB
  g.fillRect(0, 0, W, H)

  const { minLat, maxLat, minLon, maxLon } = a.bounds
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * cos, 1e-9)
  const spanY = Math.max(maxLat - minLat, 1e-9)
  const box = { x: 640, y: 150, w: 500, h: 360 }
  const s = Math.min(box.w / spanX, box.h / spanY)
  const ox = box.x + (box.w - spanX * s) / 2
  const oy = box.y + (box.h - spanY * s) / 2
  const pt = (lat: number, lon: number): [number, number] => [ox + (lon - minLon) * cos * s, oy + (maxLat - lat) * s]

  const prof = a.profile
  const stride = Math.max(1, Math.floor(prof.length / 1200))
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = 7
  for (let i = 0; i < prof.length - stride; i += stride) {
    const [x1, y1] = pt(prof[i].lat, prof[i].lon)
    const [x2, y2] = pt(prof[i + stride].lat, prof[i + stride].lon)
    g.strokeStyle = gradeColor(prof[i].grade)
    g.beginPath()
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
    g.stroke()
  }

  for (const c of a.climbs) {
    g.strokeStyle = CLIMB_COLOR[c.category]
    g.lineWidth = 12
    g.globalAlpha = 0.5
    g.beginPath()
    let started = false
    for (let i = 0; i < prof.length; i += stride) {
      if (prof[i].d < c.startD || prof[i].d > c.endD) continue
      const [x, y] = pt(prof[i].lat, prof[i].lon)
      if (started) g.lineTo(x, y)
      else g.moveTo(x, y)
      started = true
    }
    g.stroke()
    g.globalAlpha = 1
  }

  const [sx, sy] = pt(a.start.lat, a.start.lon)
  const [ex, ey] = pt(a.end.lat, a.end.lon)
  dot(g, sx, sy, '#34d399')
  dot(g, ex, ey, '#f43f5e')

  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  text(g, 'RIDE CARD', 60, 92, `600 20px ${FONT}`, '#34d399', 4)
  text(g, truncate(g, a.name, 540, `700 56px ${FONT}`), 60, 168, `700 56px ${FONT}`, '#fafafa')
  text(g, a.startTime ? fmtDateTime(a.startTime) : '', 60, 210, `400 22px ${FONT}`, '#a1a1aa')

  RC_METRICS.filter((m) => sel.includes(m.key) && m.value(a) !== null)
    .map((m) => [m.label, m.value(a) as string] as const)
    .forEach(([label, value], i, all) => {
      const dense = all.length > 6
      const x = 60 + (i % 3) * 190
      const y = 300 + Math.floor(i / 3) * (dense ? 100 : 150)
      text(g, label.toUpperCase(), x, y, `600 15px ${FONT}`, '#71717a', 2)
      text(g, value, x, y + (dense ? 46 : 50), `600 36px ${FONT}`, '#fafafa')
    })

  text(g, 'gpx.linkinxp.com', 60, H - 48, `500 18px ${FONT}`, '#52525b', 1)
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.beginPath()
  g.arc(x, y, 8, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#09090b'
  g.stroke()
}

function text(g: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string, spacing = 0) {
  g.font = font
  g.fillStyle = color
  if (spacing && 'letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`
  g.fillText(value, x, y)
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
}

function truncate(g: CanvasRenderingContext2D, value: string, maxWidth: number, font: string) {
  g.font = font
  if (g.measureText(value).width <= maxWidth) return value
  let out = value
  while (out.length > 1 && g.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}
