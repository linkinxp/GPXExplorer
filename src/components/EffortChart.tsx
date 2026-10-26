import { useMemo, type MouseEvent } from 'react'
import type { Analysis, ProfilePoint } from '../types'
import { distUnit, fmtKm, speedUnit, speedValue } from '../lib/format'
import { CardIcon } from './CardIcon'
import { BestSpeeds, SpeedHistogram } from './SpeedInsights'

const W = 800
const H = 140
const PAD_L = 4
const PAD_R = 8
const PAD_T = 10
const PAD_B = 6

type Field = 'hr' | 'speed' | 'power' | 'cad'

interface EffortChartProps {
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
}

export function EffortChart({ a, hoverD, onHover }: EffortChartProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {a.avgHr !== null && (
        <Trace title="Heart rate" unit="bpm" color="#fb7185" field="hr" a={a} hoverD={hoverD} onHover={onHover} />
      )}
      {a.avgPower !== null && (
        <Trace title="Power" unit="W" color="#a78bfa" field="power" a={a} hoverD={hoverD} onHover={onHover} />
      )}
      {a.avgMovingSpeed !== null && (
        <Trace title="Speed" unit={speedUnit()} color="#38bdf8" field="speed" a={a} hoverD={hoverD} onHover={onHover} />
      )}
      {a.avgCad !== null && (
        <Trace title="Cadence" unit="rpm" color="#fbbf24" field="cad" a={a} hoverD={hoverD} onHover={onHover} />
      )}
      <SpeedHistogram a={a} />
      <BestSpeeds a={a} />
    </div>
  )
}

function nearest(pts: { d: number; v: number }[], d: number) {
  let lo = 0
  let hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].d < d) lo = mid + 1
    else hi = mid
  }
  return pts[lo].v
}

function Trace({
  title,
  unit,
  color,
  field,
  a,
  hoverD,
  onHover,
}: {
  title: string
  unit: string
  color: string
  field: Field
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
}) {
  const g = useMemo(() => {
    const pts = a.profile.flatMap((p: ProfilePoint) => {
      const v = p[field]
      return v === null ? [] : [{ d: p.d, v: field === 'speed' ? speedValue(v) : v }]
    })
    const total = Math.max(a.totalDistanceM, 1)
    const vals = pts.map((p) => p.v)
    const vMin = Math.min(...vals)
    const vMax = Math.max(...vals)
    const lo = field === 'hr' ? Math.max(0, Math.floor((vMin - 10) / 10) * 10) : 0
    const hi = Math.max(Math.ceil((vMax + 5) / 10) * 10, lo + 10)
    const X = (d: number) => PAD_L + (d / total) * (W - PAD_L - PAD_R)
    const Y = (v: number) => H - PAD_B - ((v - lo) / (hi - lo)) * (H - PAD_T - PAD_B)
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('')
    const first = pts[0]
    const last = pts[pts.length - 1]
    const area = `${line}L${X(last.d).toFixed(1)} ${H - PAD_B}L${X(first.d).toFixed(1)} ${H - PAD_B}Z`
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    return { pts, line, area, X, Y, lo, hi, avg, max: vMax, total }
  }, [a, field, unit])

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const d = ((x - PAD_L) / (W - PAD_L - PAD_R)) * g.total
    onHover(d >= 0 && d <= g.total ? d : null)
  }

  const decimals = field === 'hr' || field === 'power' || field === 'cad' ? 0 : 1
  const readout = hoverD === null || g.pts.length === 0 ? null : nearest(g.pts, hoverD)
  const ticks = [g.lo, (g.lo + g.hi) / 2, g.hi]

  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
      <CardIcon label={title} />
      <div className="mb-3 flex items-baseline justify-between gap-3 pr-10">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <span className="tabular text-xs text-zinc-400">
          {readout !== null
            ? `${readout.toFixed(decimals)} ${unit}`
            : `avg ${g.avg.toFixed(decimals)} · max ${g.max.toFixed(decimals)} ${unit}`}
        </span>
      </div>
      <div className="flex">
        <div className="relative w-9 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-1 -translate-y-1/2 text-xs text-zinc-500 md:text-sm"
              style={{ top: `${(g.Y(t) / H) * 100}%` }}
            >
              {Math.round(t)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block min-w-0 flex-1"
          role="img"
          aria-label={`${title} along the route`}
          onMouseMove={onMove}
          onMouseLeave={() => onHover(null)}
        >
          <defs>
            <linearGradient id={`effort-${field}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line key={t} x1={PAD_L} x2={W - PAD_R} y1={g.Y(t)} y2={g.Y(t)} stroke="#27272a" strokeDasharray="3 5" />
          ))}
          <path key={`area-${field}`} d={g.area} fill={`url(#effort-${field})`} className="anim-fade-in" />
          <path key={`line-${field}`} d={g.line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" pathLength={1} className="anim-draw" />
          {hoverD !== null && (
            <line x1={g.X(hoverD)} x2={g.X(hoverD)} y1={PAD_T} y2={H - PAD_B} stroke="#fafafa" strokeOpacity={0.35} />
          )}
        </svg>
      </div>
      <div className="tabular ml-9 mt-1 flex justify-between text-xs text-zinc-500 md:text-sm">
        <span>0 {distUnit()}</span>
        <span>{fmtKm(g.total, 1)}</span>
      </div>
    </div>
  )
}
