import { useMemo } from 'react'
import type { Analysis } from '../types'
import { gradeColor } from '../lib/analysis'
import { fmtKm } from '../lib/format'

const STOPS = 240

export function GradientRibbon({ a }: { a: Analysis }) {
  const background = useMemo(() => {
    const prof = a.profile
    const stops = Array.from({ length: STOPS }, (_, i) => {
      const k = Math.round((i / (STOPS - 1)) * (prof.length - 1))
      return `${gradeColor(prof[k].grade)} ${((i / (STOPS - 1)) * 100).toFixed(2)}%`
    })
    return `linear-gradient(to right, ${stops.join(', ')})`
  }, [a])

  if (!a.hasElevation) return null

  const total = Math.max(a.totalDistanceM, 1)
  const pct = (m: number) => `${((m / total) * 100).toFixed(3)}%`

  return (
    <div className="mb-3">
      <div className="relative h-8 overflow-hidden rounded-xl ring-1 ring-white/10" style={{ background }}>
        {a.climbs.map((c) => (
          <div key={c.id} className="absolute inset-y-0 border-x border-white/70" style={{ left: pct(c.startD), width: pct(c.lengthM) }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Start</span>
        <span>Grade ribbon · climbs outlined</span>
        <span>{fmtKm(a.totalDistanceM, 1)}</span>
      </div>
    </div>
  )
}
