import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { Analysis, Climb, ClimbCategory } from '../types'
import { GRADE_BUCKETS, gradeColor } from '../lib/analysis'
import { distUnit, distUnitM, elevUnit, elevValue, fmtKm, fmtM, fmtPct, getUnitSystem } from '../lib/format'

const W = 800
const H = 430
const PAD_L = 56
const PAD_R = 22
const PAD_T = 66
const PAD_B = 42
const COLUMNS = 320
const FLYBY_MS = 28000

const CLIMB_COLOR: Record<ClimbCategory, string> = {
  HC: '#fb7185',
  '1': '#fb923c',
  '2': '#fbbf24',
  '3': '#a3e635',
  '4': '#38bdf8',
}

const categoryLabel = (c: Climb) => (c.category === 'HC' ? 'HC' : c.category)

function niceStep(rangeKm: number) {
  const raw = rangeKm / 6
  return [1, 2, 5, 10, 20, 25, 50, 100].find((s) => s >= raw) ?? 100
}

interface ClimbCurtainProps {
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
  selectedId: Climb['id'] | null
}

export function ClimbCurtain({ a, hoverD, onHover, selectedId }: ClimbCurtainProps) {
  const [is3d, setIs3d] = useState(true)
  const [playing, setPlaying] = useState(false)

  const units = getUnitSystem()
  const g = useMemo(() => {
    const prof = a.profile
    const total = Math.max(a.totalDistanceM, 1)
    const eLo = a.minEle ?? 0
    const eHi = a.maxEle ?? eLo + 20
    let eMin = Math.floor((eLo - 8) / 10) * 10
    let eMax = Math.ceil((eHi + 30) / 10) * 10
    if (eMax - eMin < 20) eMax = eMin + 20
    const dx = is3d ? 38 : 0
    const dy = is3d ? -44 : 0
    const base = H - PAD_B
    const plotW = W - PAD_L - PAD_R - dx
    const plotH = base - PAD_T - Math.abs(dy)
    const X = (d: number) => PAD_L + (d / total) * plotW
    const Y = (e: number) => base - ((e - eMin) / (eMax - eMin)) * plotH

    const stride = Math.max(1, Math.floor(prof.length / COLUMNS))
    const columns: { x1: number; x2: number; y1: number; y2: number; color: string }[] = []
    const ridge: [number, number][] = []
    for (let i = 0; i + stride < prof.length; i += stride) {
      const p = prof[i]
      const q = prof[i + stride]
      let grade = 0
      for (let j = i; j <= i + stride; j++) grade += prof[j].grade
      grade /= stride + 1
      columns.push({ x1: X(p.d), x2: X(q.d), y1: Y(p.ele), y2: Y(q.ele), color: gradeColor(grade) })
      ridge.push([X(p.d), Y(p.ele)])
    }
    const last = prof[prof.length - 1]
    if (last) ridge.push([X(last.d), Y(last.ele)])
    const ridgeD = ridge.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
    const backRidgeD = ridge
      .map(([x, y], i) => `${i ? 'L' : 'M'}${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}`)
      .join('')

    const climbs = a.climbs.map((c) => {
      let top = { d: c.startD, ele: -Infinity }
      for (const p of prof) {
        if (p.d < c.startD || p.d > c.endD) continue
        if (p.ele > top.ele) top = { d: p.d, ele: p.ele }
      }
      return { climb: c, x0: X(c.startD), x1: X(c.endD), bx: X(top.d), by: Y(top.ele) - 22 }
    })

    const stepU = niceStep(total / distUnitM())
    const ticksX: { x: number; label: string }[] = []
    for (let k = 0; k * stepU * distUnitM() <= total; k++) {
      ticksX.push({ x: X(k * stepU * distUnitM()), label: `${k * stepU} ${distUnit()}` })
    }
    const eStep = (eMax - eMin) / 4
    const ticksY = [0, 1, 2, 3, 4].map((k) => {
      const e = eMin + k * eStep
      return { y: Y(e), label: `${Math.round(elevValue(e))} ${elevUnit()}` }
    })

    return { base, plotW, total, dx, dy, X, Y, columns, ridgeD, backRidgeD, climbs, ticksX, ticksY }
  }, [a, is3d, units])

  const hoverPoint = useMemo(() => {
    if (hoverD === null || !a.profile.length) return null
    const prof = a.profile
    let lo = 0
    let hi = prof.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (prof[mid].d < hoverD) lo = mid + 1
      else hi = mid
    }
    return { x: g.X(prof[lo].d), y: g.Y(prof[lo].ele) }
  }, [a.profile, hoverD, g])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let d = 0
    let last = performance.now()
    const step = (now: number) => {
      d += ((now - last) / FLYBY_MS) * g.total
      last = now
      if (d >= g.total) {
        onHover(null)
        setPlaying(false)
        return
      }
      onHover(d)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, g.total, onHover])

  const ahead = (x: number) => playing && hoverPoint !== null && x > hoverPoint.x

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (playing) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const d = ((x - PAD_L) / g.plotW) * g.total
    onHover(d >= 0 && d <= g.total ? d : null)
  }

  const { base, dx, dy } = g

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 shadow-2xl shadow-black/40">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={is3d ? '3D climb view, elevation walls coloured by gradient' : 'Flat elevation view coloured by gradient'}
        onMouseMove={onMove}
        onMouseLeave={() => !playing && onHover(null)}
      >
        <defs>
          <radialGradient id="curtain-glow" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <linearGradient id="curtain-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#09090b" stopOpacity="0" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="ridge-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        <rect width={W} height={H} fill="url(#curtain-glow)" />

        {g.ticksY.map((t) => (
          <line key={`gy-${t.label}`} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="#27272a" strokeDasharray="3 5" />
        ))}

        {g.climbs.map(({ climb, x0, x1 }) => (
          <rect
            key={`band-${climb.id}`}
            x={x0}
            y={PAD_T}
            width={Math.max(1, x1 - x0)}
            height={base - PAD_T}
            fill={CLIMB_COLOR[climb.category]}
            opacity={selectedId === climb.id ? 0.18 : 0.07}
          />
        ))}

        {is3d && (
          <g>
            <polygon
              points={`${g.X(0)},${base} ${g.X(g.total)},${base} ${g.X(g.total) + dx},${base + dy} ${g.X(0) + dx},${base + dy}`}
              fill="#18181b"
              stroke="#3f3f46"
            />
            {g.ticksX.map((t) => (
              <line key={`gx3-${t.label}`} x1={t.x} y1={base} x2={t.x + dx} y2={base + dy} stroke="#3f3f46" />
            ))}
          </g>
        )}

        {is3d &&
          g.columns.map((c, i) => (
            <polygon
              key={`s-${i}`}
              points={`${c.x1},${c.y1} ${c.x2},${c.y2} ${c.x2 + dx},${c.y2 + dy} ${c.x1 + dx},${c.y1 + dy}`}
              fill={c.color}
              stroke={c.color}
              strokeWidth={0.5}
              opacity={ahead(c.x1) ? 0.06 : 0.55}
            />
          ))}
        {is3d &&
          g.columns.map((c, i) => (
            <path
              key={`b-${i}`}
              d={`M${(c.x1 + dx).toFixed(1)} ${(base + dy).toFixed(1)}L${(c.x1 + dx).toFixed(1)} ${(c.y1 + dy).toFixed(1)}L${(c.x2 + dx).toFixed(1)} ${(c.y2 + dy).toFixed(1)}L${(c.x2 + dx).toFixed(1)} ${(base + dy).toFixed(1)}Z`}
              fill={c.color}
              opacity={ahead(c.x1) ? 0.05 : 0.3}
            />
          ))}
        {is3d && <path d={g.backRidgeD} fill="none" stroke="#e4e4e7" strokeWidth={1} opacity={0.4} />}

        {g.columns.map((c, i) => (
          <path
            key={`f-${i}`}
            d={`M${c.x1.toFixed(1)} ${base}L${c.x1.toFixed(1)} ${c.y1.toFixed(1)}L${c.x2.toFixed(1)} ${c.y2.toFixed(1)}L${c.x2.toFixed(1)} ${base}Z`}
            fill={c.color}
            stroke={c.color}
            strokeWidth={0.6}
            opacity={ahead(c.x1) ? 0.12 : 1}
          />
        ))}
        <rect x={0} y={base - 140} width={W} height={140} fill="url(#curtain-fade)" pointerEvents="none" />

        <path d={g.ridgeD} fill="none" stroke="url(#ridge-sheen)" strokeWidth={1.6} strokeLinejoin="round" />

        {g.climbs.map(({ climb, bx, by }) => {
          const color = CLIMB_COLOR[climb.category]
          return (
            <g key={`badge-${climb.id}`} opacity={selectedId === null || selectedId === climb.id ? 1 : 0.4}>
              <text x={bx} y={by - 16} textAnchor="middle" fontSize={10} fill="#d4d4d8">
                {fmtPct(climb.avgGrade)}
              </text>
              <circle cx={bx} cy={by} r={11} fill={color} stroke="#09090b" strokeWidth={2} />
              <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#09090b">
                {categoryLabel(climb)}
              </text>
            </g>
          )
        })}

        {g.ticksX.map((t) => (
          <text key={`tx-${t.label}`} x={t.x} y={base + 18} textAnchor="middle" fontSize={10} fill="#71717a">
            {t.label}
          </text>
        ))}
        {g.ticksY.map((t) => (
          <text key={`ty-${t.label}`} x={PAD_L - 10} y={t.y + 3} textAnchor="end" fontSize={10} fill="#71717a">
            {t.label}
          </text>
        ))}

        {hoverPoint && (
          <g>
            <line x1={hoverPoint.x} x2={hoverPoint.x} y1={PAD_T} y2={base} stroke="#fafafa" strokeOpacity={0.35} />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={5} fill="#fafafa" stroke="#09090b" strokeWidth={2} />
          </g>
        )}
      </svg>

      <div className="absolute left-4 top-4 flex items-center gap-3 rounded-full bg-zinc-950/70 px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/10 backdrop-blur">
        <span className="tabular">↗ {fmtM(a.elevGainM)}</span>
        <span className="tabular">↘ {fmtM(a.elevLossM)}</span>
        <span className="tabular">Max {fmtPct(a.maxGrade)}</span>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-full bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 backdrop-blur transition hover:text-white"
        >
          {playing ? 'Pause' : 'Fly-by'}
        </button>
      <div className="flex rounded-full bg-zinc-950/70 p-0.5 text-xs ring-1 ring-white/10 backdrop-blur">
        {(['2D', '3D'] as const).map((label) => {
          const active = (label === '3D') === is3d
          return (
            <button
              key={label}
              type="button"
              onClick={() => setIs3d(label === '3D')}
              className={`rounded-full px-3 py-1 transition ${active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/80 px-4 py-2.5 text-[11px] text-zinc-400">
        <div className="flex flex-wrap items-center gap-1">
          {GRADE_BUCKETS.map((b) => (
            <span key={b.label} className="flex items-center gap-1 pr-2">
              <span className="h-2 w-3 rounded-full" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
        <span className="tabular text-zinc-500">
          {a.climbs.length} {a.climbs.length === 1 ? 'climb' : 'climbs'} · {fmtKm(a.totalDistanceM, 1)}
        </span>
      </div>
    </div>
  )
}
