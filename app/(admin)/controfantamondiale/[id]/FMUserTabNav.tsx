'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { ADMIN_TABS, type AdminTab } from './FMTabNav'

const STATUS_POLL_MS = 45_000

const TABS = [
  { label: 'Live',           suffix: '/live' },
  { label: 'Risultati e Classifica', suffix: '/risultati' },
  { label: 'La Mia Rosa',    suffix: '/rosa' },
  { label: 'Formazione',     suffix: '/formazione' },
  { label: 'Rose Nazionali', suffix: '/nazionali' },
  { label: 'Regole',         suffix: '/regole' },
]

export function FMUserTabNav({
  id,
  isSuperAdmin = false,
  showAdmin = false,
}: {
  id: string
  isSuperAdmin?: boolean
  showAdmin?: boolean
}) {
  const pathname = usePathname()
  const base = `/controfantamondiale/${id}`
  const [playing, setPlaying] = useState<boolean | null>(null)

  const adminTabs = ADMIN_TABS.filter((t) => isSuperAdmin || !t.platform)

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

        {showAdmin && <AdminMenu base={base} pathname={pathname} tabs={adminTabs} />}
      </div>
    </div>
  )
}

function AdminMenu({
  base,
  pathname,
  tabs,
}: {
  base: string
  pathname: string
  tabs: AdminTab[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Active when we're on any admin surface that isn't one of the player tabs.
  const activeTab = tabs.find((t) =>
    t.suffix === '' ? pathname === base : pathname.startsWith(`${base}${t.suffix}`),
  )
  const isActive = Boolean(activeTab)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex items-center gap-1 px-3.5 pb-2.5 pt-1 text-[12px] font-medium transition-colors ${
          isActive || open ? 'text-indigo-400' : 'text-ink-4 hover:text-ink-2'
        }`}
      >
        <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-indigo-400/70" aria-hidden />
        Admin
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {isActive && (
          <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-hairline bg-surface-1 py-1 shadow-xl shadow-black/10 backdrop-blur-xl">
          <p className="px-3 pb-1 pt-1.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/80">
            Amministrazione
          </p>
          {tabs.map((tab) => {
            const href = `${base}${tab.suffix}`
            const active = tab === activeTab
            return (
              <Link
                key={tab.suffix}
                href={href as Route}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] transition-colors ${
                  active
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'text-ink-3 hover:bg-glass-2 hover:text-ink-1'
                }`}
              >
                {tab.label}
                {tab.platform && (
                  <span className="rounded bg-ink-5/10 px-1 text-[8px] font-semibold uppercase tracking-wide text-ink-5">
                    pool
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
