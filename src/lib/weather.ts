import type { Analysis, ProfilePoint } from '../types'
import { bearing } from './geo'

export interface WeatherPoint {
  label: string
  lat: number
  lon: number
  distanceM: number
  time: Date
  bearingDeg: number
  temp: number | null
  feelsLike: number | null
  precipMm: number | null
  cloudPct: number | null
  windKmh: number | null
  gustKmh: number | null
  windFromDeg: number | null
  headwindKmh: number | null
  code: number | null
  sunrise: Date | null
  sunset: Date | null
  /** IANA time zone of the point, e.g. America/Toronto */
  tz: string
}

export interface WeatherResult {
  source: 'forecast' | 'archive'
  points: WeatherPoint[]
}

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'cloud_cover',
  'weather_code',
].join(',')

const DAY_MS = 86_400_000
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const LABELS = ['Start', '25%', 'Middle', '75%', 'Finish']

export const WMO: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, hail',
  99: 'Thunderstorm, hail',
}

interface OmHourly {
  time: string[]
  [k: string]: (number | null)[] | string[]
}

interface OmResponse {
  error?: boolean
  reason?: string
  hourly: OmHourly
  daily?: { time: string[]; sunrise?: string[]; sunset?: string[] }
  timezone?: string
  utc_offset_seconds?: number
}

// Open-Meteo returns times as local wall-clock strings for the point's time zone; offsetS converts them to instants.
const localIso = (t: string, offsetS: number) => new Date(Date.parse(`${t}Z`) - offsetS * 1000)
const dayKey = (d: Date, offsetS = 0) => new Date(d.getTime() + offsetS * 1000).toISOString().slice(0, 10)

function nearestProfileIndex(profile: ProfilePoint[], d: number): number {
  let lo = 0
  let hi = profile.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (profile[mid].d < d) lo = mid + 1
    else hi = mid
  }
  return lo
}

function routeBearing(profile: ProfilePoint[], idx: number): number {
  const a = profile[Math.max(0, idx - 5)]
  const b = profile[Math.min(profile.length - 1, idx + 5)]
  return bearing(a.lat, a.lon, b.lat, b.lon)
}

function nearestHour(times: string[], target: Date, offsetS: number): number {
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(localIso(times[i], offsetS).getTime() - target.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

export function buildRideTimes(startTime: Date, speedKmh: number) {
  const speedMs = speedKmh / 3.6
  return (distanceM: number) => new Date(startTime.getTime() + (distanceM / speedMs) * 1000)
}

export async function fetchRouteWeather(
  analysis: Analysis,
  profile: ProfilePoint[],
  startTime: Date,
  speedKmh: number,
  signal?: AbortSignal,
): Promise<WeatherResult> {
  const total = analysis.totalDistanceM
  const timeAt = buildRideTimes(startTime, speedKmh)
  const finish = timeAt(total)
  const now = Date.now()

  if (startTime.getTime() > now + 15 * DAY_MS)
    throw new Error('Weather forecasts only reach about 16 days ahead. Pick an earlier ride date.')

  const useArchive = finish.getTime() < now - 3 * DAY_MS
  const base = useArchive
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast'

  const samples = FRACTIONS.map((f, i) => {
    const distanceM = f * total
    const idx = nearestProfileIndex(profile, distanceM)
    const p = profile[idx]
    return {
      label: LABELS[i],
      lat: p.lat,
      lon: p.lon,
      distanceM,
      time: timeAt(distanceM),
      bearingDeg: routeBearing(profile, idx),
    }
  })

  const params = new URLSearchParams({
    latitude: samples.map((s) => s.lat.toFixed(4)).join(','),
    longitude: samples.map((s) => s.lon.toFixed(4)).join(','),
    hourly: HOURLY,
    daily: 'sunrise,sunset',
    timezone: 'auto',
    // pad by a day each side: the date range is in each point's local time zone
    start_date: dayKey(new Date(startTime.getTime() - DAY_MS)),
    end_date: dayKey(new Date(Math.min(finish.getTime() + DAY_MS, now + (useArchive ? -2 : 15) * DAY_MS))),
  })

  const res = await fetch(`${base}?${params}`, { signal })
  const json = (await res.json()) as OmResponse | OmResponse[]
  const results = Array.isArray(json) ? json : [json]
  const failed = results.find((r) => r.error)
  if (!res.ok || failed) throw new Error(failed?.reason ?? `Weather service returned ${res.status}.`)

  const points: WeatherPoint[] = samples.map((s, i) => {
    const r = results[i]
    const h = r.hourly
    const off = r.utc_offset_seconds ?? 0
    const at = (key: string) => (h[key] as (number | null)[])[nearestHour(h.time, s.time, off)] ?? null
    const day = dayKey(s.time, off)
    const dIdx = r.daily?.time.indexOf(day) ?? -1
    const sunriseRaw = dIdx >= 0 ? r.daily?.sunrise?.[dIdx] : undefined
    const sunsetRaw = dIdx >= 0 ? r.daily?.sunset?.[dIdx] : undefined
    const windKmh = at('wind_speed_10m')
    const windFromDeg = at('wind_direction_10m')
    const headwind =
      windKmh !== null && windFromDeg !== null
        ? windKmh * Math.cos(((windFromDeg - s.bearingDeg) * Math.PI) / 180)
        : null
    return {
      label: s.label,
      lat: s.lat,
      lon: s.lon,
      distanceM: s.distanceM,
      time: s.time,
      bearingDeg: s.bearingDeg,
      temp: at('temperature_2m'),
      feelsLike: at('apparent_temperature'),
      precipMm: at('precipitation'),
      cloudPct: at('cloud_cover'),
      windKmh,
      gustKmh: at('wind_gusts_10m'),
      windFromDeg,
      headwindKmh: headwind,
      code: at('weather_code'),
      sunrise: sunriseRaw ? localIso(sunriseRaw, off) : null,
      sunset: sunsetRaw ? localIso(sunsetRaw, off) : null,
      tz: r.timezone ?? 'UTC',
    }
  })

  return { source: useArchive ? 'archive' : 'forecast', points }
}
