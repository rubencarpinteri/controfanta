'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

const AddTeamSchema = z.object({
  competition_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  fifa_code: z.string().min(2).max(10).toUpperCase(),
  flag_emoji: z.string().max(8).optional(),
  sportmonks_team_id: z.coerce.number().int().positive().optional(),
})

export async function addTeamAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const parsed = AddTeamSchema.safeParse({
    competition_id: fd.get('competition_id'),
    name: fd.get('name'),
    fifa_code: fd.get('fifa_code'),
    flag_emoji: fd.get('flag_emoji') || undefined,
    sportmonks_team_id: fd.get('sportmonks_team_id') || undefined,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi')

  const { competition_id, ...rest } = parsed.data
  await supabase.from('fm_national_team').insert({ competition_id, ...rest })

  revalidatePath(`/controfantamondiale/${competition_id}/teams`)
}

export async function eliminateTeamAction(teamId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase
    .from('fm_national_team')
    .update({ status: 'eliminated', eliminated_at: new Date().toISOString() })
    .eq('id', teamId)
  revalidatePath(`/controfantamondiale/${competitionId}/teams`)
}

export async function reactivateTeamAction(teamId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase
    .from('fm_national_team')
    .update({ status: 'active', eliminated_at: null })
    .eq('id', teamId)
  revalidatePath(`/controfantamondiale/${competitionId}/teams`)
}

export async function deleteTeamAction(teamId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_national_team').delete().eq('id', teamId)
  revalidatePath(`/controfantamondiale/${competitionId}/teams`)
}
