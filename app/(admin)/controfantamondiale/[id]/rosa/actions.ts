'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfig } from '@/lib/fantamondiale/loadUnifiedConfig'
import { resolvePhaseBudget } from '@/lib/fantamondiale/budget'
import type { FMPlayerRole } from '@/domain/fantamondiale/config/schema'
import { isUuid } from '@/lib/slug'

const ROLE_LABEL: Record<FMPlayerRole, string> = {
  P: 'portieri',
  D: 'difensori',
  C: 'centrocampisti',
  A: 'attaccanti',
}

async function getTeamId(legaCompRef: string, userId: string): Promise<string | null> {
  const supabase = await createClient()
  // legaCompRef is the URL param — either a UUID or a slug. Resolve to the
  // fm_league_competition row first so we get the UUID primary key.
  const { data: lc } = await supabase
    .from('fm_league_competition')
    .select('id')
    .eq(isUuid(legaCompRef) ? 'id' : 'slug', legaCompRef)
    .maybeSingle()
  if (!lc) return null
  const { data } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('league_competition_id', lc.id)
    .eq('manager_id', userId)
    .maybeSingle()
  return data?.id ?? null
}

async function ensureSquad(
  phaseId: string,
  fantasyTeamId: string,
  budgetTotal: number
): Promise<string> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('fm_phase_squad')
    .select('id')
    .eq('phase_id', phaseId)
    .eq('fantasy_team_id', fantasyTeamId)
    .maybeSingle()
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('fm_phase_squad')
    .insert({
      phase_id: phaseId,
      fantasy_team_id: fantasyTeamId,
      budget_total: budgetTotal,
      budget_spent: 0,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create squad')
  return data.id
}

async function recalcBudgetSpent(supabase: Awaited<ReturnType<typeof createClient>>, squadId: string) {
  const { data: players } = await supabase
    .from('fm_phase_squad_player')
    .select('purchase_price')
    .eq('phase_squad_id', squadId)
  const spent = (players ?? []).reduce((s, p) => s + (p.purchase_price ?? 0), 0)
  await supabase.from('fm_phase_squad').update({ budget_spent: spent }).eq('id', squadId)
}

export async function toggleSquadPlayerAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const playerId = fd.get('player_id') as string

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) throw new Error('Non sei iscritto a questa competizione')

  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status, budget_config')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') throw new Error('La fase non è aperta per la selezione della rosa')

  // Price and budget are authoritative server-side — never trust the client.
  const config = await loadFMUnifiedConfig(supabase, competitionId)
  const budgetTotal = resolvePhaseBudget(phase.budget_config, config.squad.budget_default)
  const { data: priceRow } = await supabase
    .from('fm_phase_player_price')
    .select('price')
    .eq('phase_id', phaseId)
    .eq('player_id', playerId)
    .maybeSingle()
  const playerPrice = priceRow?.price ?? 0

  const squadId = await ensureSquad(phaseId, fantasyTeamId, budgetTotal)

  const { data: existing } = await supabase
    .from('fm_phase_squad_player')
    .select('id')
    .eq('phase_squad_id', squadId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    await supabase.from('fm_phase_squad_player').delete().eq('id', existing.id)
    await recalcBudgetSpent(supabase, squadId)
  } else {
    const { pool_size, role_quotas } = config.squad

    const { data: roster } = await supabase
      .from('fm_phase_squad_player')
      .select('player_id, fm_player:player_id(role)')
      .eq('phase_squad_id', squadId)
    const currentCount = roster?.length ?? 0
    if (currentCount >= pool_size) {
      throw new Error(`Rosa piena (massimo ${pool_size} giocatori)`)
    }

    const { data: pickedPlayer } = await supabase
      .from('fm_player')
      .select('role')
      .eq('id', playerId)
      .single()
    if (!pickedPlayer) throw new Error('Giocatore non trovato')
    const pickedRole = pickedPlayer.role as FMPlayerRole

    const roleCount = (roster ?? []).filter((r) => {
      const fp = r.fm_player as { role: FMPlayerRole } | { role: FMPlayerRole }[] | null
      const role = Array.isArray(fp) ? fp[0]?.role : fp?.role
      return role === pickedRole
    }).length
    const roleQuota = role_quotas[pickedRole]
    if (roleCount >= roleQuota) {
      throw new Error(
        `Quota ${ROLE_LABEL[pickedRole]} piena (${roleQuota} massimo)`,
      )
    }

    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('budget_spent, budget_total')
      .eq('id', squadId)
      .single()
    if (squad && squad.budget_spent + playerPrice > squad.budget_total) {
      throw new Error(`Budget insufficiente (rimasti ${squad.budget_total - squad.budget_spent} cr)`)
    }

    await supabase
      .from('fm_phase_squad_player')
      .insert({ phase_squad_id: squadId, player_id: playerId, purchase_price: playerPrice })
    await recalcBudgetSpent(supabase, squadId)
  }

  revalidatePath(`/controfantamondiale/${competitionId}/rosa`)
}

export async function setSquadCoachAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const coachId = (fd.get('coach_id') as string) || null

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) throw new Error('Non sei iscritto a questa competizione')

  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status, competition_id, budget_config')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') throw new Error('La fase non è aperta per la selezione della rosa')

  const config = await loadFMUnifiedConfig(supabase, phase.competition_id)
  const budgetTotal = resolvePhaseBudget(phase.budget_config, config.squad.budget_default)
  const squadId = await ensureSquad(phaseId, fantasyTeamId, budgetTotal)
  await supabase.from('fm_phase_squad').update({ coach_id: coachId }).eq('id', squadId)

  revalidatePath(`/controfantamondiale/${competitionId}/rosa`)
}
