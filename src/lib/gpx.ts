import type { GpxFile, Track, TrackPoint, Waypoint } from '../types'

const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const localName = (el: Element) => el.localName.split(':').pop()!

const text = (el: Element | null | undefined, name: string): string | null => {
  if (!el) return null
  const child = Array.from(el.children).find((c) => localName(c) === name)
  return child?.textContent?.trim() || null
}

const childrenNamed = (el: Element, name: string) => Array.from(el.children).filter((c) => localName(c) === name)

// Garmin/Strava/Wahoo write HR, cadence and temperature in vendor extension namespaces;
// match on the local name so any prefix works.
const extension = (el: Element, names: string[]): number | null => {
  const ext = childrenNamed(el, 'extensions')[0]
  if (!ext) return null
  const found = new Map<string, number>()
  const visit = (node: Element) => {
    const name = localName(node).toLowerCase()
    const v = num(node.textContent)
    if (names.includes(name) && v !== null && !found.has(name)) found.set(name, v)
    Array.from(node.children).forEach(visit)
  }
  visit(ext)
  for (const n of names) {
    const v = found.get(n)
    if (v !== undefined) return v
  }
  return null
}

function parsePoint(el: Element): TrackPoint | null {
  const lat = num(el.getAttribute('lat'))
  const lon = num(el.getAttribute('lon'))
  if (lat === null || lon === null) return null
  const t = text(el, 'time')
  const time = t ? new Date(t) : null
  return {
    lat,
    lon,
    ele: num(text(el, 'ele')),
    time: time && !Number.isNaN(time.getTime()) ? time : null,
    hr: extension(el, ['hr']),
    cad: extension(el, ['cad', 'cadence']),
    temp: extension(el, ['atemp', 'temp', 'wtemp']),
    power: extension(el, ['power']),
  }
}

export function parseGpx(xml: string, fileName: string): GpxFile {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) throw new Error('This file is not valid XML.')
  const root = doc.documentElement
  if (root.localName !== 'gpx') throw new Error('No <gpx> root element found.')

  const meta = childrenNamed(root, 'metadata')[0] ?? null
  const metaTime = text(meta, 'time') ?? text(root, 'time')

  const tracks: Track[] = childrenNamed(root, 'trk').map((trk, i) => {
    const points = childrenNamed(trk, 'trkseg').flatMap((seg) =>
      childrenNamed(seg, 'trkpt').map(parsePoint).filter((p): p is TrackPoint => p !== null),
    )
    return { name: text(trk, 'name') ?? `Track ${i + 1}`, points }
  })

  const routes: Track[] = childrenNamed(root, 'rte').map((rte, i) => ({
    name: text(rte, 'name') ?? `Route ${i + 1}`,
    points: childrenNamed(rte, 'rtept').map(parsePoint).filter((p): p is TrackPoint => p !== null),
  }))

  const waypoints: Waypoint[] = childrenNamed(root, 'wpt').flatMap((w) => {
    const lat = num(w.getAttribute('lat'))
    const lon = num(w.getAttribute('lon'))
    if (lat === null || lon === null) return []
    const t = text(w, 'time')
    const time = t ? new Date(t) : null
    return [
      {
        name: text(w, 'name') ?? 'Waypoint',
        lat,
        lon,
        ele: num(text(w, 'ele')),
        time: time && !Number.isNaN(time.getTime()) ? time : null,
        desc: text(w, 'desc'),
        sym: text(w, 'sym'),
      },
    ]
  })

  if (![...tracks, ...routes].some((t) => t.points.length >= 2))
    throw new Error('No track or route with at least two points was found.')

  const parsedMetaTime = metaTime ? new Date(metaTime) : null

  return {
    name: text(meta, 'name') ?? tracks[0]?.name ?? routes[0]?.name ?? fileName.replace(/\.gpx$/i, ''),
    creator: root.getAttribute('creator'),
    time: parsedMetaTime && !Number.isNaN(parsedMetaTime.getTime()) ? parsedMetaTime : null,
    tracks,
    routes,
    waypoints,
  }
}
