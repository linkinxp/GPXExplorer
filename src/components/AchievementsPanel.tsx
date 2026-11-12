import type { Achievements, AchievementEffort, AchievementRecord } from '../types'
import { fmtDuration, fmtKm, fmtM, fmtPct } from '../lib/format'
import { cardClass } from './Section'

interface AchievementsPanelProps {
  data: Achievements
  onHover: (d: number | null) => void
  // Maps a clock time (epoch ms) to a distance along the route.
  locate?: (ms: number) => number | null
}

interface Badge {
  label: string
  tone: string
  weight: number
}

const GOLD = 'bg-amber-400/15 text-amber-300 ring-amber-300/40'
const SILVER = 'bg-zinc-300/10 text-zinc-200 ring-zinc-300/30'
const BRONZE = 'bg-orange-500/15 text-orange-300 ring-orange-400/40'
const PLAIN = 'bg-sky-500/10 text-sky-300 ring-sky-400/30'

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`

function badgesFor(e: AchievementEffort): Badge[] {
  const out: Badge[] = []
  if (e.komRank === 1) out.push({ label: 'KOM / QOM', tone: GOLD, weight: 100 })
  else if (e.komRank !== null && e.komRank <= 10) out.push({ label: `Top 10 overall (#${e.komRank})`, tone: SILVER, weight: 60 })
  if (e.prRank === 1) out.push({ label: 'PR', tone: GOLD, weight: 80 })
  else if (e.prRank === 2) out.push({ label: '2nd best time', tone: SILVER, weight: 40 })
  else if (e.prRank === 3) out.push({ label: '3rd best time', tone: BRONZE, weight: 30 })
  for (const a of e.achievements) {
    if (a.type === 'year_overall' && a.rank) out.push({ label: `${ordinal(a.rank)} this year`, tone: PLAIN, weight: 20 })
    else if (a.type === 'overall' && a.rank && e.komRank === null) out.push({ label: `${ordinal(a.rank)} all time`, tone: PLAIN, weight: 50 })
  }
  return out
}

function recordValue(r: AchievementRecord): string {
  switch (r.kind) {
    case 'time': return fmtDuration(r.value)
    case 'distance': return fmtKm(r.value, 1)
    case 'ascent': return fmtM(r.value)
    case 'power': return `${Math.round(r.value)} W`
  }
}

export function AchievementsPanel({ data, onHover, locate }: AchievementsPanelProps) {
  const rows = data.efforts
    .map((e) => ({ e, badges: badgesFor(e) }))
    .filter((r) => r.badges.length > 0)
    .sort((a, b) => Math.max(...b.badges.map((x) => x.weight)) - Math.max(...a.badges.map((x) => x.weight)))
  const koms = data.efforts.filter((e) => e.komRank === 1).length
  const records = data.records ?? []
  const isStrava = data.source === 'strava'
  const source = data.source === 'strava' ? 'Strava' : 'Garmin'

  return (
    <div className={cardClass}>
      <div className={`grid gap-3 text-center ${isStrava ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Stat value={data.count} label="Achievements" />
        <Stat value={data.prCount} label="Personal records" />
        {isStrava && <Stat value={koms} label="KOM / QOM" />}
      </div>
      {records.length > 0 && (
        <ul className="mt-5 divide-y divide-zinc-800/80">
          {records.map((r) => {
            const at = r.startMs !== null && locate ? locate(r.startMs) : null
            return (
              <li
                key={r.label}
                className="py-3"
                onMouseEnter={() => at !== null && onHover(at)}
                onMouseLeave={() => onHover(null)}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-sm font-medium text-zinc-100">{r.label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${GOLD}`}>Personal record</span>
                </div>
                <p className="tabular mt-1 text-xs text-zinc-400">{recordValue(r)}</p>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length === 0 && records.length > 0 ? null : rows.length === 0 ? (
        <p className="mt-5 text-sm text-zinc-400">{source} recorded no segment achievements for this ride.</p>
      ) : (
        <ul className="mt-5 divide-y divide-zinc-800/80">
          {rows.map(({ e, badges }, i) => (
            <li
              key={`${e.name}-${i}`}
              className="py-3"
              onMouseEnter={() => e.startM !== null && onHover(e.startM)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-sm font-medium text-zinc-100">{e.name}</span>
                {badges.map((b) => (
                  <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${b.tone}`}>
                    {b.label}
                  </span>
                ))}
              </div>
              <p className="tabular mt-1 text-xs text-zinc-400">
                {e.timeS !== null ? `${fmtDuration(e.timeS)} · ` : ''}
                {fmtKm(e.distM, 2)}
                {e.grade !== null ? ` · ${fmtPct(e.grade)}` : ''}
                {e.startM !== null ? ` · at ${fmtKm(e.startM, 1)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-zinc-500">Achievements are as reported by {source} when the ride was imported.</p>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/40 px-2 py-3">
      <div className="tabular text-2xl font-semibold text-amber-300">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
    </div>
  )
}
