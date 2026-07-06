import Link from 'next/link'
import { requireFMContext } from '@/lib/fantamondiale/server'
import { FMTabNav } from './FMTabNav'
import { FMUserTabNav } from './FMUserTabNav'

export default async function FMCompetitionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireFMContext(id)

  // Visibility matrix:
  //   * pure manager  → user tabs only ("Mia Rosa", "Formazione", …)
  //   * pure admin    → admin tabs only ("Fasi", "Turni", "Setup", …)
  //   * admin + iscritto → both stacked, so a super-admin who also
  //     plays can build their squad without losing access to admin tools.
  const showUserTabs = ctx.fantasyTeamId !== null
  // League admins manage their Lega's fantasy surfaces; super admins also get
  // the platform/pool tabs (filtered inside FMTabNav).
  const showAdminTabs = ctx.isSuperAdmin || ctx.isLeagueAdmin

  return (
    <div className="space-y-0">
      <div className="mb-1 flex items-center gap-2">
        <Link href="/controfantamondiale" className="text-[11px] text-ink-5 hover:text-ink-3 transition-colors">
          ControFanta Mondiale
        </Link>
        <span className="text-[11px] text-ink-5">/</span>
        <span className="text-[11px] font-medium text-ink-3">
          {ctx.competition.name} {ctx.competition.edition}
        </span>
      </div>

      {showUserTabs ? (
        // Player + admin: one player nav with admin folded into an "Admin"
        // dropdown after "Regole", so the admin bar no longer competes for
        // attention while still one click from every admin surface.
        <FMUserTabNav
          id={id}
          isSuperAdmin={ctx.isSuperAdmin}
          showAdmin={showAdminTabs}
        />
      ) : (
        // Pure admin (not iscritto): the full admin bar is the only nav.
        showAdminTabs && <FMTabNav id={id} isSuperAdmin={ctx.isSuperAdmin} />
      )}

      {children}
    </div>
  )
}
