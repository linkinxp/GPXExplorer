import type { WeatherPoint } from '../lib/weather'
import { speedUnit, speedValue } from '../lib/format'
import { cardClass } from './Section'

const C = 100
const R = 84
const CARDINALS = ['N', 'E', 'S', 'W']
const WEDGE = 13

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) }
}

const cardinal = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]

function circularMean(degs: number[]) {
  const x = degs.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0)
  const y = degs.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0)
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
}

function petal(deg: number, r: number, half = WEDGE) {
  const a = polar(deg - half, r)
  const b = polar(deg + half, r)
  return `M${C} ${C} L${a.x.toFixed(1)} ${a.y.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`
}

const toneColor = (head: number | null) =>
  head === null || Math.abs(head) < 3 ? '#a1a1aa' : head > 0 ? '#fb7185' : '#34d399'

export function WindRose({ points }: { points: WeatherPoint[] }) {
  const usable = points.filter((p) => p.windFromDeg !== null)
  const maxWind = Math.max(1, ...usable.map((p) => p.windKmh ?? 0))
  const rideBearing = circularMean(points.map((p) => p.bearingDeg))

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Wind rose</p>
        <p className="text-xs text-zinc-500">Petals point where the wind blows from</p>
      </div>

      {usable.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">No wind data for this route.</p>
      ) : (
        <div className="mt-4 grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[340px]" aria-label="Wind rose">
            {[0.33, 0.66, 1].map((f) => (
              <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="#27272a" strokeDasharray="3 4" />
            ))}
            {[0, 90, 180, 270].map((d) => (
              <line key={d} x1={C} y1={C} x2={polar(d, R).x} y2={polar(d, R).y} stroke="#27272a" />
            ))}
            {CARDINALS.map((label, i) => {
              const p = polar(i * 90, R + 12)
              return (
                <text key={label} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-zinc-500 text-[10px]">
                  {label}
                </text>
              )
            })}
            <path d={petal(rideBearing, R, 30)} fill="#fb7185" fillOpacity={0.07} />
            <path d={petal((rideBearing + 180) % 360, R, 30)} fill="#34d399" fillOpacity={0.07} />
            {usable.map((p) => {
              const r = Math.max(10, ((p.windKmh ?? 0) / maxWind) * R)
              return (
                <path
                  key={p.label}
                  d={petal(p.windFromDeg as number, r)}
                  fill={toneColor(p.headwindKmh)}
                  fillOpacity={0.35}
                  stroke={toneColor(p.headwindKmh)}
                  strokeWidth={1}
                  className="anim-fade-in"
                />
              )
            })}
            <circle cx={C} cy={C} r={3} fill="#e4e4e7" />
          </svg>

          <ul className="space-y-2.5 text-sm">
            {usable.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2.5 text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: toneColor(p.headwindKmh) }} />
                  {p.label}
                </span>
                <span className="tabular text-zinc-400">
                  {speedValue(p.windKmh ?? 0).toFixed(0)} {speedUnit()} from {cardinal(p.windFromDeg as number)}
                </span>
              </li>
            ))}
            <li className="pt-2 text-xs text-zinc-500">
              <span className="text-rose-300">Red</span> headwind · <span className="text-emerald-300">green</span> tailwind ·{' '}
              <span className="text-zinc-400">grey</span> crosswind
            </li>
            <li className="text-xs text-zinc-500">Shaded wedges show headwind (rose) and tailwind (green) for your average heading, ±30°.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
