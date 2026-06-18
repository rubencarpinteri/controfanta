'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfigForLega } from '@/lib/fantamondiale/loadUnifiedConfig'
import { resolvePhaseBudget } from '@/lib/fantamondiale/budget'
import {
  resolveLegaCompId,
  getLegaPhaseSettings,
  getLegaPlayerPrice,
} from '@/lib/fantamondiale/server'
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
    .select('id, budget_total')
    .eq('phase_id', phaseId)
    .eq('fantasy_team_id', fantasyTeamId)
    .maybeSingle()
  if (existing) {
    // Reconcile the frozen budget with the league's current per-phase budget.
    // A league_admin can raise/lower the budget after squads exist; the add-player
    // check enforces squad.budget_total, so without this sync those edits never
    // take effect for already-created squads.
    if (existing.budget_total !== budgetTotal) {
      await supabase
        .from('fm_phase_squad')
        .update({ budget_total: budgetTotal })
        .eq('id', existing.id)
    }
    return existing.id
  }

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

// Expected/validation failures are returned (not thrown) so their message
// survives to the UI — Next.js masks thrown server-action errors in production.
// `warning` carries a non-blocking notice (e.g. a submitted formazione was
// invalidated by this rosa change) that the UI should surface.
export type ToggleSquadResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }

