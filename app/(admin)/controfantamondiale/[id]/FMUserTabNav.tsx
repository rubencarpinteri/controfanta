'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { ADMIN_TABS, type AdminTab } from './FMTabNav'

const STATUS_POLL_MS = 45_000

// Tabs marked desktopOnly are already in the mobile bottom bar (see
// AdminSidebar's FM mode), so the top strip hides them below md to avoid
// showing the same destinations twice.
const TABS = [
  { label: 'Live',       suffix: '/live',       desktopOnly: true },
  { label: 'Classifica', suffix: '/classifica', desktopOnly: true },
  { label: 'Risultati',  suffix: '/risultati' },
  { label: 'La Mia Rosa', suffix: '/rosa',       desktopOnly: true },
  { label: 'Formazione', suffix: '/formazione', desktopOnly: true },
  { label: 'Nazionali',  suffix: '/nazionali' },
  { label: 'Regole',     suffix: '/regole' },
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
  const navRef = useRef<HTMLDivElement>(null)

  const adminTabs = ADMIN_TABS.filter((t) => isSuperAdmin || !t.platform)

  // Publish the live nav's real rendered height as a CSS variable so in-board
  // sticky headers (team / match) can park exactly below it instead of guessing
  // a fixed offset — keeps them clear of the bar even when the tabs wrap to two
  // rows on narrow screens. Below md the nav does NOT stick (mobile gets its
  // own sticky block inside the Live board), so publish 0 there.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const mq = window.matchMedia('(min-width: 768px)')
    const publish = () =>
      document.documentElement.style.setProperty(
        '--cf-livenav-h',
        mq.matches ? `${el.offsetHeight}px` : '0px',
      )
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    mq.addEventListener('change', publish)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', publish)
    }
  }, [])

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
    <div ref={navRef} className="-mx-4 mb-5 bg-surface-0/75 px-4 py-2 backdrop-blur-2xl md:sticky md:top-0 md:z-30 md:-mx-8 md:px-8">
      <div className="flex flex-wrap gap-1 rounded-[18px] border border-hairline-strong bg-surface-1/85 p-1 shadow-lg shadow-black/10 backdrop-blur-xl">
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
              aria-current={isActive ? 'page' : undefined}
              className={`relative min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[14px] px-3.5 text-[12px] font-semibold transition-all ${
                tab.desktopOnly ? 'hidden md:inline-flex' : 'inline-flex'
              } ${
                isActive
                  ? 'bg-glass-3 text-ink-1 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_8px_24px_-18px_rgba(0,0,0,0.55)] dark:shadow-[0_1px_0_rgba(255,255,255,0.10)_inset,0_10px_26px_-18px_rgba(0,0,0,0.9)]'
                  : 'text-ink-4 hover:bg-glass-1 hover:text-ink-2'
              }`}
            >
              {isLive && playing !== null && (
                <span
                  className={`h-2 w-2 rounded-full ring-2 ring-current/15 ${
                    playing ? 'animate-pulse bg-emerald-400 text-emerald-400' : 'bg-rose-500 text-rose-500'
                  }`}
                  title={playing ? 'Partite in corso' : 'Nessuna partita in corso'}
                />
              )}
              {tab.label}
              {isLive && isActive && (
                <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                  now
                </span>
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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Active when we're on any admin surface that isn't one of the player tabs.
  const activeTab = tabs.find((t) =>
    t.suffix === '' ? pathname === base : pathname.startsWith(`${base}${t.suffix}`),
  )
  const isActive = Boolean(activeTab)

  // Position the portalled menu under the button. Recomputed on open so it
  // tracks the button even though the menu renders at the document root
  // (the tab row is overflow-x-auto, which would otherwise clip an absolutely
  // positioned dropdown on both axes).
  useEffect(() => {
    if (!open) return
    function place() {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    place()
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (
        ref.current && !ref.current.contains(t) &&
        (!menuRef.current || !menuRef.current.contains(t))
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-[14px] px-3.5 text-[12px] font-semibold transition-all ${
          isActive || open
            ? 'bg-glass-3 text-ink-1 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_8px_24px_-18px_rgba(0,0,0,0.55)] dark:shadow-[0_1px_0_rgba(255,255,255,0.10)_inset,0_10px_26px_-18px_rgba(0,0,0,0.9)]'
            : 'text-ink-4 hover:bg-glass-1 hover:text-ink-2'
        }`}
      >
        <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-ink-4/70" aria-hidden />
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
      </button>

      {open && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="z-50 min-w-[180px] overflow-hidden rounded-xl border border-hairline bg-surface-1 py-1 shadow-xl shadow-black/10 backdrop-blur-xl"
        >
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
        </div>,
        document.body,
      )}
    </div>
  )
}
