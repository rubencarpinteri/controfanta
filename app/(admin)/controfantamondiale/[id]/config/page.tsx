import { requireFMContext, assertLeagueAdmin, getFMPhases } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfigForLega } from '@/lib/fantamondiale/loadUnifiedConfig'
import { FMConfigEditor } from './FMConfigEditor'
import { PhaseBudgetEditor, type PhaseBudgetRow } from './PhaseBudgetEditor'
import type { FMPhase } from '@/types/database.types'

function phaseBudget(cfg: unknown): number {
  const c = (cfg ?? null) as { budget?: number; budget_by_rank?: number[] } | null
  if (c) {
    if (typeof c.budget === 'number') return c.budget
    if (Array.isArray(c.budget_by_rank) && typeof c.budget_by_rank[0] === 'number') return c.budget_by_rank[0]
  }
  return 100
}

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertLeagueAdmin(ctx)

  const supabase = await createClient()
  const config = await loadFMUnifiedConfigForLega(supabase, ctx.legaCompetition.id)
  const phases = await getFMPhases(ctx.competition.id)

  // This Lega's per-phase budget overrides (fm_league_phase), falling back to the
  // global phase defaults where a per-league row is missing.
  const { data: legaPhaseRows } = await supabase
    .from('fm_league_phase')
    .select('phase_id, requires_new_squad, budget_mode, budget_config')
    .eq('league_competition_id', ctx.legaCompetition.id)
  const legaByPhase = new Map((legaPhaseRows ?? []).map((r) => [r.phase_id, r]))

  const phaseBudgetRows: PhaseBudgetRow[] = phases.map((phase: FMPhase) => {
    const lp = legaByPhase.get(phase.id)
    return {
      id: phase.id,
      name: phase.name,
      display_order: phase.display_order,
      status: phase.status,
      budget_mode: lp?.budget_mode ?? phase.budget_mode,
      budget: phaseBudget(lp?.budget_config ?? phase.budget_config),
      requires_new_squad: lp?.requires_new_squad ?? phase.requires_new_squad,
    }
  })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Setup competizione</h2>
        <p className="mt-0.5 text-[11px] text-ink-4">
          Dimensione rosa, budget per fase, formazioni consentite e matrice allenatore
          per questa competizione. Le regole di calcolo (motore, bonus/malus, soglie gol) sono globali
          e si modificano in Regole di gioco. Il calendario delle Fasi e dei Turni si configura
          nelle rispettive tab.
        </p>
      </div>

      <FMConfigEditor competitionId={id} initialConfig={config} />

      {/* ── Per-phase budget (the value managers actually build their rosa against) ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-4">
        <div>
          <p className="text-[13px] font-semibold text-ink-1">Budget per fase</p>
          <p className="mt-0.5 text-[11px] text-ink-4 leading-relaxed">
            Il budget effettivo con cui i manager costruiscono la rosa, fase per fase.
          </p>
        </div>
        <PhaseBudgetEditor competitionId={id} phases={phaseBudgetRows} />
      </div>
    </div>
  )
}
