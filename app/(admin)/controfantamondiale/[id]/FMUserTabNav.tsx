'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

const STATUS_POLL_MS = 45_000

const TABS = [
  { label: 'Live',           suffix: '/live' },
  { label: 'Risultati e Classifica', suffix: '/risultati' },
  { label: 'La Mia Rosa',    suffix: '/rosa' },
  { label: 'Formazione',     suffix: '/formazione' },
  { label: 'Rose Nazionali', suffix: '/nazionali' },
  { label: 'Regole',         suffix: '/regole' },
]

export function FMUserTabNav({ id }: { id: string }) {
  const pathname = usePathname()
  const base = `/controfantamondiale/${id}`
  const [playing, setPlaying] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/fm/${id}/live-status`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { playing: boolean }
        if (!cancelled) setPlaying(json.playing)
      } catch {
        /* keep last known state */
      }
    }
    check()
    const t = setInterval(check, STATUS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [id])

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 bg-surface-0/80 px-4 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="flex gap-0 overflow-x-auto border-b border-hairline pb-0 pt-3 scrollbar-none">
        {TABS.map((tab) => {
          const href = `${base}${tab.suffix}`
          const isActive =
            tab.suffix === ''
              ? pathname === base
              : pathname.startsWith(href)
          const isLive = tab.suffix === '/live'
          return (
            <Link
              key={tab.suffix}
              href={href as Route}
              className={`relative inline-flex shrink-0 items-center gap-1.5 px-3.5 pb-2.5 pt-1 text-[12px] font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {isLive && playing !== null && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    playing ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                  title={playing ? 'Partite in corso' : 'Nessuna partita in corso'}
                />
              )}
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-500" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
