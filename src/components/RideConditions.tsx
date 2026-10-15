import type { ReactNode } from 'react'
import type { WeatherPoint } from '../lib/weather'
import { fmtTime, speedUnit, speedValue } from '../lib/format'

const rad = (deg: number) => (deg * Math.PI) / 180

function nearestPoint(points: WeatherPoint[], t: number) {
  return points.reduce((best, p) => (Math.abs(p.time.getTime() - t) < Math.abs(best.time.getTime() - t) ? p : best))
}

export function RideConditions({ points }: { points: WeatherPoint[] }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <DaylightBar points={points} />
      <TempCurve points={points} />
      <WindCompass points={points} />
    </div>
  )
}

function Card({ title, sub, className, children }: { title: string; sub: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="mb-4 text-xs text-zinc-500">{sub}</p>
      {children}
    </div>
  )
}

function DaylightBar({ points }: { points: WeatherPoint[] }) {
  const start = points[0].time.getTime()
  const end = points[points.length - 1].time.getTime()
  const span = Math.max(end - start, 1)
  const N = 120
  const cells = Array.from({ length: N }, (_, i) => {
    const t = start + (span * (i + 0.5)) / N
    const p = nearestPoint(points, t)
    if (!p.sunrise || !p.sunset) return 'bg-zinc-700'
    return t >= p.sunrise.getTime() && t <= p.sunset.getTime() ? 'bg-amber-400/70' : 'bg-indigo-900'
  })
  const events = points
    .flatMap((p) => [
      p.sunrise && { t: p.sunrise, label: 'Sunrise' },
      p.sunset && { t: p.sunset, label: 'Sunset' },
    ])
    .filter((e): e is { t: Date; label: string } => !!e && e.t.getTime() >= start && e.t.getTime() <= end)
    .map((e) => ({ ...e, pct: ((e.t.getTime() - start) / span) * 100 }))

  return (
    <Card title="Daylight along the ride" sub={`${fmtTime(points[0].time)} → ${fmtTime(points[points.length - 1].time)}`}>
      <div className="flex h-3 gap-px overflow-hidden rounded-full">
        {cells.map((c, i) => (
          <span key={i} className={`flex-1 ${c}`} />
        ))}
      </div>
      <div className="relative mt-3 h-8 text-[10px] text-zinc-400">
        {events.map((e) => (
          <span key={`${e.label}-${e.t.getTime()}`} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${e.pct}%` }}>
            {e.label} {fmtTime(e.t)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-full bg-amber-400/70" /> Daylight
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-full bg-indigo-900" /> Night
        </span>
      </div>
    </Card>
  )
}

function TempCurve({ points }: { points: WeatherPoint[] }) {
  const defined = points.filter((p): p is WeatherPoint & { temp: number } => p.temp !== null)
  if (defined.length < 2) return null
  const W = 400
  const H = 130
  const PAD = 28
  const lo = Math.min(...defined.map((p) => p.temp)) - 2
  const hi = Math.max(...defined.map((p) => p.temp)) + 2
  const X = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD)
  const Y = (v: number) => H - 24 - ((v - lo) / Math.max(hi - lo, 1)) * (H - 24 - 18)
  const plotted = points.flatMap((p, i) => (p.temp === null ? [] : [{ x: X(i), y: Y(p.temp), t: p.temp, label: p.label }]))

  return (
    <Card title="Temperature" sub="Forecast at each point of the ride">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <polyline points={plotted.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={2} />
        {plotted.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fbbf24" stroke="#09090b" strokeWidth={2} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={11} fill="#fde68a">
              {Math.round(p.t)}°
            </text>
            <text x={p.x} y={H - 6} textAnchor="middle" fontSize={10} fill="#71717a">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </Card>
  )
}

function WindCompass({ points }: { points: WeatherPoint[] }) {
  return (
    <Card
      className="lg:col-span-2"
      title="Wind against your direction"
      sub="The top of each dial is your direction of travel. The arrow shows where the wind blows; red is into your face."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {points.map((p) => (
          <Compass key={p.label} p={p} />
        ))}
      </div>
    </Card>
  )
}

function Compass({ p }: { p: WeatherPoint }) {
  const angle = p.windFromDeg === null ? 0 : p.windFromDeg + 180 - p.bearingDeg
  const pt = (theta: number, len: number): [number, number] => [len * Math.sin(rad(theta)), -len * Math.cos(rad(theta))]
  const [tx, ty] = pt(angle, 34)
  const [b1x, b1y] = pt(angle + 180 + 30, 9)
  const [b2x, b2y] = pt(angle + 180 - 30, 9)
  const head = p.headwindKmh
  const tone = head === null || Math.abs(head) < 3 ? '#a1a1aa' : head > 0 ? '#fb7185' : '#34d399'
  const headLabel =
    head === null ? '—' : Math.abs(head) < 3 ? 'Crosswind' : head > 0 ? 'Headwind' : 'Tailwind'

  return (
    <div className="text-center">
      <svg viewBox="-50 -50 100 100" className="mx-auto block w-full max-w-[120px]">
        <circle r={40} fill="#09090b" stroke="#3f3f46" className="dial-ring" />
        <text x={0} y={-44} textAnchor="middle" fontSize={7} fill="#71717a">
          ride
        </text>
        {p.windFromDeg !== null && (
          <>
            <g className="dial-arrow">
              <line x1={0} y1={0} x2={tx} y2={ty} stroke={tone} strokeWidth={3} strokeLinecap="round" />
              <polygon points={`${tx},${ty} ${tx + b1x},${ty + b1y} ${tx + b2x},${ty + b2y}`} fill={tone} />
            </g>
          </>
        )}
        <circle r={2.5} fill="#fafafa" />
      </svg>
      <p className="mt-1 text-xs text-zinc-300">{p.label}</p>
      <p className="tabular text-[11px] text-zinc-500">
        {p.windKmh === null ? '—' : `${Math.round(speedValue(p.windKmh))} ${speedUnit()}`} · {headLabel}
      </p>
    </div>
  )
}
