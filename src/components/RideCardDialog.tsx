import type { Analysis } from '../types'
import { RC_METRICS } from '../lib/ridecard'

const MAX_METRICS = 9

interface RideCardDialogProps {
  analysis: Analysis
  sel: string[]
  setSel: (keys: string[]) => void
  onDownload: () => void
  onClose: () => void
}

export function RideCardDialog({ analysis, sel, setSel, onDownload, onClose }: RideCardDialogProps) {
  const full = sel.length >= MAX_METRICS
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ridecard-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="ridecard-title" className="text-base font-semibold text-zinc-100">
              Ride card
            </h2>
            <p className="text-xs text-zinc-500">
              {sel.length} / {MAX_METRICS} metrics selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-white/5"
          >
            Close
          </button>
        </header>
        <div className="grid grid-cols-1 gap-1 overflow-y-auto p-4 sm:grid-cols-2">
          {RC_METRICS.map((m) => {
            const val = m.value(analysis)
            const checked = sel.includes(m.key)
            const disabled = val === null || (!checked && full)
            return (
              <div key={m.key}>
                <label
                  className={
                    'flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ' +
                    (disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-white/5')
                  }
                >
                  <span className="flex items-center gap-2 text-zinc-200">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setSel(checked ? sel.filter((k) => k !== m.key) : [...sel, m.key])}
                      className="accent-emerald-400"
                    />
                    {m.label}
                  </span>
                  <span className="text-xs text-zinc-500">{val ?? 'No data'}</span>
                </label>
              </div>
            )
          })}
        </div>
        <footer className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            type="button"
            onClick={onDownload}
            disabled={sel.length === 0}
            className="h-11 rounded-full bg-zinc-100 px-6 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-50"
          >
            Download PNG
          </button>
        </footer>
      </div>
    </div>
  )
}
