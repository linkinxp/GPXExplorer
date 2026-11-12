import { useEffect, useState } from 'react'

export interface SideNavItem {
  id: string
  label: string
  icon: string
}

export const SIDE_ICONS: Record<string, string> = {
  top: 'M12 19V5M5 12l7-7 7 7',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  route: 'M3 20l6-10 4 6 3-4 5 8z',
  effort: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  achievements: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  climbs: 'M3 19l6-9 4 5 3-3 5 7z',
  weather: 'M7 18a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.5 11 3.5 3.5 0 0 1 18 18z',
  data: 'M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01',
}

export function SideNav({ items, horizontal = false }: { items: SideNavItem[]; horizontal?: boolean }) {
  const [active, setActive] = useState<string>('top')

  useEffect(() => {
    const onScroll = () => {
      let current = 'top'
      for (const it of items) {
        if (it.id === 'top') continue
        const el = document.getElementById(it.id)
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) current = it.id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [items])

  const go = (id: string) => {
    if (id === 'top') return window.scrollTo({ top: 0, behavior: 'smooth' })
    const el = document.getElementById(id)
    const header = document.querySelector<HTMLElement>('nav.sticky')?.offsetHeight ?? 56
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - header - 12, behavior: 'smooth' })
  }

  return (
    <nav
      aria-label="Sections"
      className={
        horizontal
          ? 'flex items-center justify-between gap-1 overflow-x-auto px-3 pb-2'
          : 'fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-0.5 rounded-full border border-zinc-800/80 bg-zinc-950/75 p-1 shadow-xl shadow-black/40 backdrop-blur-xl md:flex'
      }
    >
      {items.map((it) => {
        const on = active === it.id
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => go(it.id)}
            aria-label={it.label}
            aria-current={on ? 'true' : undefined}
            className={`group relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${
              on ? 'bg-emerald-400/15 text-emerald-300' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={it.icon} />
            </svg>
            <span className="pointer-events-none absolute right-12 hidden whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100 md:block">
              {it.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
