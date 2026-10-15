import type { ReactNode } from 'react'
import { BlurFade } from './magic/blur-fade'

interface SectionProps {
  id: string
  title: string
  subtitle?: string
  action?: ReactNode
  delay?: number
  children: ReactNode
}

export function Section({ id, title, subtitle, action, delay = 0, children }: SectionProps) {
  return (
    <BlurFade delay={delay} inView className="mt-12 scroll-mt-6">
      <section id={id}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </section>
    </BlurFade>
  )
}

export const cardClass =
  'rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-xl shadow-black/20 backdrop-blur'
