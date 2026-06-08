'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

export async function updatePhaseAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const id = fd.get('id') as string
  const competitionId = fd.get('competition_id') as string
  const name = fd.get('name') as string
  const squad_open_at = fd.get('squad_open_at') as string || null
  // squad_lock_at / reveal_at are NOT set here — they are derived from the
  // phase's real SportMonks fixtures by autoCreateFMRoundsAndMatches. The
  // admin controls them indirectly via sportmonks_stage_id below.
  const stageRaw = fd.get('sportmonks_stage_id') as string | null
  const sportmonks_stage_id = stageRaw && stageRaw.trim() !== '' ? Number(stageRaw) : null
  const requires_new_squad = fd.get('requires_new_squad') === 'true'
  const budget_mode = fd.get('budget_mode') as 'fixed' | 'comeback' | 'reward_leaders'

  // Per-phase budget value. For 'fixed' it is a single number; for the
  // rank-based modes we seed a uniform budget_by_rank (admins can refine the
  // per-rank curve later). Budget rises across stages — see budget.ts.
  const budgetRaw = Number(fd.get('budget'))
  const budget = Number.isFinite(budgetRaw) ? Math.max(50, Math.min(10_000, Math.round(budgetRaw))) : 100
  const budget_config =
    budget_mode === 'fixed'
      ? { mode: 'fixed' as const, budget }
      : { mode: budget_mode, budget_by_rank: [budget] }

  await supabase
    .from('fm_phase')
    .update({ name, squad_open_at, sportmonks_stage_id, requires_new_squad, budget_mode, budget_config })
    .eq('id', id)

  revalidatePath(`/controfantamondiale/${competitionId}/phases`)
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
