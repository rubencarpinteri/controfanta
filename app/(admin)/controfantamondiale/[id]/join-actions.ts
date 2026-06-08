'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isUuid } from '@/lib/slug'

const createTeamSchema = z.object({
  competition_ref: z.string().min(1),
  team_name: z.string().trim().min(2, 'Il nome squadra deve avere almeno 2 caratteri').max(80),
})

export interface CreateFMTeamState {
  error: string | null
}

export async function createFMTeamAction(
  _prev: CreateFMTeamState,
  formData: FormData,
): Promise<CreateFMTeamState> {
  const parsed = createTeamSchema.safeParse({
    competition_ref: formData.get('competition_ref'),
    team_name: formData.get('team_name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { competition_ref, team_name } = parsed.data

  const { data: legaComp } = await supabase
    .from('fm_league_competition')
    .select('id, slug, league_id')
    .eq(isUuid(competition_ref) ? 'id' : 'slug', competition_ref)
    .maybeSingle()

  if (!legaComp) return { error: 'Competizione Mondiale non trovata.' }

  const { data: membership } = await supabase
    .from('league_users')
    .select('id')
    .eq('league_id', legaComp.league_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return { error: 'Prima devi entrare nella Lega con il link di invito.' }
  }

  const service = createServiceClient()
  const { data: existing } = await service
    .from('fm_fantasy_team')
    .select('id')
    .eq('league_competition_id', legaComp.id)
    .eq('manager_id', user.id)
    .maybeSingle()

  if (!existing) {
    const { error } = await service
      .from('fm_fantasy_team')
      .insert({
        league_competition_id: legaComp.id,
        manager_id: user.id,
        name: team_name,
      })

    if (error) {
      const message = error.message.toLowerCase().includes('unique')
        ? 'Esiste già una squadra con questo nome in questa Lega.'
        : error.message
      return { error: message }
    }
  }

  const ref = legaComp.slug ?? legaComp.id
  revalidatePath(`/controfantamondiale/${ref}`)
  revalidatePath(`/controfantamondiale/${ref}/rosa`)
  redirect(`/controfantamondiale/${ref}/rosa` as Route)
}
