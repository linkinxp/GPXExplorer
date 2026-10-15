import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export function InstallButton({ className = '' }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null
  if (!deferred && !isIos()) return null

  const base = `rounded-xl px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/5 ${className}`

  if (deferred) {
    return (
      <button
        type="button"
        className={base}
        onClick={async () => {
          await deferred.prompt()
          const { outcome } = await deferred.userChoice
          if (outcome === 'accepted') setInstalled(true)
          setDeferred(null)
        }}
      >
        Install app
      </button>
    )
  }

  return (
    <div className="relative">
      <button type="button" className={base} onClick={() => setShowIosHint((v) => !v)} aria-expanded={showIosHint}>
        Install app
      </button>
      {showIosHint && (
        <p className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300 ring-1 ring-white/10">
          Tap the Share button in Safari, then choose “Add to Home Screen”.
        </p>
      )}
    </div>
  )
}
