import { useEffect, useState } from 'react'
import { fmtDateTime, fmtDuration, fmtKm, fmtM, fmtSpeed } from '../lib/format'
import { RANGES, api, type Activity, type Range } from './GarminImport'

type Step = 'checking' | 'unconfigured' | 'signed-out' | 'signed-in'

export function StravaImport({ onLoad, onClose }: { onLoad: (name: string, text: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('30')
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api<{ configured: boolean; logged_in: boolean }>('/api/strava/status')
      .then((s) => setStep(s.configured ? (s.logged_in ? 'signed-in' : 'signed-out') : 'unconfigured'))
      .catch(() => setStep('signed-out'))
  }, [])

  useEffect(() => {
    if (step !== 'signed-in') return
    let cancelled = false
    setActivities(null)
    setError(null)
    api<{ activities: Activity[] }>(`/api/strava/activities?range=${range}`)
      .then((r) => !cancelled && setActivities(r.activities))
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setActivities([])
        if (e.message.includes('Not connected')) setStep('signed-out')
      })
    return () => {
      cancelled = true
    }
  }, [step, range])

  const open = (a: Activity) => {
    setLoadingId(a.id)
    setError(null)
    fetch(`/api/strava/activities/${a.id}/gpx`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Download failed (${res.status})`)
        }
        return res.text()
      })
      .then((text) => {
        onLoad(`${a.name}.gpx`, text)
        onClose()
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoadingId(null)
      })
  }

  const disconnect = async () => {
    setBusy(true)
    await fetch('/api/strava/logout', { method: 'POST' })
    setBusy(false)
    setActivities(null)
    setStep('signed-out')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="strava-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="strava-title" className="text-base font-semibold text-zinc-100">
              Import from Strava
            </h2>
            <p className="text-xs text-zinc-500">
              {step === 'signed-in'
                ? 'Connected to your Strava account'
                : step === 'signed-out'
                  ? 'Approve access on Strava’s site.'
                  : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step === 'signed-in' && (
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="rounded-full px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/10 hover:text-zinc-200 disabled:opacity-50"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 'checking' && <p className="text-sm text-zinc-500">Checking connection…</p>}
          {step === 'unconfigured' && <p className="text-sm text-zinc-400">Strava import is not set up on this server yet.</p>}
          {step === 'signed-out' && (
            <div className="mx-auto max-w-sm space-y-4 text-center">
              <p className="text-sm text-zinc-300">
                You’ll be sent to Strava to approve read-only access to your rides. We never see your Strava password.
              </p>
              <a
                href="/api/strava/login"
                className="inline-block rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
              >
                Connect Strava
              </a>
            </div>
          )}
          {step === 'signed-in' && (
            <div className="space-y-4">
              <div className="flex gap-1 text-xs">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRange(r.value)}
                    className={`rounded-full px-3 py-1 ring-1 ring-white/10 transition ${range === r.value ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {activities === null && <p className="text-sm text-zinc-500">Loading rides…</p>}
              {activities !== null && activities.length === 0 && !error && (
                <p className="text-sm text-zinc-500">No cycling workouts in this range.</p>
              )}
              <ul className="divide-y divide-zinc-800/80">
                {(activities ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{a.name}</p>
                      <p className="tabular text-xs text-zinc-500">
                        {a.start ? fmtDateTime(new Date(a.start)) : '—'} · {fmtKm(a.distance, 1)} · {fmtDuration(a.duration)}
                        {a.elevationGain !== null ? ` · ↗ ${fmtM(a.elevationGain)}` : ''}
                        {a.avgSpeed !== null ? ` · ${fmtSpeed(a.avgSpeed)}` : ''}
                        {a.avgHr !== null ? ` · ${Math.round(a.avgHr)} bpm` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => open(a)}
                      disabled={!a.gps || loadingId !== null}
                      className="shrink-0 rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                      {a.gps ? (loadingId === a.id ? 'Loading…' : 'Open') : 'No GPS'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
          )}
        </div>

        <footer className="border-t border-zinc-800 px-6 py-3 text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-400">Note:</span> Strava access is read-only. The server keeps your Strava access token, refreshed as
          needed, and your browser holds only a secure cookie that points to it. Disconnect deletes that token.
        </footer>
      </div>
    </div>
  )
}
