import type { Analysis } from '../types'
import { fmtSpeed, speedUnit, speedValue } from '../lib/format'
import { cardClass } from './Section'

const BIN = 5
const BAR_PX = 112
const WINDOWS = [
  { label: '5 min', s: 300 },
  { label: '10 min', s: 600 },
  { label: '20 min', s: 1200 },
  { label: '60 min', s: 3600 },
]

export function SpeedHistogram({ a }: { a: Analysis }) {
  const bins = new Map<number, number>()
  let total = 0
  const prof = a.profile
  for (let k = 0; k < prof.length - 1; k++) {
    const v = prof[k].speed
    const t0 = prof[k].t
    const t1 = prof[k + 1].t
    if (v === null || t0 === null || t1 === null) continue
    const dt = t1 - t0
    if (dt <= 0 || v < 0.5) continue
    const b = Math.floor(v / BIN) * BIN
    bins.set(b, (bins.get(b) ?? 0) + dt)
    total += dt
  }
  if (total === 0) return null
  const keys = [...bins.keys()]
  const from = Math.min(...keys)
  const to = Math.max(...keys)
  const list: { b: number; pct: number }[] = []
  for (let b = from; b <= to; b += BIN) list.push({ b, pct: ((bins.get(b) ?? 0) / total) * 100 })
  const peak = Math.max(...list.map((x) => x.pct))

  return (
    <div className={cardClass}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Speed distribution</p>
      <p className="mt-1 text-xs text-zinc-500">Share of moving time spent in each speed band</p>
      <div className="mt-5 flex items-end gap-1.5">
        {list.map((x) => (
          <div key={x.b} className="flex flex-1 flex-col items-center justify-end">
            <span className="tabular mb-1 text-[10px] text-zinc-400">{x.pct >= 1 ? `${x.pct.toFixed(0)}%` : ''}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-emerald-500/60 to-sky-300/90"
              style={{ height: `${(x.pct / peak) * BAR_PX}px` }}
            />
            <span className="tabular mt-2 text-[10px] text-zinc-500">{Math.round(speedValue(x.b))}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Bands are {Math.round(speedValue(BIN))} {speedUnit()} wide, labelled by lower bound.
      </p>
    </div>
  )
}

export function BestSpeeds({ a }: { a: Analysis }) {
  const prof = a.profile.filter((p) => p.t !== null)
  if (prof.length < 2) return null
  const rows = WINDOWS.map((w) => ({ ...w, best: bestAverage(prof, w.s) }))
  if (rows.every((r) => r.best === null)) return null
  const max = Math.max(1, ...rows.map((r) => r.best ?? 0))

  return (
    <div className={cardClass}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Best sustained speed</p>
      <p className="mt-1 text-xs text-zinc-500">Fastest average over each window of the ride</p>
      <ul className="mt-5 space-y-4">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-300">{r.label}</span>
              <span className="tabular text-zinc-100">{r.best === null ? '—' : fmtSpeed(r.best)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-300"
                style={{ width: `${((r.best ?? 0) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function bestAverage(prof: Analysis['profile'], windowS: number): number | null {
  let best = 0
  let i = 0
  for (let j = 0; j < prof.length; j++) {
    const tj = prof[j].t as number
    while (i < j && tj - (prof[i + 1].t as number) >= windowS) i++
    const dt = tj - (prof[i].t as number)
    if (dt >= windowS) best = Math.max(best, (prof[j].d - prof[i].d) / dt)
  }
  return best > 0 ? best : null
}
