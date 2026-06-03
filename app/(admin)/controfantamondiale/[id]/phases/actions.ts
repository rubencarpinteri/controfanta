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
  const squad_lock_at = fd.get('squad_lock_at') as string || null
  const reveal_at = fd.get('reveal_at') as string || null
  const requires_new_squad = fd.get('requires_new_squad') === 'true'
  const budget_mode = fd.get('budget_mode') as 'fixed' | 'comeback' | 'reward_leaders'

  await supabase
    .from('fm_phase')
    .update({ name, squad_open_at, squad_lock_at, reveal_at, requires_new_squad, budget_mode })
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
