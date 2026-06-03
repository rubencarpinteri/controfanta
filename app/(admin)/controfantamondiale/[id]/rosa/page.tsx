import { requireFMContext, getFMPhases, getFMTeams, getFMPlayers, getFMCoaches } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfig } from '@/lib/fantamondiale/loadUnifiedConfig'
import { SquadBuilder } from './SquadBuilder'

export default async function RosaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const phases = await getFMPhases(ctx.competition.id)

  // Find the active phase (open) or most recent completed phase
  const activePhase =
    phases.find((p) => p.status === 'open') ??
    phases.filter((p) => p.status === 'completed').at(-1) ??
    phases[0] ?? null

  if (!activePhase) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-1">Mia Rosa</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">
            La rosa si costruisce a inizio di ogni Fase, con il budget di quella fase.
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center space-y-2">
          <p className="text-[14px] text-ink-3">Nessuna fase disponibile.</p>
          <p className="text-[11px] text-ink-5">
            La rosa non può essere creata finché un&apos;amministratrice non apre una fase
            (status &ldquo;open&rdquo;) con i prezzi caricati.
          </p>
          {ctx.isSuperAdmin && (
            <div className="pt-2 flex items-center justify-center gap-2">
              <a
                href={`/controfantamondiale/${id}/phases`}
                className="rounded-lg border border-hairline bg-glass-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-glass-3 transition-colors"
              >
                Vai a Fasi fantasy →
              </a>
              <a
                href={`/controfantamondiale/${id}/prices`}
                className="rounded-lg border border-hairline bg-glass-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-glass-3 transition-colors"
              >
                Carica prezzi →
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  const config = await loadFMUnifiedConfig(supabase, ctx.competition.id)
  const budgetTotal = config.squad.budget_default

  // Load fantasy team for this user in the active phase
  const fantasyTeamId = ctx.fantasyTeamId
  let squadId: string | null = null
  let squadPlayerIds = new Set<string>()
  let coachId: string | null = null
  let budgetSpent = 0

  if (fantasyTeamId) {
    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('id, budget_spent, coach_id')
      .eq('phase_id', activePhase.id)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    if (squad) {
      squadId = squad.id
      budgetSpent = squad.budget_spent
      coachId = squad.coach_id ?? null

      const { data: squadPlayers } = await supabase
        .from('fm_phase_squad_player')
        .select('player_id')
        .eq('phase_squad_id', squad.id)
      squadPlayerIds = new Set((squadPlayers ?? []).map((sp) => sp.player_id))
    }
  }

  // For admins viewing without a team: show all players but read-only
  const isReadOnly = !ctx.fantasyTeamId || activePhase.status !== 'open'

  const [teams, players, coaches] = await Promise.all([
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id),
    getFMCoaches(ctx.competition.id),
  ])

  // Load price map for active phase
  const { data: priceRows } = await supabase
    .from('fm_phase_player_price')
    .select('player_id, price')
    .eq('phase_id', activePhase.id)
  const priceMap = new Map<string, number>((priceRows ?? []).map((r) => [r.player_id, r.price]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-1">Mia Rosa</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">
            Fase: <span className="text-ink-2">{activePhase.name}</span>
            {activePhase.status === 'open'
              ? ' — aperta per la selezione'
              : activePhase.status === 'locked'
              ? ' — rosa chiusa'
              : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-light tabular-nums text-ink-1">
            {budgetTotal - budgetSpent}
            <span className="ml-1 text-[11px] text-ink-4">cr rimasti</span>
          </p>
          <p className="text-[10px] text-ink-5">
            {budgetSpent} / {budgetTotal} spesi · {squadPlayerIds.size} / {config.squad.pool_size} giocatori
          </p>
        </div>
      </div>

      {isReadOnly && activePhase.status !== 'open' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-400">
          La rosa è chiusa — puoi solo visualizzarla.
        </div>
      )}

      <SquadBuilder
        competitionId={id}
        phase={activePhase}
        teams={teams}
        players={players}
        coaches={coaches}
        priceMap={priceMap}
        selectedPlayerIds={squadPlayerIds}
        selectedCoachId={coachId}
        budgetTotal={budgetTotal}
        budgetSpent={budgetSpent}
        poolSize={config.squad.pool_size}
        roleQuotas={config.squad.role_quotas}
        isReadOnly={isReadOnly}
        isSuperAdmin={ctx.isSuperAdmin}
      />
    </div>
  )
}
