import { fmtDuration, fmtTime } from '../lib/format'
import { cardClass } from './Section'

const DAY_MIN = 24 * 60

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
const pct = (m: number) => `${Math.min(100, Math.max(0, (m / DAY_MIN) * 100))}%`

export function DaylightBar({
  sunrise,
  sunset,
  start,
  finish,
}: {
  sunrise: Date | null
  sunset: Date | null
  start: Date
  finish: Date
}) {
  if (!sunrise || !sunset) return null
  const rise = minuteOfDay(sunrise)
  const set = minuteOfDay(sunset)
  const rideStart = minuteOfDay(start)
  const rideEnd = minuteOfDay(finish)
  const daylight = Math.max(0, set - rise)
  const crossesNight = finish.getDate() !== start.getDate() || rideStart < rise || rideEnd > set

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Daylight and your ride</p>
        <p className="text-xs text-zinc-400">
          Sunrise <span className="tabular text-zinc-200">{fmtTime(sunrise)}</span> · Sunset{' '}
          <span className="tabular text-zinc-200">{fmtTime(sunset)}</span> · {fmtDuration(daylight * 60)} of light
        </p>
      </div>

      <div className="relative mt-6 h-12 overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/5">
        <div
          className="absolute inset-y-0 bg-gradient-to-r from-sky-400/25 via-amber-300/35 to-sky-400/25"
          style={{ left: pct(rise), width: pct(daylight) }}
        />
        <div
          className="absolute inset-y-0 rounded-md bg-emerald-400/50 ring-1 ring-emerald-300/70"
          style={{ left: pct(rideStart), width: pct(Math.max(rideEnd - rideStart, 2)) }}
        />
      </div>

      <div className="relative mt-2 h-4 text-[10px] tabular text-zinc-500">
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : undefined }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-zinc-400">
          Ride <span className="tabular text-zinc-100">{fmtTime(start)} → {fmtTime(finish)}</span>
        </span>
        <span className={crossesNight ? 'text-amber-300' : 'text-emerald-300'}>
          {crossesNight ? 'Part of the ride is in the dark' : 'Entirely in daylight'}
        </span>
      </div>
    </div>
  )
}
