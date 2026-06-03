'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

const AddCoachSchema = z.object({
  competition_id: z.string().uuid(),
  national_team_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  sportmonks_coach_id: z.coerce.number().int().positive().optional(),
})

export async function addCoachAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const parsed = AddCoachSchema.safeParse({
    competition_id: fd.get('competition_id'),
    national_team_id: fd.get('national_team_id'),
    name: fd.get('name'),
    sportmonks_coach_id: fd.get('sportmonks_coach_id') || undefined,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi')

  const { competition_id, ...rest } = parsed.data
  await supabase.from('fm_coach').upsert(
    { competition_id, ...rest },
    { onConflict: 'competition_id,national_team_id' }
  )

  revalidatePath(`/controfantamondiale/${competition_id}/coaches`)
}

export async function deleteCoachAction(coachId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_coach').delete().eq('id', coachId)
  revalidatePath(`/controfantamondiale/${competitionId}/coaches`)
}

export async function setCoachTierAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const phaseId = fd.get('phase_id') as string
  const coachId = fd.get('coach_id') as string
  const tier = fd.get('tier') as 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
  const oddsValue = fd.get('odds_value') ? Number(fd.get('odds_value')) : undefined
  const competitionId = fd.get('competition_id') as string

  await supabase.from('fm_phase_coach_tier').upsert(
    { phase_id: phaseId, coach_id: coachId, tier, odds_value: oddsValue ?? null },
    { onConflict: 'phase_id,coach_id' }
  )

  revalidatePath(`/controfantamondiale/${competitionId}/coaches`)
}
