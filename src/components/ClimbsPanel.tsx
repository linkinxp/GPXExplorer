import type { Analysis, Climb, ClimbCategory, SteepSection } from '../types'
import { distUnit, distValue, fmtKm, fmtM, fmtPct } from '../lib/format'
import { GRADE_BUCKETS, gradeColor } from '../lib/analysis'
import { MagicCard } from './magic/magic-card'
import { cn } from '../lib/utils'

const CATEGORY_STYLE: Record<ClimbCategory, string> = {
  HC: 'bg-rose-500/15 text-rose-300 ring-rose-400/40',
  '1': 'bg-orange-500/15 text-orange-300 ring-orange-400/40',
  '2': 'bg-amber-500/15 text-amber-300 ring-amber-400/40',
  '3': 'bg-lime-500/15 text-lime-300 ring-lime-400/40',
  '4': 'bg-sky-500/15 text-sky-300 ring-sky-400/40',
}

interface ClimbsPanelProps {
  a: Analysis
  selectedId: number | null
  onSelect: (climb: Climb | null) => void
}

export function ClimbsPanel({ a, selectedId, onSelect }: ClimbsPanelProps) {
  if (!a.hasElevation) return null

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {a.climbs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-sm text-zinc-400">
            No categorised climbs. A climb needs at least 400 m at 3% average.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {a.climbs.map((c, i) => {
              const active = selectedId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(active ? null : c)}
                  className={cn(
                    'anim-fade-up block h-full w-full text-left',
                    i === a.climbs.length - 1 && a.climbs.length % 2 === 1 && 'sm:col-span-2',
                  )}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <MagicCard
                    gradientFrom="#fb7185"
                    gradientTo="#fbbf24"
                    gradientColor="#18181b"
                    gradientOpacity={0.9}
                    className={cn(
                      'h-full rounded-2xl border bg-zinc-900/70 transition-colors',
                      active ? 'border-rose-400/60' : 'border-zinc-800/80 hover:border-zinc-600',
                    )}
                  >
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
                            CATEGORY_STYLE[c.category],
                          )}
                        >
                          {c.category === 'HC' ? 'HC climb' : `Cat ${c.category}`}
                        </span>
                        <span className="tabular text-xs text-zinc-500">
                          {distValue(c.startD).toFixed(1)} → {distValue(c.endD).toFixed(1)} {distUnit()} · score {Math.round(c.score)}
                        </span>
                      </div>
                      <p className="tabular mt-4 text-3xl font-semibold tracking-tight text-zinc-50">
                        {fmtPct(c.avgGrade)}
                        <span className="ml-2 text-sm font-normal text-zinc-500">avg</span>
                      </p>
                      <ClimbShape a={a} c={c} />
                      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                        <Mini label="Length" value={fmtKm(c.lengthM, 2)} />
                        <Mini label="Gain" value={fmtM(c.gainM)} />
                        <Mini label="Max" value={fmtPct(c.maxGrade)} />
                      </div>
                    </div>
                  </MagicCard>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <SteepList title="Steepest climbing" sections={a.steepUp} tone="rose" />
        <SteepList title="Steepest descending" sections={a.steepDown} tone="sky" />
      </div>
    </div>
  )
}

function ClimbShape({ a, c }: { a: Analysis; c: Climb }) {
  const pts = a.profile.filter((p) => p.d >= c.startD && p.d <= c.endD)
  if (pts.length < 2) return null
  const W = 240
  const H = 56
  const span = Math.max(c.endD - c.startD, 1)
  const lo = Math.min(...pts.map((p) => p.ele))
  const hi = Math.max(...pts.map((p) => p.ele))
  const X = (d: number) => ((d - c.startD) / span) * W
  const Y = (e: number) => H - 2 - ((e - lo) / Math.max(hi - lo, 1)) * (H - 4)
  const area = `M${X(pts[0].d)} ${H} ` + pts.map((p) => `L${X(p.d).toFixed(1)} ${Y(p.ele).toFixed(1)}`).join(' ') + ` L${X(pts[pts.length - 1].d)} ${H} Z`

  const counts = GRADE_BUCKETS.map((b) => ({ ...b, dist: 0 }))
  for (let k = 0; k < pts.length - 1; k++) {
    const b = counts.find((x) => pts[k].grade >= x.min && pts[k].grade < x.max)
    if (b) b.dist += pts[k + 1].d - pts[k].d
  }
  const total = counts.reduce((s, b) => s + b.dist, 0) || 1

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-14 w-full" preserveAspectRatio="none" aria-hidden>
        <path d={area} fill="#fb7185" fillOpacity={0.12} />
        {pts.slice(1).map((p, i) => (
          <line
            key={p.d}
            x1={X(pts[i].d)}
            y1={Y(pts[i].ele)}
            x2={X(p.d)}
            y2={Y(p.ele)}
            stroke={gradeColor(p.grade)}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
        {counts.map((b) => (
          <span key={b.label} title={`${b.label}: ${Math.round((b.dist / total) * 100)}%`} style={{ width: `${(b.dist / total) * 100}%`, background: b.color }} />
        ))}
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="tabular mt-0.5 font-medium text-zinc-200">{value}</p>
    </div>
  )
}

function SteepList({ title, sections, tone }: { title: string; sections: SteepSection[]; tone: 'rose' | 'sky' }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="mb-4 text-xs text-zinc-500">Best 100 m window</p>
      {sections.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing steeper than 3% here.</p>
      ) : (
        <ul className="space-y-3">
          {sections.map((s) => (
            <li key={s.startIdx} className="flex items-center justify-between gap-3 text-sm">
              <span className="tabular text-zinc-400">
                {distValue(s.startD).toFixed(2)} {distUnit()}
              </span>
              <span className={cn('tabular font-semibold', tone === 'rose' ? 'text-rose-300' : 'text-sky-300')}>
                {fmtPct(s.grade)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
