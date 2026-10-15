import type { GpxFile, TrackPoint } from '../types'
import { downloadText, gpxSummaryJson, pointsToCsv } from '../lib/export'
import { elevUnit, elevValue, fmtDateTime } from '../lib/format'
import { cardClass } from './Section'

const ROW_LIMIT = 500

interface PointsPanelProps {
  gpx: GpxFile
  points: TrackPoint[]
  slug: string
}

export function PointsPanel({ gpx, points, slug }: PointsPanelProps) {
  const shown = points.slice(0, ROW_LIMIT)
  const hasHr = points.some((p) => p.hr !== null)
  const hasCad = points.some((p) => p.cad !== null)
  const hasTemp = points.some((p) => p.temp !== null)
  const hasPower = points.some((p) => p.power !== null)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Tracks" value={gpx.tracks.length} />
        <Meta label="Routes" value={gpx.routes.length} />
        <Meta label="Waypoints" value={gpx.waypoints.length} />
        <Meta label="Creator" value={gpx.creator ?? 'Unknown'} small />
      </div>

      {gpx.waypoints.length > 0 && (
        <div className={cardClass}>
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">Waypoints</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gpx.waypoints.map((w, i) => (
              <li key={i} className="rounded-xl bg-zinc-950/60 p-4 ring-1 ring-white/5">
                <p className="font-medium text-zinc-100">{w.name}</p>
                {w.desc && <p className="mt-1 text-xs text-zinc-400">{w.desc}</p>}
                <p className="tabular mt-2 text-xs text-zinc-500">
                  {w.lat.toFixed(5)}, {w.lon.toFixed(5)}
                  {w.ele !== null && ` · ${Math.round(elevValue(w.ele))} ${elevUnit()}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Track points</h3>
            <p className="text-xs text-zinc-500">
              {gpx.time && <>File timestamp {fmtDateTime(gpx.time)} · </>}
              Showing {shown.length.toLocaleString()} of {points.length.toLocaleString()} points
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadText(`${slug}-points.csv`, pointsToCsv(points), 'text/csv')}
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => downloadText(`${slug}.json`, gpxSummaryJson(gpx), 'application/json')}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500"
            >
              Download JSON
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-auto rounded-xl ring-1 ring-white/5">
          <table className="tabular w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                {['#', 'Lat', 'Lon', 'Ele (m)', 'Time', ...(hasHr ? ['HR'] : []), ...(hasCad ? ['Cad'] : []), ...(hasTemp ? ['Temp °C'] : []), ...(hasPower ? ['Power (W)'] : [])].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
              {shown.map((p, i) => (
                <tr key={i} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-1.5">{p.lat.toFixed(6)}</td>
                  <td className="px-3 py-1.5">{p.lon.toFixed(6)}</td>
                  <td className="px-3 py-1.5">{p.ele?.toFixed(1) ?? '—'}</td>
                  <td className="px-3 py-1.5">{p.time ? p.time.toLocaleTimeString() : '—'}</td>
                  {hasHr && <td className="px-3 py-1.5">{p.hr ?? '—'}</td>}
                  {hasCad && <td className="px-3 py-1.5">{p.cad ?? '—'}</td>}
                  {hasTemp && <td className="px-3 py-1.5">{p.temp ?? '—'}</td>}
                  {hasPower && <td className="px-3 py-1.5">{p.power ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className={cardClass}>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={small ? 'mt-2 truncate text-sm text-zinc-200' : 'mt-2 text-2xl font-semibold text-zinc-50'}>{value}</p>
    </div>
  )
}
