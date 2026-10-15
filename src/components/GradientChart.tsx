import type { GradeBucket } from '../types'
import { fmtKm } from '../lib/format'
import { MagicCard } from './magic/magic-card'

export function GradientChart({ buckets }: { buckets: GradeBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.distanceM, 0) || 1
  const maxPct = Math.max(...buckets.map((b) => b.distanceM / total)) || 1

  return (
    <MagicCard
      gradientFrom="#38bdf8"
      gradientTo="#34d399"
      gradientColor="#18181b"
      gradientOpacity={0.9}
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70"
    >
      <div className="p-6">
        <p className="mb-5 text-sm text-zinc-400">Distance spent on each gradient band</p>
        <ul className="space-y-3">
          {buckets.map((b) => {
            const pct = b.distanceM / total
            return (
              <li key={b.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-4 text-sm">
                <span className="text-zinc-300">{b.label}</span>
                <div className="h-3 overflow-hidden rounded-full bg-zinc-800/80">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${(pct / maxPct) * 100}%`,
                      background: `linear-gradient(90deg, ${b.color}, ${b.color}aa)`,
                      boxShadow: `0 0 12px ${b.color}66`,
                    }}
                  />
                </div>
                <span className="tabular w-28 text-right text-zinc-400">
                  {fmtKm(b.distanceM, 2)} <span className="text-zinc-600">· {(pct * 100).toFixed(0)}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </MagicCard>
  )
}
