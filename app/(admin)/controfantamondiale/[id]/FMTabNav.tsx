'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'

// `platform: true` tabs edit the shared World Cup template (fixtures, the
// player/coach pool) and are super-admin only. The rest are the per-league
// fantasy surfaces a league_admin owns.
const TABS: { label: string; suffix: string; platform?: boolean }[] = [
  { label: 'Overview',   suffix: '' },
  { label: 'Fasi fantasy', suffix: '/phases' },
  { label: 'Turni',      suffix: '/rounds', platform: true },
  { label: 'Nazioni',    suffix: '/teams', platform: true },
  { label: 'Giocatori',  suffix: '/players', platform: true },
  { label: 'Rose Nazionali', suffix: '/nazionali', platform: true },
  { label: 'Allenatori', suffix: '/coaches', platform: true },
  { label: 'Prezzi',     suffix: '/prices' },
  { label: 'Setup',      suffix: '/config' },
  { label: 'Iscritti',   suffix: '/members' },
]

export function FMTabNav({ id, isSuperAdmin }: { id: string; isSuperAdmin: boolean }) {
  const pathname = usePathname()
  const base = `/controfantamondiale/${id}`
  const tabs = TABS.filter((t) => isSuperAdmin || !t.platform)

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 bg-surface-0/80 px-4 backdrop-blur-xl md:-mx-8 md:px-8">
      <div className="flex gap-0 overflow-x-auto border-b border-hairline pb-0 pt-3 scrollbar-none">
        {tabs.map((tab) => {
          const href = `${base}${tab.suffix}`
          const isActive =
            tab.suffix === ''
              ? pathname === base
              : pathname.startsWith(href)
          return (
            <Link
              key={tab.suffix}
              href={href as Route}
              className={`relative shrink-0 px-3.5 pb-2.5 pt-1 text-[12px] font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
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
