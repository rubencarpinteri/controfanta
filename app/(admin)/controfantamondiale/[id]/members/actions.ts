'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

export async function addMemberAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const legaCompId = fd.get('league_competition_id') as string
  const userId = fd.get('user_id') as string
  const teamName = (fd.get('team_name') as string).trim()

  if (!legaCompId || !userId || !teamName) throw new Error('Dati mancanti')

  const { error } = await supabase.from('fm_fantasy_team').insert({
    league_competition_id: legaCompId,
    manager_id: userId,
    name: teamName,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/controfantamondiale/${legaCompId}/members`)
}

export async function removeMemberAction(teamId: string, legaCompId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_fantasy_team').delete().eq('id', teamId)
  revalidatePath(`/controfantamondiale/${legaCompId}/members`)
}
