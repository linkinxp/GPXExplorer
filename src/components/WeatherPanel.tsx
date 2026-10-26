import { useEffect, useState, type FormEvent } from 'react'
import type { Analysis } from '../types'
import { fetchRouteWeather, WMO, type WeatherResult, type WeatherPoint } from '../lib/weather'
import { fmtKm, fmtNum, fmtTimeIn, kmhFromSpeed, tzLabel, speedUnit, speedValue, toLocalInputValue } from '../lib/format'
import { RideConditions } from './RideConditions'
import { ShimmerButton } from './magic/shimmer-button'
import { BorderBeam } from './magic/border-beam'
import { DaylightBar } from './DaylightBar'
import { WindRose } from './WindRose'
import { cn } from '../lib/utils'

interface Request {
  start: Date
  speedKmh: number
}

interface WeatherPanelProps {
  a: Analysis
}

function defaultRequest(a: Analysis): Request {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  const speed = a.avgMovingSpeed ? a.avgMovingSpeed * 3.6 : 25
  return { start: a.startTime ?? tomorrow, speedKmh: Math.round(speed * 10) / 10 }
}

type State = { status: 'loading' } | { status: 'ok'; data: WeatherResult } | { status: 'error'; message: string }

export function WeatherPanel({ a }: WeatherPanelProps) {
  const [req, setReq] = useState<Request>(() => defaultRequest(a))
  const unit = speedUnit()
  const formSpeed = (kmh: number) => String(Math.round(speedValue(kmh) * 10) / 10)
  const [form, setForm] = useState({ start: toLocalInputValue(req.start), speed: formSpeed(req.speedKmh) })
  useEffect(() => {
    setForm((f) => ({ ...f, speed: formSpeed(req.speedKmh) }))
  }, [unit, req.speedKmh])
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    fetchRouteWeather(a, a.profile, req.start, req.speedKmh, ctrl.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Weather request failed.' })
      })
    return () => ctrl.abort()
  }, [a, req])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const start = new Date(form.start)
    const speedKmh = kmhFromSpeed(Number(form.speed))
    if (Number.isNaN(start.getTime()) || !(speedKmh > 0 && speedKmh < 80)) {
      setState({
        status: 'error',
        message: `Enter a valid start time and an average speed below ${Math.round(speedValue(80))} ${unit}.`,
      })
      return
    }
    setReq({ start, speedKmh })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
        <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
          Ride start
          <input
            type="datetime-local"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
          Avg moving speed ({unit})
          <input
            type="number"
            min={1}
            max={80}
            step={0.5}
            value={form.speed}
            onChange={(e) => setForm({ ...form, speed: e.target.value })}
            className="w-36 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
          />
        </label>
        <ShimmerButton type="submit" className="h-10 text-sm">
          Update weather
        </ShimmerButton>
        <p className="max-w-sm text-xs text-zinc-500">
          Times along the route are estimated from start time and speed. Forecasts reach about 16 days ahead; rides more than 3 days ago use historical data.
        </p>
      </form>

      {state.status === 'loading' && <Skeleton />}
      {state.status === 'error' && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{state.message}</div>
      )}
      {state.status === 'ok' && <WeatherGrid data={state.data} />}
    </div>
  )
}

function WeatherGrid({ data }: { data: WeatherResult }) {
  const finish = data.points[data.points.length - 1]
  const lateSunset = finish.sunset && finish.time > finish.sunset

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        <span className="rounded-full bg-zinc-800 px-3 py-1">
          {data.source === 'forecast' ? 'Forecast' : 'Historical'} · Open-Meteo
        </span>
        {lateSunset && finish.sunset && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-300 ring-1 ring-amber-400/30">
            Finish is after sunset ({fmtTimeIn(finish.sunset, finish.tz)} {tzLabel(finish.sunset, finish.tz)})
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {data.points.map((p) => (
          <WeatherCard key={p.label} p={p} />
        ))}
      </div>
      <RideConditions points={data.points} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DaylightBar
          sunrise={data.points[0].sunrise}
          sunset={data.points[0].sunset}
          start={data.points[0].time}
          finish={finish.time}
        />
        <WindRose points={data.points} />
      </div>
    </div>
  )
}

function WeatherCard({ p }: { p: WeatherPoint }) {
  const head = p.headwindKmh
  const headLabel =
    head === null
      ? '—'
      : Math.abs(head) < 3
        ? 'Crosswind'
        : head > 0
          ? `Headwind ${speedValue(head).toFixed(0)} ${speedUnit()}`
          : `Tailwind ${speedValue(Math.abs(head)).toFixed(0)} ${speedUnit()}`
  const headTone = head === null || Math.abs(head) < 3 ? 'text-zinc-400' : head > 0 ? 'text-rose-300' : 'text-emerald-300'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-5">
      <BorderBeam size={120} duration={10} colorFrom="#34d399" colorTo="#38bdf8" borderWidth={1.5} />
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{p.label}</p>
        <p className="tabular text-xs text-zinc-500">{fmtKm(p.distanceM, 1)}</p>
      </div>
      <p className="tabular mt-1 text-xs text-zinc-400">{fmtTimeIn(p.time, p.tz)}</p>

      <div className="mt-4 flex items-end gap-3">
        <span className="tabular text-4xl font-semibold tracking-tight text-zinc-50">
          {fmtNum(p.temp === null ? null : Math.round(p.temp))}
          <span className="text-xl text-zinc-400">°</span>
        </span>
        <span className="pb-1.5 text-xs text-zinc-400">feels {fmtNum(p.feelsLike === null ? null : Math.round(p.feelsLike), 0, '°')}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-300">{p.code === null ? '—' : WMO[p.code] ?? `Code ${p.code}`}</p>

      <div className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-950/60 p-3">
        <WindArrow fromDeg={p.windFromDeg} />
        <div className="min-w-0">
          <p className="tabular text-sm font-medium text-zinc-100">
            {fmtNum(p.windKmh === null ? null : Math.round(speedValue(p.windKmh)), 0, ` ${speedUnit()}`)}
            <span className="text-zinc-500"> gust {fmtNum(p.gustKmh === null ? null : Math.round(p.gustKmh), 0)}</span>
          </p>
          <p className={cn('truncate text-xs', headTone)}>{headLabel}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Row label="Rain" value={p.precipMm === null ? '—' : `${p.precipMm.toFixed(1)} mm`} />
        <Row label="Cloud" value={fmtNum(p.cloudPct, 0, '%')} />
        <Row label="Sunrise" value={fmtTimeIn(p.sunrise, p.tz)} />
        <Row label="Sunset" value={fmtTimeIn(p.sunset, p.tz)} />
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="tabular text-zinc-200">{value}</dd>
    </div>
  )
}

function WindArrow({ fromDeg }: { fromDeg: number | null }) {
  const toDeg = fromDeg === null ? 0 : (fromDeg + 180) % 360
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-white/10">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-sky-300"
        style={{ transform: `rotate(${toDeg}deg)` }}
        fill="currentColor"
        aria-label={fromDeg === null ? 'Wind direction unknown' : `Wind blowing towards ${Math.round(toDeg)}°`}
      >
        <path d="M12 2 19 21 12 17 5 21Z" />
      </svg>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/60" />
      ))}
    </div>
  )
}
