'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/(auth)/login/actions'
import { toggleViewAsManagerAction } from '@/app/(admin)/preview-actions'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

type IconName = 'calendar' | 'trophy' | 'user' | 'gear' | 'logout' | 'ball' | 'globe' | 'book'

interface NavItem {
  href: string
  label: string
  icon: IconName
  adminOnly?: boolean
  /**
   * Extra path prefixes that should also light up this nav item as active.
   * Use for sections that live at non-obvious URLs — e.g. Campionato owns
   * /campionato/giornate and /campionato/giocatori via sub-nav.
   */
  matchPaths?: string[]
}

// Top-level IA: one "Lega" entry that points to the Lega home (/dashboard),
// where all competitions across Serie A and international are listed. Per-
// competition surfaces are reached by clicking through from there.
const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Lega',
    icon: 'trophy',
    matchPaths: [
      '/campionato',
      '/competitions',
      '/controfantamondiale',
      '/standings',
      '/roster',
      '/formations',
    ],
  },
  { href: '/le-mie-squadre', label: 'Le mie squadre', icon: 'user' },
  { href: '/league',         label: 'Impostazioni',   icon: 'gear',   adminOnly: true, matchPaths: ['/regole-di-gioco'] },
]

function NavIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  const stroke = 1.6
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
      )
    case 'trophy':
      return (
        <svg {...props}>
          <path d="M8 4h8v5a4 4 0 1 1-8 0V4z" />
          <path d="M5 6H3v2a3 3 0 0 0 3 3M19 6h2v2a3 3 0 0 1-3 3" />
          <path d="M10 17h4M9 20h6M12 13v4" />
        </svg>
      )
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...props}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l-5-5 5-5M5 12h12" />
        </svg>
      )
    case 'ball':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3l3 5-3 4-3-4z" />
          <path d="M12 12l5 3-2 5M12 12l-5 3 2 5M12 12l4-7M12 12l-4-7" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c-2.5 2.5-4 5.5-4 9s1.5 6.5 4 9M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9" />
          <path d="M3 12h18" />
          <path d="M3.6 8h16.8M3.6 16h16.8" />
        </svg>
      )
    case 'book':
      return (
        <svg {...props}>
          <path d="M4 4h11a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
          <path d="M4 4v14" />
          <path d="M7 8h7M7 12h7" />
        </svg>
      )
  }
}

interface AdminSidebarProps {
  isAdmin: boolean
  /** True only for REAL super-admins — controls the "view as manager" toggle. */
  canPreview?: boolean
  /** Whether the "view as manager" preview is currently active. */
  previewing?: boolean
  username: string
  leagueName: string
}

export function AdminSidebar({ isAdmin, canPreview, previewing, username, leagueName }: AdminSidebarProps) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  function isActive(item: NavItem) {
    // /dashboard owns a lot of nested surfaces (campionato, competitions,
    // fantamondiale, …) via matchPaths — so we can't early-return on exact
    // match. Check matchPaths first, then fall back to prefix match for
    // simpler items like /league.
    if (item.matchPaths?.some((p) => pathname.startsWith(p))) return true
    if (item.href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(item.href)
  }

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ──────────────────────────── */}
      <aside
        className="hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-surface-1 backdrop-blur-2xl md:flex dark:bg-glass-2"
      >
        {/* Brand */}
        <div className="border-b border-hairline px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-indigo-700 dark:text-indigo-200"
              style={{
                background:
                  'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(139,111,225,0.20))',
                border: '1px solid rgba(99,102,241,0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <NavIcon name="ball" size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-ink-1">
                {leagueName}
              </p>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-4">
                CONTROFANTA
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {visibleItems.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={[
                  'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-all',
                  active
                    ? 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-200 border border-indigo-500/25 dark:border-indigo-400/25 shadow-[0_2px_8px_-2px_rgba(99,102,241,0.25)]'
                    : 'border border-transparent text-ink-3 hover:bg-glass-1 hover:text-ink-1',
                ].join(' ')}
              >
                <NavIcon name={item.icon} />
                <span className="font-medium tracking-tight">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-hairline px-3 py-3">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase text-indigo-700 dark:text-indigo-200"
              style={{
                background:
                  'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(139,111,225,0.20))',
                border: '1px solid rgba(99,102,241,0.30)',
              }}
            >
              {username.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium tracking-tight text-ink-1">
                {username}
              </p>
              <p className="text-[10.5px] font-medium text-ink-4">
                {isAdmin ? 'Admin' : 'Manager'}
              </p>
            </div>
          </div>
          {canPreview && (
            <form action={toggleViewAsManagerAction} className="mb-2">
              <button
                type="submit"
                className={[
                  'flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                  previewing
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25'
                    : 'text-ink-4 hover:bg-glass-1 hover:text-ink-1',
                ].join(' ')}
              >
                <NavIcon name={previewing ? 'gear' : 'user'} size={13} />
                {previewing ? 'Esci da anteprima' : 'Vedi come manager'}
              </button>
            </form>
          )}
          <div className="flex items-center gap-2">
            <form action={logoutAction} className="flex-1">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[12px] text-ink-4 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <NavIcon name="logout" size={13} />
                Esci
              </button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav bar (hidden on desktop) ───────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-surface-1 backdrop-blur-2xl md:hidden dark:bg-glass-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around">
          {visibleItems.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={[
                  'flex flex-1 flex-col items-center gap-1 px-1 pt-2.5 pb-3 text-center transition-colors',
                  active ? 'text-indigo-700 dark:text-indigo-300' : 'text-ink-4 hover:text-ink-1',
                ].join(' ')}
              >
                <NavIcon name={item.icon} size={18} />
                <span className="text-[10px] font-medium leading-none tracking-tight">{item.label}</span>
              </Link>
            )
          })}
          <form action={logoutAction} className="flex flex-1">
            <button
              type="submit"
              className="flex flex-1 flex-col items-center gap-1 px-1 pt-2.5 pb-3 text-ink-4 transition-colors hover:text-rose-300"
            >
              <NavIcon name="logout" size={18} />
              <span className="text-[10px] font-medium leading-none tracking-tight">Esci</span>
            </button>
          </form>
        </div>
      </nav>
    </>
  )
}
