import { useMemo, useRef, type PointerEvent } from 'react'
import type { Analysis } from '../types'
import { gradeColor } from '../lib/analysis'
import { distUnit, fmtKm, fmtM, fmtPct, speedUnit, speedValue } from '../lib/format'

const W = 1000
const H = 320
const TOP = 24
const BOTTOM = 28

interface ElevationProfileProps {
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
  focusRange: { startD: number; endD: number } | null
}

export function ElevationProfile({ a, hoverD, onHover, focusRange }: ElevationProfileProps) {
  const ref = useRef<SVGSVGElement>(null)
  const total = a.totalDistanceM

  const geo = useMemo(() => {
    const prof = a.profile
    const eles = prof.map((p) => p.ele)
    const minE = Math.min(...eles)
    const maxE = Math.max(...eles)
    const range = Math.max(maxE - minE, 10)
    const lo = minE - range * 0.08
    const hi = maxE + range * 0.12
    const x = (d: number) => (d / total) * W
    const y = (e: number) => TOP + (1 - (e - lo) / (hi - lo)) * (H - TOP - BOTTOM)
    const stride = Math.max(1, Math.floor(prof.length / 1400))
    const pts = prof.filter((_, i) => i % stride === 0 || i === prof.length - 1)
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.ele).toFixed(1)}`).join('')
    const area = `${line}L${W} ${H - BOTTOM}L0 ${H - BOTTOM}Z`
    const stops = pts
      .filter((_, i) => i % 3 === 0)
      .map((p) => ({ off: (p.d / total) * 100, color: gradeColor(p.grade) }))
    return { line, area, stops, x, y, lo, hi, minE, maxE }
  }, [a, total])

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onHover(frac * total)
  }

  const hoverIdx = hoverD === null ? -1 : nearestIndex(a.profile, hoverD)
  const hp = hoverIdx >= 0 ? a.profile[hoverIdx] : null
  const hx = hp ? geo.x(hp.d) : 0
  const tipLeft = hp ? (hx / W) * 100 : 0

  if (!a.hasElevation) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-400">
        This file has no elevation data, so there is no profile to draw.
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 pt-5">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
        <span>Elevation profile</span>
        <span className="tabular">
          {fmtM(geo.minE)} – {fmtM(geo.maxE)}
        </span>
      </div>
      <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none select-none"
        role="img"
        aria-label="Elevation profile coloured by gradient"
      >
        <defs>
          <linearGradient id="elev-stroke" x1="0" x2="1" y1="0" y2="0" gradientUnits="objectBoundingBox">
            {geo.stops.map((s, i) => (
              <stop key={i} offset={`${s.off}%`} stopColor={s.color} />
            ))}
          </linearGradient>
          <filter id="elev-glow" x="-5%" y="-30%" width="110%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <linearGradient id="elev-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={TOP + f * (H - TOP - BOTTOM)} y2={TOP + f * (H - TOP - BOTTOM)} stroke="#27272a" strokeDasharray="4 6" />
        ))}
        {focusRange && (
          <rect
            x={geo.x(focusRange.startD)}
            width={Math.max(2, geo.x(focusRange.endD) - geo.x(focusRange.startD))}
            y={TOP}
            height={H - TOP - BOTTOM}
            fill="#fafafa"
            opacity={0.06}
          />
        )}
        <path d={geo.area} fill="url(#elev-fill)" className="anim-fade-in" />
        <path d={geo.line} fill="none" stroke="url(#elev-stroke)" strokeWidth={12} strokeLinejoin="round" opacity={0.35} filter="url(#elev-glow)" pathLength={1} className="anim-draw" />
        <path d={geo.line} fill="none" stroke="url(#elev-stroke)" strokeWidth={3} strokeLinejoin="round" pathLength={1} className="anim-draw" />
        {hp && (
          <g>
            <line x1={hx} x2={hx} y1={TOP} y2={H - BOTTOM} stroke="#fafafa" strokeOpacity={0.5} strokeDasharray="3 4" />
            <circle cx={hx} cy={geo.y(hp.ele)} r={6} fill="#09090b" stroke={gradeColor(hp.grade)} strokeWidth={3} />
          </g>
        )}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => onHover(null)}
          style={{ cursor: 'crosshair' }}
        />
      </svg>
      <div className="tabular mt-1 flex justify-between text-xs text-zinc-500 md:text-sm">
        <span>0 {distUnit()}</span>
        <span>{fmtKm(total, 1)}</span>
      </div>
      {hp && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: `${tipLeft}%` }}
        >
          <p className="font-medium text-zinc-100">{fmtKm(hp.d)}</p>
          <p className="tabular text-zinc-300">
            {fmtM(hp.ele)} · <span style={{ color: gradeColor(hp.grade) }}>{fmtPct(hp.grade)}</span>
          </p>
          {(hp.speed !== null || hp.hr !== null || hp.power !== null) && (
            <p className="tabular text-zinc-400">
              {[
                hp.speed !== null ? `${speedValue(hp.speed).toFixed(1)} ${speedUnit()}` : null,
                hp.power !== null ? `${Math.round(hp.power)} W` : null,
                hp.hr !== null ? `${Math.round(hp.hr)} bpm` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

function nearestIndex(prof: Analysis['profile'], d: number) {
  let lo = 0
  let hi = prof.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (prof[mid].d < d) lo = mid + 1
    else hi = mid
  }
  return lo
}
