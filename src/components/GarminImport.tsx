import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { fmtDateTime, fmtDuration, fmtKm, fmtM, fmtSpeed } from '../lib/format'

interface Activity {
  id: number
  name: string
  type: string
  start: string | null
  distance: number
  duration: number
  elevationGain: number | null
  avgSpeed: number | null
  avgHr: number | null
  gps: boolean
}

type Step = 'checking' | 'signed-out' | 'mfa' | 'signed-in'
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

function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function GarminImport({ onLoad, onClose }: { onLoad: (name: string, text: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>('checking')
  const [account, setAccount] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ticket, setTicket] = useState('')
  const [code, setCode] = useState('')
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
    api<{ logged_in: boolean; name?: string | null }>('/api/garmin/status')
      .then((s) => {
        setAccount(s.name ?? null)
        setStep(s.logged_in ? 'signed-in' : 'signed-out')
      })
      .catch(() => setStep('signed-out'))
  }, [])

  useEffect(() => {
    if (step !== 'signed-in') return
    let cancelled = false
    setActivities(null)
    setError(null)
    api<{ activities: Activity[] }>(`/api/garmin/activities?range=${range}`)
      .then((r) => !cancelled && setActivities(r.activities))
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setActivities([])
      })
    return () => {
      cancelled = true
    }
  }, [step, range])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await api<{ status: 'ok'; name: string } | { status: 'mfa_required'; ticket: string }>(
        '/api/garmin/login',
        postJson({ email, password }),
      )
      setPassword('')
      if (r.status === 'mfa_required') {
        setTicket(r.ticket)
        setCode('')
        setStep('mfa')
      } else {
        setAccount(r.name)
        setStep('signed-in')
      }
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await api<{ status: 'ok'; name?: string }>('/api/garmin/mfa', postJson({ ticket, code }))
      setAccount(r.name ?? null)
      setTicket('')
      setStep('signed-in')
    })
  }

  const signOut = () => {
    run(async () => {
      await api('/api/garmin/logout', { method: 'POST' })
      setAccount(null)
      setActivities(null)
      setStep('signed-out')
    })
  }

  const open = (a: Activity) => {
    setLoadingId(a.id)
    setError(null)
    fetch(`/api/garmin/activities/${a.id}/gpx`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Download failed (${res.status})`)
        }
        return res.text()
      })
      .then((text) => onLoad(`${a.name}.gpx`, text))
      .catch((e: Error) => {
        setError(e.message)
        setLoadingId(null)
      })
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
        aria-labelledby="garmin-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="garmin-title" className="text-base font-semibold text-zinc-100">
              Import from Garmin Connect
            </h2>
            <p className="text-xs text-zinc-500">
              {step === 'signed-in' && account ? `Signed in as ${account}` : 'Sign in with your Garmin Connect account.'}
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
                Sign out
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
          {step === 'checking' && <p className="text-sm text-zinc-500">Checking sign-in…</p>}

          {step === 'signed-out' && (
            <form onSubmit={signIn} className="mx-auto max-w-sm space-y-4">
              <Field label="Garmin email">
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <button type="submit" disabled={busy} className={primaryClass}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {step === 'mfa' && (
            <form onSubmit={verify} className="mx-auto max-w-sm space-y-4">
              <p className="text-sm text-zinc-300">
                Garmin sent a verification code. Enter it below to finish signing in.
              </p>
              <Field label="Verification code">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className={`${inputClass} tabular tracking-[0.4em]`}
                  autoFocus
                />
              </Field>
              <div className="flex gap-3">
                <button type="submit" disabled={busy || code.length < 4} className={primaryClass}>
                  {busy ? 'Checking…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTicket('')
                    setStep('signed-out')
                  }}
                  className="rounded-full px-4 text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Back
                </button>
              </div>
            </form>
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
              {activities === null && <p className="text-sm text-zinc-500">Loading activities…</p>}
              {activities !== null && activities.length === 0 && !error && (
                <p className="text-sm text-zinc-500">No activities in this range.</p>
              )}
              <ul className="divide-y divide-zinc-800/80">
                {(activities ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{a.name}</p>
                      <p className="tabular text-xs text-zinc-500">
                        {a.start ? fmtDateTime(new Date(a.start.replace(' ', 'T'))) : '—'} · {fmtKm(a.distance, 1)} ·{' '}
                        {fmtDuration(a.duration)}
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
                      {!a.gps ? 'No GPS' : loadingId === a.id ? 'Loading…' : 'Open'}
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
          <span className="text-zinc-400">Note:</span> your Garmin password is not saved, by this site or its server. It is
          used once to sign in to Garmin. To keep you signed in, the server keeps a Garmin session token for up to 7 days,
          and your browser only holds a secure cookie that points to it. Sign out deletes that token.
        </footer>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-400/60'
const primaryClass =
  'rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  )
}
