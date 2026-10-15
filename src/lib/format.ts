export type UnitSystem = 'metric' | 'imperial'

let units: UnitSystem = 'metric'
export const setUnitSystem = (u: UnitSystem) => {
  units = u
}
export const getUnitSystem = (): UnitSystem => units

const M_PER_FT = 0.3048
const M_PER_MI = 1609.344
const imperial = () => units === 'imperial'

export const distUnit = () => (imperial() ? 'mi' : 'km')
export const elevUnit = () => (imperial() ? 'ft' : 'm')
export const speedUnit = () => (imperial() ? 'mph' : 'km/h')
export const distUnitM = () => (imperial() ? M_PER_MI : 1000)
export const distValue = (m: number) => m / distUnitM()
export const elevValue = (m: number) => (imperial() ? m / M_PER_FT : m)
export const speedValue = (kmh: number) => (imperial() ? kmh / 1.609344 : kmh)
export const kmhFromSpeed = (v: number) => (imperial() ? v * 1.609344 : v)

export const fmtKm = (m: number, digits = 2) => `${distValue(m).toFixed(digits)} ${distUnit()}`

export const fmtM = (m: number | null) =>
  m === null ? '—' : `${Math.round(elevValue(m)).toLocaleString()} ${elevUnit()}`

export const fmtPct = (g: number | null, digits = 1) =>
  g === null ? '—' : `${g > 0 ? '+' : ''}${g.toFixed(digits)}%`

export const fmtSpeed = (ms: number | null) =>
  ms === null ? '—' : `${speedValue(ms * 3.6).toFixed(1)} ${speedUnit()}`

export const fmtGainRate = (gainPerKm: number) =>
  imperial() ? `${(gainPerKm * (M_PER_MI / M_PER_FT / 1000)).toFixed(1)} ft/mi` : `${gainPerKm.toFixed(1)} m/km`

export function fmtDuration(totalS: number | null): string {
  if (totalS === null || !Number.isFinite(totalS)) return '—'
  const s = Math.round(totalS)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export const fmtDateTime = (d: Date | null) =>
  d
    ? d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

export const fmtTime = (d: Date | null) =>
  d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'

export const fmtNum = (n: number | null, digits = 0, unit = '') =>
  n === null ? '—' : `${n.toFixed(digits)}${unit}`

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
