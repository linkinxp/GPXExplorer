import { useMemo, type MouseEvent } from 'react'
import type { Analysis, Climb, ClimbCategory } from '../types'
import { fmtKm, fmtM, fmtPct } from '../lib/format'
import { gradeColor } from '../lib/analysis'

const W = 800
const PAD = 24

export const CLIMB_COLOR: Record<ClimbCategory, string> = {
  HC: '#fb7185',
  '1': '#fb923c',
  '2': '#fbbf24',
  '3': '#a3e635',
  '4': '#38bdf8',
}

const categoryLabel = (c: Climb) => (c.category === 'HC' ? 'HC' : c.category)
const categoryName = (c: Climb) => (c.category === 'HC' ? 'HC climb' : `Cat ${c.category}`)

interface RouteMapProps {
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
  selectedId: Climb['id'] | null
}

export function RouteMap({ a, hoverD, onHover, selectedId }: RouteMapProps) {
  const { base, climbs, marker, readout, samples, height, start, end } = useMemo(() => {
    const { minLat, maxLat, minLon, maxLon } = a.bounds
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const spanX = Math.max((maxLon - minLon) * cos, 1e-9)
    const spanY = Math.max(maxLat - minLat, 1e-9)
    const h = Math.round(Math.min(560, Math.max(300, ((W - 2 * PAD) * spanY) / spanX + 2 * PAD)))
    const scale = Math.min((W - 2 * PAD) / spanX, (h - 2 * PAD) / spanY)
    const offX = (W - spanX * scale) / 2
    const offY = (h - spanY * scale) / 2
    const proj = (lat: number, lon: number): [number, number] => [
      offX + (lon - minLon) * cos * scale,
      offY + (maxLat - lat) * scale,
    ]

    const prof = a.profile
    const stride = Math.max(1, Math.floor(prof.length / 2500))
    const seg = (i: number) => {
      const [x1, y1] = proj(prof[i].lat, prof[i].lon)
      const [x2, y2] = proj(prof[i + stride].lat, prof[i + stride].lon)
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
    }

    const byColor = new Map<string, string>()
    const samples: { x: number; y: number; d: number }[] = []
    for (let i = 0; i < prof.length - stride; i += stride) {
      const color = gradeColor(prof[i].grade)
      byColor.set(color, (byColor.get(color) ?? '') + seg(i))
      const [x, y] = proj(prof[i].lat, prof[i].lon)
      samples.push({ x, y, d: prof[i].d })
    }
    const baseD = [...byColor.entries()]

    const climbs = a.climbs.map((c) => {
      let d = ''
      let first: [number, number] | null = null
      for (let i = 0; i < prof.length - stride; i += stride) {
        if (prof[i].d < c.startD || prof[i].d > c.endD) continue
        if (!first) first = proj(prof[i].lat, prof[i].lon)
        d += seg(i)
      }
      return { climb: c, d, badge: first ?? proj(prof[0].lat, prof[0].lon) }
    })

    let m: [number, number] | null = null
    let info: { d: number; ele: number; grade: number } | null = null
    if (hoverD !== null && prof.length) {
      let lo = 0
      let hi = prof.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (prof[mid].d < hoverD) lo = mid + 1
        else hi = mid
      }
      m = proj(prof[lo].lat, prof[lo].lon)
      info = { d: prof[lo].d, ele: prof[lo].ele, grade: prof[lo].grade }
    }

    return {
      base: baseD,
      climbs,
      marker: m,
      readout: info,
      samples,
      height: h,
      start: proj(a.start.lat, a.start.lon),
      end: proj(a.end.lat, a.end.lon),
    }
  }, [a, hoverD])

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * height
    let best = samples[0]
    let bestD = Infinity
    for (const s of samples) {
      const dist = (s.x - x) ** 2 + (s.y - y) ** 2
      if (dist < bestD) {
        bestD = dist
        best = s
      }
    }
    onHover(best ? best.d : null)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full"
        role="img"
        aria-label="Route map with climbs highlighted"
        onMouseMove={onMove}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <radialGradient id="map-bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#27272a" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={height} fill="url(#map-bg)" />
        <rect width={W} height={height} fill="url(#map-grid)" opacity="0.5" />
        {base.map(([color, d]) => (
          <path key={color} d={d} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.85} />
        ))}
        {climbs.map(({ climb, d }) => {
          const color = CLIMB_COLOR[climb.category]
          const dim = selectedId !== null && selectedId !== climb.id ? 0.35 : 1
          return (
            <g key={climb.id} opacity={dim}>
              <path d={d} stroke={color} strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.2} />
              <path d={d} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" />
            </g>
          )
        })}
        {climbs.map(({ climb, badge }) => {
          const color = CLIMB_COLOR[climb.category]
          return (
            <g key={`badge-${climb.id}`}>
              <circle cx={badge[0]} cy={badge[1]} r={11} fill={color} stroke="#09090b" strokeWidth={2} />
              <text x={badge[0]} y={badge[1]} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#09090b">
                {categoryLabel(climb)}
              </text>
            </g>
          )
        })}
        <circle cx={start[0]} cy={start[1]} r={6} fill="#34d399" stroke="#09090b" strokeWidth={2} />
        <circle cx={end[0]} cy={end[1]} r={6} fill="#f43f5e" stroke="#09090b" strokeWidth={2} />
        {marker && (
          <g>
            <circle cx={marker[0]} cy={marker[1]} r={12} fill="#fafafa" opacity={0.15} />
            <circle cx={marker[0]} cy={marker[1]} r={5} fill="#fafafa" stroke="#09090b" strokeWidth={2} />
          </g>
        )}
      </svg>
      {readout && (
        <div className="absolute right-4 top-4 rounded-xl bg-zinc-950/80 px-3 py-2 text-xs text-zinc-200 ring-1 ring-white/10 backdrop-blur">
          <span className="tabular">{fmtKm(readout.d, 2)}</span> · <span className="tabular">{fmtM(readout.ele)}</span> ·{' '}
          <span className="tabular" style={{ color: gradeColor(readout.grade) }}>{fmtPct(readout.grade)}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/80 px-4 py-3 text-[11px] text-zinc-300">
        {climbs.length === 0 && <span className="text-zinc-500">No categorised climbs</span>}
        {climbs.map(({ climb }) => (
          <span key={climb.id} className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full" style={{ background: CLIMB_COLOR[climb.category] }} />
            {categoryName(climb)} · {fmtKm(climb.lengthM, 1)} from {fmtKm(climb.startD, 1)}
          </span>
        ))}
      </div>
    </div>
  )
}
