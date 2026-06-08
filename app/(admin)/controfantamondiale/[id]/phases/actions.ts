'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'
import { requireFMContext, assertLeagueAdmin } from '@/lib/fantamondiale/server'

// Global phase timing/stage — shared across all Leghe, super-admin only. The
// phase mirrors the real tournament stage; lock/reveal are derived from its
// SportMonks fixtures (autoCreateFMRoundsAndMatches), so the admin only sets the
// name, the squad open time, and the stage mapping here.
export async function updatePhaseAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const id = fd.get('id') as string
  const competitionId = fd.get('competition_id') as string
  const name = fd.get('name') as string
  const squad_open_at = fd.get('squad_open_at') as string || null
  const stageRaw = fd.get('sportmonks_stage_id') as string | null
  const sportmonks_stage_id = stageRaw && stageRaw.trim() !== '' ? Number(stageRaw) : null

  await supabase
    .from('fm_phase')
    .update({ name, squad_open_at, sportmonks_stage_id })
    .eq('id', id)

  revalidatePath(`/controfantamondiale/${competitionId}/phases`)
}

// Per-league redraft cadence + budget — each Lega owns its own (fm_league_phase),
// editable by its league_admin. This is the "1 squad / 3 lineups in group, fresh
// squad each knockout" knob, independent of every other league.
export async function updateLegaPhaseAction(fd: FormData) {
  const ref = fd.get('competition_id') as string
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  const phaseId = fd.get('phase_id') as string
  const requires_new_squad = fd.get('requires_new_squad') === 'true'
  const budget_mode = fd.get('budget_mode') as 'fixed' | 'comeback' | 'reward_leaders'

  const budgetRaw = Number(fd.get('budget'))
  const budget = Number.isFinite(budgetRaw) ? Math.max(50, Math.min(10_000, Math.round(budgetRaw))) : 100
  const budget_config =
    budget_mode === 'fixed'
      ? { mode: 'fixed' as const, budget }
      : { mode: budget_mode, budget_by_rank: [budget] }

  await supabase
    .from('fm_league_phase')
    .upsert(
      {
        league_competition_id: ctx.legaCompetition.id,
        phase_id: phaseId,
        requires_new_squad,
        budget_mode,
        budget_config,
      },
      { onConflict: 'league_competition_id,phase_id' }
    )

  revalidatePath(`/controfantamondiale/${ref}/phases`)
}

export async function setPhaseStatusAction(
  phaseId: string,
  competitionId: string,
  status: 'draft' | 'open' | 'locked' | 'completed'
) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_phase').update({ status }).eq('id', phaseId)
  revalidatePath(`/controfantamondiale/${competitionId}/phases`)
}
