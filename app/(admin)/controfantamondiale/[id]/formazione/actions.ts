'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function saveLineupAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const roundId = fd.get('round_id') as string
  const fantasyTeamId = fd.get('fantasy_team_id') as string
  const starterIds = (fd.getAll('starter_ids') as string[]).filter(Boolean)
  const formation = fd.get('formation') as string

  if (starterIds.length !== 11) throw new Error(`Seleziona esattamente 11 titolari (selezionati: ${starterIds.length})`)

  // Verify user owns this fantasy team
  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('id', fantasyTeamId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!team) throw new Error('Non autorizzato')

  // Verify round is open, get phase
  const { data: round } = await supabase
    .from('fm_scoring_round')
    .select('status, phase_id')
    .eq('id', roundId)
    .single()
  if (!round || round.status !== 'open') throw new Error('Il turno non è aperto per la selezione della formazione')

  // Look up the phase squad for this team + phase
  const { data: squad } = await supabase
    .from('fm_phase_squad')
    .select('id')
    .eq('phase_id', round.phase_id)
    .eq('fantasy_team_id', fantasyTeamId)
    .maybeSingle()
  if (!squad) throw new Error('Non hai ancora selezionato la rosa per questa fase')

  const phaseSquadId = squad.id

  // Upsert lineup record
  const { data: existing } = await supabase
    .from('fm_matchday_lineup')
    .select('id')
    .eq('scoring_round_id', roundId)
    .eq('fantasy_team_id', fantasyTeamId)
    .maybeSingle()

  let lineupId: string
  if (existing) {
    lineupId = existing.id
    await supabase
      .from('fm_matchday_lineup')
      .update({ formation, submitted_at: new Date().toISOString() })
      .eq('id', lineupId)
    await supabase.from('fm_matchday_lineup_player').delete().eq('lineup_id', lineupId)
  } else {
    const { data: newLineup, error } = await supabase
      .from('fm_matchday_lineup')
      .insert({
        scoring_round_id: roundId,
        fantasy_team_id: fantasyTeamId,
        phase_squad_id: phaseSquadId,
        formation,
        status: 'draft',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !newLineup) throw new Error(error?.message ?? 'Failed to create lineup')
    lineupId = newLineup.id
  }

  const rows = starterIds.map((pid, i) => ({
    lineup_id: lineupId,
    player_id: pid,
    is_starter: true,
    slot_position: 'auto',
    slot_order: i + 1,
  }))
  await supabase.from('fm_matchday_lineup_player').insert(rows)

  revalidatePath(`/controfantamondiale/${competitionId}/formazione`)
}
