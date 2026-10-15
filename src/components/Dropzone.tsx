import { useState, type DragEvent } from 'react'
import { cn } from '../lib/utils'

interface DropzoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function Dropzone({ onFile, disabled }: DropzoneProps) {
  const [over, setOver] = useState(false)

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border border-dashed p-10 text-center transition-all duration-300',
        over
          ? 'border-emerald-400 bg-emerald-400/10 scale-[1.01]'
          : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500 hover:bg-zinc-900/70',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-sky-400/20 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-medium text-zinc-100">Drop a .gpx or .fit file here</p>
        <p className="mt-1 text-sm text-zinc-400">or click to browse. Everything is parsed in your browser.</p>
      </div>
      <input
        type="file"
        accept=".gpx,.fit,application/gpx+xml,application/xml,text/xml"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}
