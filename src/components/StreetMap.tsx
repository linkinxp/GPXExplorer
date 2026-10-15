import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Analysis } from '../types'
import { gradeColor } from '../lib/analysis'
import { CLIMB_COLOR } from './RouteMap'

interface StreetMapProps {
  a: Analysis
  hoverD: number | null
  onHover: (d: number | null) => void
}

const STRIDE_TARGET = 2500

export function StreetMap({ a, hoverD, onHover }: StreetMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const onHoverRef = useRef(onHover)
  const prof = a.profile

  useEffect(() => {
    onHoverRef.current = onHover
  }, [onHover])

  useEffect(() => {
    if (!el.current) return
    const { minLat, maxLat, minLon, maxLon } = a.bounds
    const m = L.map(el.current, { attributionControl: true, zoomControl: true, scrollWheelZoom: false })
    map.current = m
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m)

    const stride = Math.max(1, Math.floor(prof.length / STRIDE_TARGET))
    const runs: { color: string; pts: L.LatLngTuple[] }[] = []
    const samples: { lat: number; lon: number; d: number }[] = []
    for (let i = 0; i < prof.length; i += stride) {
      const color = gradeColor(prof[i].grade)
      const pt: L.LatLngTuple = [prof[i].lat, prof[i].lon]
      samples.push({ lat: pt[0], lon: pt[1], d: prof[i].d })
      const last = runs[runs.length - 1]
      if (last && last.color === color) last.pts.push(pt)
      else runs.push({ color, pts: last ? [last.pts[last.pts.length - 1], pt] : [pt] })
    }
    for (const r of runs) {
      if (r.pts.length > 1) L.polyline(r.pts, { color: r.color, weight: 4, opacity: 0.9, lineCap: 'round' }).addTo(m)
    }

    for (const c of a.climbs) {
      const pts: L.LatLngTuple[] = []
      for (let i = 0; i < prof.length; i += stride) {
        if (prof[i].d >= c.startD && prof[i].d <= c.endD) pts.push([prof[i].lat, prof[i].lon])
      }
      if (pts.length < 2) continue
      const color = CLIMB_COLOR[c.category]
      L.polyline(pts, { color, weight: 11, opacity: 0.2, lineCap: 'round' }).addTo(m)
      L.polyline(pts, { color, weight: 4, opacity: 1, lineCap: 'round' }).addTo(m)
      const first = pts[0]
      L.marker(first, {
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          html: `<span class="street-badge" style="background:${color}">${c.category}</span>`,
        }),
      }).addTo(m)
    }

    L.circleMarker([a.start.lat, a.start.lon], { radius: 6, color: '#09090b', weight: 2, fillColor: '#34d399', fillOpacity: 1 }).addTo(m)
    L.circleMarker([a.end.lat, a.end.lon], { radius: 6, color: '#09090b', weight: 2, fillColor: '#f43f5e', fillOpacity: 1 }).addTo(m)

    m.fitBounds(
      [
        [minLat, minLon],
        [maxLat, maxLon],
      ],
      { padding: [28, 28] },
    )

    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      let best = samples[0]
      let bestDist = Infinity
      for (const s of samples) {
        const dLat = s.lat - e.latlng.lat
        const dLon = s.lon - e.latlng.lng
        const dist = dLat * dLat + dLon * dLon
        if (dist < bestDist) {
          bestDist = dist
          best = s
        }
      }
      if (best) onHoverRef.current(best.d)
    })
    m.on('mouseout', () => onHoverRef.current(null))

    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
  }, [a, prof])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (hoverD === null || prof.length === 0) {
      marker.current?.remove()
      marker.current = null
      return
    }
    let lo = 0
    let hi = prof.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (prof[mid].d < hoverD) lo = mid + 1
      else hi = mid
    }
    const ll: L.LatLngExpression = [prof[lo].lat, prof[lo].lon]
    if (!marker.current) {
      marker.current = L.circleMarker(ll, { radius: 6, color: '#09090b', weight: 2, fillColor: '#fafafa', fillOpacity: 1, interactive: false }).addTo(m)
    } else {
      marker.current.setLatLng(ll)
    }
  }, [hoverD, prof])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
      <div ref={el} className="street-map h-[420px] w-full sm:h-[480px]" role="img" aria-label="Street map of the route" />
    </div>
  )
}
