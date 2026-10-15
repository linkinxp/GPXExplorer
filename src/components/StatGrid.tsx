import type { ReactNode } from 'react'
import type { Analysis } from '../types'
import { NumberTicker } from './magic/number-ticker'
import { MagicCard } from './magic/magic-card'
import { distUnit, distValue, elevUnit, elevValue, fmtDuration, fmtGainRate, fmtM, fmtPct, fmtSpeed } from '../lib/format'
import { cn } from '../lib/utils'

interface Tile {
  label: string
  value: ReactNode
  sub?: string
  tone?: 'default' | 'emerald' | 'sky' | 'amber' | 'rose'
  spark?: { values: (number | null)[]; color: string }
}

const toneText = {
  default: 'text-zinc-50',
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
}

const numeric = (value: number, decimals: number, suffix: string) => (
  <>
    <NumberTicker value={value} decimalPlaces={decimals} />
    <span className="ml-1 text-base font-medium text-zinc-400">{suffix}</span>
  </>
)

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const known = values.filter((v): v is number => v !== null)
  if (known.length < 2) return null
  const step = Math.max(1, Math.floor(known.length / 160))
  const s = known.filter((_, i) => i % step === 0)
  const lo = Math.min(...s)
  const span = Math.max(Math.max(...s) - lo, 1e-9)
  const line = s
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (s.length - 1)) * 100).toFixed(2)} ${(23 - ((v - lo) / span) * 20).toFixed(2)}`)
    .join('')
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-3 block h-8 w-full" aria-hidden>
      <path d={`${line}L100 24L0 24Z`} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function StatGrid({ a }: { a: Analysis }) {
  const profile = a.profile
  const tiles: (Tile | false)[] = [
    {
      label: 'Distance',
      value: numeric(distValue(a.totalDistanceM), 2, distUnit()),
      tone: 'emerald',
      sub: `${a.pointCount.toLocaleString()} points`,
    },
    a.hasElevation && {
      label: 'Elevation gain',
      value: numeric(elevValue(a.elevGainM), 0, elevUnit()),
      tone: 'amber',
      sub: `${fmtM(a.elevLossM)} loss · ${fmtGainRate(a.gainPerKm)}`,
      spark: { values: profile.map((p) => p.ele), color: '#fbbf24' },
    },
    a.hasTime && {
      label: 'Moving time',
      value: fmtDuration(a.movingS),
      sub: `Elapsed ${fmtDuration(a.elapsedS)}`,
    },
    a.avgMovingSpeed !== null && {
      label: 'Avg moving speed',
      value: fmtSpeed(a.avgMovingSpeed),
      tone: 'sky',
      sub: a.maxSpeed !== null ? `Max ${fmtSpeed(a.maxSpeed)}` : undefined,
      spark: { values: profile.map((p) => p.speed), color: '#38bdf8' },
    },
    a.hasElevation && {
      label: 'Max elevation',
      value: fmtM(a.maxEle),
      sub: `Lowest ${fmtM(a.minEle)}`,
      spark: { values: profile.map((p) => p.ele), color: '#34d399' },
    },
    a.hasElevation && {
      label: 'Steepest climb',
      value: fmtPct(a.maxGrade),
      tone: 'rose',
      sub: `Steepest descent ${fmtPct(a.minGrade)}`,
      spark: { values: profile.map((p) => p.grade), color: '#fb7185' },
    },
    a.avgHr !== null && {
      label: 'Avg heart rate',
      value: numeric(Math.round(a.avgHr), 0, 'bpm'),
      tone: 'rose',
      sub: a.maxHr !== null ? `Max ${Math.round(a.maxHr)} bpm` : undefined,
      spark: { values: profile.map((p) => p.hr), color: '#fb7185' },
    },
    a.avgPower !== null && {
      label: 'Avg power',
      value: numeric(Math.round(a.avgPower), 0, 'W'),
      sub: a.maxPower !== null ? `Max ${Math.round(a.maxPower)} W` : undefined,
      spark: { values: profile.map((p) => p.power), color: '#a78bfa' },
    },
    a.avgCad !== null && {
      label: 'Avg cadence',
      value: numeric(Math.round(a.avgCad), 0, 'rpm'),
    },
    a.avgTemp !== null && {
      label: 'Avg temperature',
      value: numeric(a.avgTemp, 1, '°C'),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.filter((t): t is Tile => t !== false).map((t) => (
        <MagicCard
          key={t.label}
          gradientFrom="#34d399"
          gradientTo="#38bdf8"
          gradientColor="#18181b"
          gradientOpacity={0.9}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70"
        >
          <div className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t.label}</p>
            <p className={cn('tabular mt-2 text-2xl font-semibold tracking-tight md:text-3xl', toneText[t.tone ?? 'default'])}>
              {t.value}
            </p>
            {t.sub && <p className="mt-2 text-xs text-zinc-400">{t.sub}</p>}
            {t.spark && <Spark values={t.spark.values} color={t.spark.color} />}
          </div>
        </MagicCard>
      ))}
    </div>
  )
}
