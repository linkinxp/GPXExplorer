import type { TrackPoint } from '../types'
import { fmtDuration } from '../lib/format'
import { cardClass } from './Section'

const ZONES = [
  { name: 'Z1 Recovery', min: 0, color: '#64748b' },
  { name: 'Z2 Endurance', min: 0.6, color: '#34d399' },
  { name: 'Z3 Tempo', min: 0.7, color: '#fbbf24' },
  { name: 'Z4 Threshold', min: 0.8, color: '#fb923c' },
  { name: 'Z5 VO2 max', min: 0.9, color: '#fb7185' },
]

const MAX_GAP_S = 30
const CAD_BIN = 10

interface Segment {
  p: TrackPoint
  dt: number
}

function segments(points: TrackPoint[]): Segment[] {
  return points.slice(0, -1).flatMap((p, i) => {
    const q = points[i + 1]
    if (!p.time || !q.time) return []
    const dt = Math.min((q.time.getTime() - p.time.getTime()) / 1000, MAX_GAP_S)
    return dt > 0 ? [{ p, dt }] : []
  })
}

export function EffortZones({ points, maxHr }: { points: TrackPoint[]; maxHr: number | null }) {
  const segs = segments(points)
  const hrSegs = maxHr ? segs.filter((s) => s.p.hr !== null) : []
  const zoneSeconds = ZONES.map(() => 0)
  for (const s of hrSegs) {
    const r = (s.p.hr as number) / (maxHr as number)
    let z = 0
    ZONES.forEach((zone, i) => {
      if (r >= zone.min) z = i
    })
    zoneSeconds[z] += s.dt
  }
  const totalHr = zoneSeconds.reduce((a, b) => a + b, 0)

  const cadBins = new Map<number, number>()
  for (const s of segs) {
    if (s.p.cad === null || s.p.cad <= 0) continue
    const bin = Math.floor(s.p.cad / CAD_BIN) * CAD_BIN
    cadBins.set(bin, (cadBins.get(bin) ?? 0) + s.dt)
  }
  const bins = [...cadBins.entries()].sort((a, b) => a[0] - b[0])
  const maxBin = Math.max(1, ...bins.map(([, s]) => s))
  const totalCad = bins.reduce((a, [, s]) => a + s, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={cardClass}>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Heart-rate zones</p>
        {totalHr === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">This file has no heart-rate data.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-zinc-500">
              Percent of your highest recorded heart rate ({Math.round(maxHr as number)} bpm).
            </p>
            <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-zinc-800">
              {ZONES.map((zone, i) => (
                <div
                  key={zone.name}
                  className="h-full transition-[width] duration-700"
                  style={{ width: `${(zoneSeconds[i] / totalHr) * 100}%`, background: zone.color }}
                />
              ))}
            </div>
            <ul className="mt-5 space-y-2.5">
              {ZONES.map((zone, i) => (
                <li key={zone.name} className="flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-2.5 text-zinc-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: zone.color }} />
                    {zone.name}
                  </span>
                  <span className="tabular text-zinc-400">
                    {fmtDuration(zoneSeconds[i])}{' '}
                    <span className="text-zinc-500">· {Math.round((zoneSeconds[i] / totalHr) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className={cardClass}>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Cadence spread</p>
        {totalCad === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">This file has no cadence data.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-zinc-500">Time spent at each cadence, in rpm. Coasting (0 rpm) is left out.</p>
            <div className="mt-5 flex h-40 items-end gap-1.5">
              {bins.map(([bin, secs]) => (
                <div key={bin} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bin}–${bin + CAD_BIN} rpm`}>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-sky-500/60 to-emerald-300/80 transition-[height] duration-700"
                    style={{ height: `${(secs / maxBin) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 text-[10px] tabular text-zinc-500">
              {bins.map(([bin]) => (
                <span key={bin} className="min-w-0 flex-1 truncate text-center">
                  {bin}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
