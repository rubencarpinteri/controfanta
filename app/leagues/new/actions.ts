'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { slugify } from '@/lib/slug'
import { seedLegaFantasyLayer } from '@/lib/fantamondiale/seedLegaFantasyLayer'

const createLeagueSchema = z.object({
  name:        z.string().min(2, 'Il nome lega deve avere almeno 2 caratteri').max(80),
  season_name: z.string().min(1, 'La stagione è obbligatoria').max(40),
  team_name:   z.string().trim().min(2, 'Il nome squadra deve avere almeno 2 caratteri').max(60),
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
    team_name:   formData.get('team_name'),
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

  const inviteCode = generateInviteCode()
  const { error: leagueSetupError } = await supabase
    .from('leagues')
    .update({
      invite_token: inviteCode,
      invite_token_created_by: user.id,
    })
    .eq('id', leagueId)

  if (leagueSetupError) {
    return { error: `Lega creata, ma codice invito non generato: ${leagueSetupError.message}` }
  }

  const { data: fmCompetition } = await supabase
    .from('fm_competition')
    .select('id, name, edition, status')
    .neq('status', 'draft')
    .neq('status', 'completed')
    .neq('status', 'archived')
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (fmCompetition) {
    const baseSlug = slugify(`${fmCompetition.name}-${fmCompetition.edition}`)
    const { data: legaCompId, error: optInError } = await supabase.rpc('opt_lega_into_fm', {
      p_league_id: leagueId,
      p_fm_competition_id: fmCompetition.id,
      p_base_slug: baseSlug,
    })

    if (optInError || !legaCompId) {
      return { error: `Lega creata, ma iscrizione al Mondiale non riuscita: ${optInError?.message ?? 'errore sconosciuto'}` }
    }

    await seedLegaFantasyLayer(supabase, legaCompId, fmCompetition.id)

    const service = createServiceClient()
    const { error: teamError } = await service
      .from('fm_fantasy_team')
      .insert({
        league_competition_id: legaCompId,
        manager_id: user.id,
        name: parsed.data.team_name,
      })

    if (teamError) {
      const message = teamError.message.toLowerCase().includes('unique')
        ? 'Esiste già una squadra con questo nome.'
        : teamError.message
      return { error: `Lega creata, ma squadra Mondiale non creata: ${message}` }
    }
  }

  redirect('/league/members' as Route)
}

function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}
