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
  const showAdminTabs = ctx.isSuperAdmin

  return (
    <div className="space-y-0">
      <div className="mb-1 flex items-center gap-2">
        <a href="/controfantamondiale" className="text-[11px] text-ink-5 hover:text-ink-3 transition-colors">
          ControFanta Mondiale
        </a>
        <span className="text-[11px] text-ink-5">/</span>
        <span className="text-[11px] font-medium text-ink-3">
          {ctx.competition.name} {ctx.competition.edition}
        </span>
      </div>

      {showUserTabs && (
        <>
          {showAdminTabs && (
            <p className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Giocatore
            </p>
          )}
          <FMUserTabNav id={id} />
        </>
      )}
      {showAdminTabs && (
        <>
          {showUserTabs && (
            <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
              Admin
            </p>
          )}
          <FMTabNav id={id} />
        </>
      )}

      {children}
    </div>
  )
}
