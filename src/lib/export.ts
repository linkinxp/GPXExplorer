import type { GpxFile, TrackPoint } from '../types'
import { haversine } from './geo'

export function pointsToCsv(points: TrackPoint[]): string {
  const header = 'index,lat,lon,ele_m,time_utc,distance_m,hr_bpm,cadence_rpm,temp_c,power_w'
  let dist = 0
  const rows = points.map((p, i) => {
    if (i > 0) dist += haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
    return [
      i,
      p.lat.toFixed(6),
      p.lon.toFixed(6),
      p.ele ?? '',
      p.time?.toISOString() ?? '',
      dist.toFixed(1),
      p.hr ?? '',
      p.cad ?? '',
      p.temp ?? '',
      p.power ?? '',
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

export function gpxSummaryJson(gpx: GpxFile): string {
  return JSON.stringify(gpx, null, 2)
}

export function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
