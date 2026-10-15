// Synthetic loop with three climbs, a descent and HR/cadence/temp extensions, so the app can be tried without a file.
export function sampleGpx(): string {
  const N = 2400
  const lat0 = 46.8
  const lon0 = -71.25
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + 1)
  start.setUTCHours(12, 30, 0, 0)
  const speedMs = 25 / 3.6

  const pts: { lat: number; lon: number; ele: number; t: Date; hr: number; cad: number; temp: number }[] = []
  let dist = 0
  let prev: { lat: number; lon: number } | null = null
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const r = 0.085 * (1 + 0.22 * Math.sin(3 * t))
    const lat = lat0 + r * Math.sin(t)
    const lon = lon0 + (r * Math.cos(t)) / Math.cos((lat0 * Math.PI) / 180) * 1.35
    const ele = 150 + 12 * Math.sin(5 * t) + hill(t, 0.7, 1.0, 1.15, 1.5, 330) + hill(t, 2.9, 3.3, 3.4, 4.1, 260) + hill(t, 5.0, 5.3, 5.8, 6.1, 140)
    if (prev) dist += haversineApprox(prev.lat, prev.lon, lat, lon)
    const time = new Date(start.getTime() + (dist / speedMs) * 1000)
    const grade = Math.max(0, ele - 160) / 200
    pts.push({
      lat,
      lon,
      ele,
      t: time,
      hr: Math.round(118 + grade * 40 + 6 * Math.sin(i / 40)),
      cad: Math.round(84 + 6 * Math.sin(i / 25)),
      temp: Math.round(11 - (i / N) * 2),
    })
    prev = { lat, lon }
  }

  const trkpts = pts
    .map(
      (p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.ele.toFixed(1)}</ele>
        <time>${p.t.toISOString()}</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:atemp>${p.temp}</gpxtpx:atemp>
            <gpxtpx:hr>${p.hr}</gpxtpx:hr>
            <gpxtpx:cad>${p.cad}</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX Explorer sample" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>Sample loop with climbs</name>
    <time>${start.toISOString()}</time>
  </metadata>
  <wpt lat="${(lat0 + 0.085).toFixed(6)}" lon="${lon0.toFixed(6)}">
    <ele>160</ele>
    <name>Feed zone</name>
    <desc>Water refill, bakery on the left</desc>
  </wpt>
  <trk>
    <name>Sample loop</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`
}

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

// Rise from a to b, hold to c, fall to d.
function hill(t: number, a: number, b: number, c: number, d: number, h: number) {
  return h * smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)))
}

function haversineApprox(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dy = (lat2 - lat1) * 111_320
  const dx = (lon2 - lon1) * 111_320 * Math.cos((lat1 * Math.PI) / 180)
  return Math.hypot(dx, dy)
}
