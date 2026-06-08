'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireFMContext, assertLeagueAdmin } from '@/lib/fantamondiale/server'

export async function addMemberAction(fd: FormData) {
  const ref = fd.get('league_competition_id') as string
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  const userId = fd.get('user_id') as string
  const teamName = (fd.get('team_name') as string).trim()

  if (!ref || !userId || !teamName) throw new Error('Dati mancanti')

  const { error } = await supabase.from('fm_fantasy_team').insert({
    league_competition_id: ctx.legaCompetition.id,
    manager_id: userId,
    name: teamName,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/controfantamondiale/${ref}/members`)
}

export async function removeMemberAction(teamId: string, ref: string) {
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()
  await supabase.from('fm_fantasy_team').delete().eq('id', teamId).eq('league_competition_id', ctx.legaCompetition.id)
  revalidatePath(`/controfantamondiale/${ref}/members`)
}
