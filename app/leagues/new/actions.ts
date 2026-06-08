'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'

const createLeagueSchema = z.object({
  name:        z.string().min(2, 'Il nome lega deve avere almeno 2 caratteri').max(80),
  season_name: z.string().min(1, 'La stagione è obbligatoria').max(40),
})

export interface CreateLeagueState {
  error: string | null
}

export async function createLeagueAction(
  _prev: CreateLeagueState,
  formData: FormData
): Promise<CreateLeagueState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = createLeagueSchema.safeParse({
    name:        formData.get('name'),
    season_name: formData.get('season_name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi' }
  }

  // Create the league and assign the creator as league_admin atomically.
  // A SECURITY DEFINER function is required because the SELECT policy on
  // leagues checks league membership, which doesn't exist until the
  // league_users row is inserted — a chicken-and-egg that blocks the
  // read-back of a plain .insert().select().
  const { data: leagueId, error } = await supabase.rpc('create_league', {
    p_name: parsed.data.name,
    p_season_name: parsed.data.season_name,
  })

  if (error || !leagueId) {
    return { error: `Errore creazione lega: ${error?.message ?? 'sconosciuto'}` }
  }

  redirect('/league/members' as Route)
}
