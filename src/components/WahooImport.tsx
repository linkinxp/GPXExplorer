import { useEffect, useState } from 'react'
import { fmtDateTime, fmtDuration, fmtKm, fmtM, fmtSpeed } from '../lib/format'

interface Workout {
  id: number
  name: string
  start: string | null
  distance: number
  duration: number
  elevationGain: number | null
  avgSpeed: number | null
  avgHr: number | null
  gps: boolean
}

type Step = 'checking' | 'signed-out' | 'signed-in' | 'unconfigured'
type Range = '7' | '30' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '7', label: 'Last 7' },
  { value: '30', label: 'Last 30' },
  { value: 'all', label: 'All' },
]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export function WahooImport({ onLoad, onClose }: { onLoad: (name: string, text: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('30')
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api<{ configured: boolean; logged_in: boolean }>('/api/wahoo/status')
      .then((s) => setStep(!s.configured ? 'unconfigured' : s.logged_in ? 'signed-in' : 'signed-out'))
      .catch(() => setStep('signed-out'))
  }, [])

  useEffect(() => {
    if (step !== 'signed-in') return
    let cancelled = false
    setWorkouts(null)
    setError(null)
    api<{ activities: Workout[] }>(`/api/wahoo/workouts?range=${range}`)
      .then((r) => !cancelled && setWorkouts(r.activities))
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setWorkouts([])
        if (e.message.includes('Not connected')) setStep('signed-out')
      })
    return () => {
      cancelled = true
    }
  }, [step, range])

  const open = (w: Workout) => {
    setLoadingId(w.id)
    setError(null)
    fetch(`/api/wahoo/workouts/${w.id}/gpx`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Download failed (${res.status})`)
        }
        return res.text()
      })
      .then((text) => onLoad(`${w.name}.gpx`, text))
      .catch((e: Error) => {
        setError(e.message)
        setLoadingId(null)
      })
  }

  const signOut = async () => {
    setBusy(true)
    await fetch('/api/wahoo/logout', { method: 'POST' })
    setBusy(false)
    setWorkouts(null)
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
        aria-labelledby="wahoo-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="wahoo-title" className="text-base font-semibold text-zinc-100">
              Import from Wahoo
            </h2>
            <p className="text-xs text-zinc-500">
              {step === 'signed-in' ? 'Connected to your Wahoo account' : step === 'signed-out' ? 'Approve access on Wahoo’s site.' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step === 'signed-in' && (
              <button
                type="button"
                onClick={signOut}
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

          {step === 'unconfigured' && (
            <p className="text-sm text-zinc-400">Wahoo import is not set up on this server yet.</p>
          )}

          {step === 'signed-out' && (
            <div className="mx-auto max-w-sm space-y-4 text-center">
              <p className="text-sm text-zinc-300">
                You’ll be sent to Wahoo to approve read-only access to your rides. We never see your Wahoo password.
              </p>
              <a
                href="/api/wahoo/login"
                className="inline-block rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
              >
                Connect Wahoo
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
              {workouts === null && <p className="text-sm text-zinc-500">Loading rides…</p>}
              {workouts !== null && workouts.length === 0 && !error && (
                <p className="text-sm text-zinc-500">No cycling workouts in this range.</p>
              )}
              <ul className="divide-y divide-zinc-800/80">
                {(workouts ?? []).map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{w.name}</p>
                      <p className="tabular text-xs text-zinc-500">
                        {w.start ? fmtDateTime(new Date(w.start)) : '—'} · {fmtKm(w.distance, 1)} · {fmtDuration(w.duration)}
                        {w.elevationGain !== null ? ` · ↗ ${fmtM(w.elevationGain)}` : ''}
                        {w.avgSpeed !== null ? ` · ${fmtSpeed(w.avgSpeed)}` : ''}
                        {w.avgHr !== null ? ` · ${Math.round(w.avgHr)} bpm` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => open(w)}
                      disabled={!w.gps || loadingId !== null}
                      className="shrink-0 rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                      {!w.gps ? 'No GPS' : loadingId === w.id ? 'Loading…' : 'Open'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 px-6 py-3 text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-400">Note:</span> Wahoo access is read-only. The server keeps your Wahoo access token,
          refreshed as needed, and your browser holds only a secure cookie that points to it. Disconnect deletes that token.
        </footer>
      </div>
    </div>
  )
}