export async function toggleSquadPlayerAction(fd: FormData): Promise<ToggleSquadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const playerId = fd.get('player_id') as string

  const legaCompId = await resolveLegaCompId(supabase, competitionId)
  if (!legaCompId) return { ok: false, error: 'Competizione non trovata' }

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) return { ok: false, error: 'Non sei iscritto a questa competizione' }

  // Phase status stays global (driven by real fixtures); budget + price come
  // from this Lega's own fantasy layer.
  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') return { ok: false, error: 'La fase non è aperta per la selezione della rosa' }

  // The rosa is drafted ONCE per stage. As soon as the FIRST round of this phase
  // has locked, the squad is frozen for the rest of the stage: from then on a
  // manager may only change the formazione per round (MD2, MD3…), never the squad
  // itself. (A fresh redraft happens in the NEXT phase / stage.) The group-stage
  // phase stays `status='open'` across every matchday, so the phase-open check
  // above is NOT enough on its own — without this guard the rosa would stay
  // editable mid-stage. See [[project_wc2026_squads_and_livescore]].
  const { data: lockedRounds } = await supabase
    .from('fm_scoring_round')
    .select('id')
    .eq('phase_id', phaseId)
    .in('status', ['locked', 'scoring', 'published'])
    .limit(1)
  if (lockedRounds && lockedRounds.length > 0) {
    return {
      ok: false,
      error: 'La rosa è bloccata: la fase è già iniziata. In questa fase puoi cambiare solo la formazione, non la rosa.',
    }
  }

  // Price and budget are authoritative server-side — never trust the client.
  const config = await loadFMUnifiedConfigForLega(supabase, legaCompId)
  const phaseSettings = await getLegaPhaseSettings(supabase, legaCompId, phaseId)
  const budgetTotal = resolvePhaseBudget(phaseSettings?.budget_config ?? {}, config.squad.budget_default)
  const playerPrice = await getLegaPlayerPrice(supabase, legaCompId, phaseId, playerId)

  const squadId = await ensureSquad(phaseId, fantasyTeamId, budgetTotal)

  const { data: existing } = await supabase
    .from('fm_phase_squad_player')
    .select('id')
    .eq('phase_squad_id', squadId)
    .eq('player_id', playerId)
    .maybeSingle()

  let warning: string | undefined

  if (existing) {
    // Reshaping the rosa is allowed while the phase window is open — even after a
    // formazione has been submitted. But the two must stay in sync: if this
    // player is in a submitted lineup for a STILL-OPEN round of this phase, drop
    // him from that lineup too. Otherwise the saved entry would be an orphan —
    // illegal ("non è nella tua rosa") on the next save and, worse, scored as a
    // phantom by the live engine, which reads lineup players with no rosa
    // cross-check. The manager is warned that the affected formazione must be
    // resubmitted.
    //
    // Crucially we ONLY cascade into rounds whose status is 'open'. A locked (or
    // finished) round's lineup is immutable: the player was legitimately fielded
    // and must keep being scored even if he is later dropped from the rosa while
    // preparing a future round of the same phase. A single group-stage phase
    // spans every matchday, so without this guard a mid-week rosa edit silently
    // gutted already-locked lineups (the FantaGayrage MD1 incident).
    const { data: affected } = await supabase
      .from('fm_matchday_lineup_player')
      .select('id, fm_matchday_lineup!inner(fantasy_team_id, fm_scoring_round!inner(name, phase_id, status))')
      .eq('player_id', playerId)
      .eq('fm_matchday_lineup.fantasy_team_id', fantasyTeamId)
      .eq('fm_matchday_lineup.fm_scoring_round.phase_id', phaseId)
      .eq('fm_matchday_lineup.fm_scoring_round.status', 'open')

    if (affected && affected.length > 0) {
      await supabase
        .from('fm_matchday_lineup_player')
        .delete()
        .in('id', affected.map((a) => a.id))

      const roundNames = [
        ...new Set(
          affected.map((a) => {
            const sr = (a.fm_matchday_lineup as { fm_scoring_round?: { name?: string } | { name?: string }[] | null } | null)?.fm_scoring_round
            return (Array.isArray(sr) ? sr[0]?.name : sr?.name) ?? 'in corso'
          })
        ),
      ]
      warning = `Hai modificato la rosa: la formazione (${roundNames.join(', ')}) non è più valida. Ricordati di rischierarla prima del blocco.`
    }

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
      return { ok: false, error: `Rosa piena (massimo ${pool_size} giocatori)` }
    }

    const { data: pickedPlayer } = await supabase
      .from('fm_player')
      .select('role')
      .eq('id', playerId)
      .single()
    if (!pickedPlayer) return { ok: false, error: 'Giocatore non trovato' }
    const pickedRole = pickedPlayer.role as FMPlayerRole

    const roleCount = (roster ?? []).filter((r) => {
      const fp = r.fm_player as { role: FMPlayerRole } | { role: FMPlayerRole }[] | null
      const role = Array.isArray(fp) ? fp[0]?.role : fp?.role
      return role === pickedRole
    }).length
    const roleQuota = role_quotas[pickedRole]
    if (roleCount >= roleQuota) {
      return { ok: false, error: `Quota ${ROLE_LABEL[pickedRole]} piena (${roleQuota} massimo)` }
    }

    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('budget_spent, budget_total')
      .eq('id', squadId)
      .single()
    if (squad && squad.budget_spent + playerPrice > squad.budget_total) {
      return { ok: false, error: `Budget insufficiente (rimasti ${squad.budget_total - squad.budget_spent} cr)` }
    }

    await supabase
      .from('fm_phase_squad_player')
      .insert({ phase_squad_id: squadId, player_id: playerId, purchase_price: playerPrice })
    await recalcBudgetSpent(supabase, squadId)
  }

  revalidatePath(`/controfantamondiale/${competitionId}/rosa`)
  return { ok: true, warning }
}

export async function setSquadCoachAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const coachId = (fd.get('coach_id') as string) || null

  const legaCompId = await resolveLegaCompId(supabase, competitionId)
  if (!legaCompId) throw new Error('Competizione non trovata')

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) throw new Error('Non sei iscritto a questa competizione')

  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') throw new Error('La fase non è aperta per la selezione della rosa')

  const config = await loadFMUnifiedConfigForLega(supabase, legaCompId)
  const phaseSettings = await getLegaPhaseSettings(supabase, legaCompId, phaseId)
  const budgetTotal = resolvePhaseBudget(phaseSettings?.budget_config ?? {}, config.squad.budget_default)
  const squadId = await ensureSquad(phaseId, fantasyTeamId, budgetTotal)
  await supabase.from('fm_phase_squad').update({ coach_id: coachId }).eq('id', squadId)

  revalidatePath(`/controfantamondiale/${competitionId}/rosa`)
}
