// ============================================================
// FantaMondiale — Live round snapshot (engine, live-tolerant)
// ============================================================
// Sibling of `runRoundEngine`, but for matches still in progress. Unlike the
// finalization pass it NEVER throws on missing/partial results — it treats a
// starter's match as one of three states (played / not_played / pending) and
// produces a per-lega board with provisional player scores and, crucially,
// BOTH the current and the *potential* ownership penalty.
//
// Why two ownership numbers (the trademark subtlety):
//   The popularity penalty is monotonic and cross-team coupled. A player
//   benched in team B can be subbed in if B's same-role starter doesn't play,
//   which raises his ownership — and therefore everyone's penalty on him —
//   retroactively. So we compute, per player across the whole lega:
//     fielded_now  — teams fielding him under the optimistic assumption that
//                    every still-live starter will end up playing.
//     fielded_max  — teams that COULD field him if every still-live starter
//                    ends up NOT playing (the ceiling).
//   The page shows "−now ▸ up to −potential".
//
// Reuses the pure engine pieces: scorePlayerRaw, applySubstitutions,
// finalizePlayerForLega — so live and final scoring can never diverge.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import { loadFMUnifiedConfig } from '@/lib/fantamondiale/loadUnifiedConfig'
import { scorePlayerRaw, finalizePlayerForLega, hasDecisiveEvent } from './playerScore'
import { applySubstitutions, type FMRole, type SubStarter, type SubBench } from './substitution'

type Supabase = SupabaseClient<Database>

type PlayState = 'played' | 'not_played' | 'pending'

// ---- snapshot payload shape (persisted as jsonb) ---------------------------

export type LiveTeamRef = {
  name: string
  fifa_code: string
  logo_url: string | null
  flag_url: string | null
}

export type LiveSnapshotPlayer = {
  player_id: string
  name: string
  role: FMRole
  via: 'starter' | 'sub' | 'bench'
  national_team: LiveTeamRef | null
  status: PlayState
  /** Is this player in the fielded-now set (i.e. counts toward live_total)? */
  counts: boolean
  rating: number | null
  raw_subtotal: number
  popularity_penalty_now: number
  popularity_penalty_potential: number
  mvp_bonus: number
  final_score_now: number
}

export type LiveSnapshotTeam = {
  fantasy_team_id: string
  name: string
  formation: string | null
  coach: { name: string; tier: string | null; team: LiveTeamRef | null } | null
  live_total: number
  players: LiveSnapshotPlayer[]
}

export type LiveOwnershipEntry = {
  fielded_now: number
  max_possible: number
  pct_now: number
  pct_potential: number
}

export type LiveRoundSnapshot = {
  computed_at: string
  round: { id: string; name: string; phase_id: string }
  teams: LiveSnapshotTeam[]
  ownership: Record<string, LiveOwnershipEntry>
}

// ---------------------------------------------------------------------------

/**
 * Compute the live board for one lega + round. Pure read; writes nothing.
 * Returns null when the round has no submitted lineups yet (nothing to show).
 */
export async function computeLiveRoundSnapshot(
  roundId: string,
  legaCompId: string,
  supabase: Supabase,
): Promise<LiveRoundSnapshot | null> {
  // ---- 1. Round + config ------------------------------------------------
  const { data: round } = await supabase
    .from('fm_scoring_round')
    .select('id, name, phase_id, competition_id')
    .eq('id', roundId)
    .maybeSingle()
  if (!round) return null

  const composed = await loadFMUnifiedConfig(supabase, round.competition_id)
  const config = fmCompetitionConfigSchema.parse(composed)
  const sub = config.substitution

  // ---- 2. Matches for the round (live-tolerant: scores may be null) ------
  const { data: matches } = await supabase
    .from('fm_real_match')
    .select('id, home_team_id, away_team_id, home_score, away_score, status')
    .eq('scoring_round_id', roundId)
  const matchByTeamId = new Map<string, NonNullable<typeof matches>[number]>()
  for (const m of matches ?? []) {
    matchByTeamId.set(m.home_team_id, m)
    matchByTeamId.set(m.away_team_id, m)
  }

  // ---- 3. This lega's teams + their submitted lineups -------------------
  const { data: teams } = await supabase
    .from('fm_fantasy_team')
    .select('id, name')
    .eq('league_competition_id', legaCompId)
    .order('name', { ascending: true })
  const teamIds = (teams ?? []).map((t) => t.id)
  if (teamIds.length === 0) return null

  const { data: lineups } = await supabase
    .from('fm_matchday_lineup')
    .select('fantasy_team_id, formation, fm_matchday_lineup_player(player_id, is_starter, bench_order)')
    .eq('scoring_round_id', roundId)
    .in('fantasy_team_id', teamIds)
    .not('submitted_at', 'is', null)
  if (!lineups || lineups.length === 0) return null
  const lineupByTeam = new Map(lineups.map((l) => [l.fantasy_team_id, l]))

  // ---- 4. Players + provisional stats -----------------------------------
  const allPlayerIds = [
    ...new Set(lineups.flatMap((l) => l.fm_matchday_lineup_player.map((p) => p.player_id))),
  ]
  const { data: players } = await supabase
    .from('fm_player')
    .select('id, name, role, national_team_id, fm_national_team(name, fifa_code, logo_url, flag_url)')
    .in('id', allPlayerIds.length > 0 ? allPlayerIds : ['00000000-0000-0000-0000-000000000000'])
  const playerById = new Map((players ?? []).map((p) => [p.id, p]))

  const matchIds = (matches ?? []).map((m) => m.id)
  const { data: allStats } = await supabase
    .from('fm_player_match_stats')
    .select(
      'real_match_id, player_id, minutes_played, rating, goals, penalties_scored, assists, yellow_cards, red_cards, penalties_saved, penalties_missed, own_goals, goals_conceded, is_mvp',
    )
    .in('real_match_id', matchIds.length > 0 ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const statsByKey = new Map((allStats ?? []).map((s) => [`${s.player_id}:${s.real_match_id}`, s]))

  // ---- 5. Coaches (display only) ----------------------------------------
  const { data: phaseSquads } = await supabase
    .from('fm_phase_squad')
    .select('fantasy_team_id, coach_id')
    .eq('phase_id', round.phase_id)
    .in('fantasy_team_id', teamIds)
    .not('coach_id', 'is', null)
  const coachIdByTeam = new Map(
    (phaseSquads ?? [])
      .filter((s): s is typeof s & { coach_id: string } => !!s.coach_id)
      .map((s) => [s.fantasy_team_id, s.coach_id]),
  )
  const coachIds = [...new Set(coachIdByTeam.values())]
  const coachInfoById = new Map<
    string,
    { name: string; tier: string | null; team: LiveTeamRef | null }
  >()
  if (coachIds.length > 0) {
    const [coachRows, tierRows] = await Promise.all([
      supabase
        .from('fm_coach')
        .select('id, name, fm_national_team(name, fifa_code, logo_url, flag_url)')
        .in('id', coachIds),
      supabase
        .from('fm_competition_coach_tier')
        .select('coach_id, tier')
        .eq('competition_id', round.competition_id)
        .in('coach_id', coachIds),
    ])
    const tierByCoach = new Map((tierRows.data ?? []).map((r) => [r.coach_id, r.tier]))
    for (const c of coachRows.data ?? []) {
      coachInfoById.set(c.id, {
        name: c.name,
        tier: tierByCoach.get(c.id) ?? null,
        team: (c.fm_national_team as LiveTeamRef | null) ?? null,
      })
    }
  }

  // ============================================================
  // Per-(player, match) raw scores + three-state play status.
  // ============================================================
  const rawByPlayer = new Map<string, ReturnType<typeof scorePlayerRaw>>()
  const stateByPlayer = new Map<string, PlayState>()

  for (const pid of allPlayerIds) {
    const player = playerById.get(pid)
    if (!player) continue
    const match = matchByTeamId.get(player.national_team_id)
    if (!match) {
      // No real match wired for his nation in this round → treat as pending.
      stateByPlayer.set(pid, 'pending')
      continue
    }
    const stats = statsByKey.get(`${pid}:${match.id}`)
    const matchFinal = match.status === 'finished' || match.status === 'cancelled'

    if (!stats) {
      stateByPlayer.set(pid, matchFinal ? 'not_played' : 'pending')
      continue
    }

    const raw = scorePlayerRaw(
      {
        playerId: pid,
        role: player.role as FMRole,
        nationalTeamId: player.national_team_id,
        stats: {
          minutes_played: stats.minutes_played,
          rating: stats.rating != null ? Number(stats.rating) : null,
          goals: stats.goals,
          penalties_scored: stats.penalties_scored ?? 0,
          assists: stats.assists,
          yellow_cards: stats.yellow_cards,
          red_cards: stats.red_cards,
          penalties_saved: stats.penalties_saved,
          penalties_missed: stats.penalties_missed,
          own_goals: stats.own_goals,
          goals_conceded: stats.goals_conceded,
          is_mvp: stats.is_mvp,
        },
        matchContext: {
          real_match_id: match.id,
          scoring_round_id: roundId,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_score: match.home_score ?? 0,
          away_score: match.away_score ?? 0,
        },
      },
      config,
    )
    rawByPlayer.set(pid, raw)

    // "played" bar — same logic as finalization's didPlay.
    const hasUsableScore = raw.voto_base !== null
    let played: boolean
    if (sub.trigger === 'no_rating') {
      played = hasUsableScore
    } else {
      played =
        hasUsableScore &&
        (stats.minutes_played >= sub.min_minutes ||
          hasDecisiveEvent({
            minutes_played: stats.minutes_played,
            rating: stats.rating != null ? Number(stats.rating) : null,
            goals: stats.goals,
            penalties_scored: stats.penalties_scored ?? 0,
            assists: stats.assists,
            yellow_cards: stats.yellow_cards,
            red_cards: stats.red_cards,
            penalties_saved: stats.penalties_saved,
            penalties_missed: stats.penalties_missed,
            own_goals: stats.own_goals,
            goals_conceded: stats.goals_conceded,
            is_mvp: stats.is_mvp,
          }))
    }

    stateByPlayer.set(pid, played ? 'played' : matchFinal ? 'not_played' : 'pending')
  }

  const stateOf = (pid: string): PlayState => stateByPlayer.get(pid) ?? 'pending'

  // ============================================================
  // Ownership now vs potential.
  // ============================================================
  // now  — a single concrete fielded XI per team via applySubstitutions, with
  //        starters optimistic (pending counts as will-play) and bench counted
  //        only if CONFIRMED played. Drives current points + current penalty.
  //
  // potential — the per-PLAYER ceiling. It is NOT one lineup: the scenario that
  //        maximizes player P's ownership keeps P optimistic while assuming P's
  //        same-role RIVAL starters all fail. So we compute, per team & role:
  //          riskR  = same-role starters that could still fail (state != played)
  //          a starter counts if state != not_played (he might still play)
  //          a could-play bench at rank k counts if k < riskR (a slot vacates)
  //        The resulting per-team "potential" set can exceed 11 — that's fine,
  //        it is only ever read per-player to count ceilings, never as an XI.
  const totalTeams = teamIds.length
  const nowCount = new Map<string, number>()
  const maxCount = new Map<string, number>()

  for (const lineup of lineups) {
    // ---- now: one concrete XI ----
    const startersNow: SubStarter[] = []
    const benchNow: SubBench[] = []
    // ---- potential: per-role buckets ----
    const startersByRole = new Map<FMRole, string[]>() // starters that might play (state != not_played)
    const riskByRole = new Map<FMRole, number>() // same-role starter slots that could vacate
    const benchByRole = new Map<FMRole, { id: string; order: number }[]>() // could-play benches

    for (const lp of lineup.fm_matchday_lineup_player) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const role = player.role as FMRole
      const st = stateOf(lp.player_id)

      if (lp.is_starter) {
        startersNow.push({ player_id: lp.player_id, role, played: st !== 'not_played' })
        if (st !== 'not_played') {
          const arr = startersByRole.get(role) ?? []
          arr.push(lp.player_id)
          startersByRole.set(role, arr)
        }
        if (st !== 'played') riskByRole.set(role, (riskByRole.get(role) ?? 0) + 1)
      } else {
        const bo = lp.bench_order ?? 999
        benchNow.push({ player_id: lp.player_id, role, bench_order: bo, played: st === 'played' })
        if (st !== 'not_played') {
          const arr = benchByRole.get(role) ?? []
          arr.push({ id: lp.player_id, order: bo })
          benchByRole.set(role, arr)
        }
      }
    }

    for (const pid of applySubstitutions(startersNow, benchNow).fielded.map((f) => f.player_id)) {
      nowCount.set(pid, (nowCount.get(pid) ?? 0) + 1)
    }

    // potential per team: starters that might play + first `riskR` could-play benches.
    const potential = new Set<string>()
    for (const [, ids] of startersByRole) for (const id of ids) potential.add(id)
    for (const [role, benches] of benchByRole) {
      const risk = riskByRole.get(role) ?? 0
      benches.sort((a, b) => a.order - b.order)
      for (let k = 0; k < benches.length && k < risk; k++) potential.add(benches[k]!.id)
    }
    for (const pid of potential) maxCount.set(pid, (maxCount.get(pid) ?? 0) + 1)
  }

  const ownership: Record<string, LiveOwnershipEntry> = {}
  for (const pid of allPlayerIds) {
    const fn = nowCount.get(pid) ?? 0
    const fm = Math.max(maxCount.get(pid) ?? 0, fn) // never below current
    ownership[pid] = {
      fielded_now: fn,
      max_possible: fm,
      pct_now: totalTeams > 0 ? (fn / totalTeams) * 100 : 0,
      pct_potential: totalTeams > 0 ? (fm / totalTeams) * 100 : 0,
    }
  }

  // ============================================================
  // Build the per-team board (sorted by live_total desc).
  // ============================================================
  const fieldedNowVia = new Map<string, Map<string, 'starter' | 'sub'>>()
  // Recompute the "now" fielded with via info for display.
  for (const lineup of lineups) {
    const startersNow: SubStarter[] = []
    const benchNow: SubBench[] = []
    for (const lp of lineup.fm_matchday_lineup_player) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const role = player.role as FMRole
      const st = stateOf(lp.player_id)
      if (lp.is_starter) {
        startersNow.push({ player_id: lp.player_id, role, played: st !== 'not_played' })
      } else {
        benchNow.push({
          player_id: lp.player_id,
          role,
          bench_order: lp.bench_order ?? 999,
          played: st === 'played',
        })
      }
    }
    const now = applySubstitutions(startersNow, benchNow)
    fieldedNowVia.set(
      lineup.fantasy_team_id,
      new Map(now.fielded.map((f) => [f.player_id, f.via])),
    )
  }

  const teamsOut: LiveSnapshotTeam[] = (teams ?? []).map((team) => {
    const lineup = lineupByTeam.get(team.id)
    const fieldedVia = fieldedNowVia.get(team.id) ?? new Map()
    const coachId = coachIdByTeam.get(team.id)
    const coach = coachId ? (coachInfoById.get(coachId) ?? null) : null

    const players: LiveSnapshotPlayer[] = []
    let live_total = 0

    for (const lp of lineup?.fm_matchday_lineup_player ?? []) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const own = ownership[lp.player_id]
      const raw = rawByPlayer.get(lp.player_id)
      const counts = fieldedVia.has(lp.player_id)
      const via = fieldedVia.get(lp.player_id) ?? (lp.is_starter ? 'starter' : 'bench')

      const stats = (() => {
        const m = matchByTeamId.get(player.national_team_id)
        return m ? statsByKey.get(`${lp.player_id}:${m.id}`) : undefined
      })()

      let popularity_penalty_now = 0
      let popularity_penalty_potential = 0
      let mvp_bonus = 0
      let final_score_now = 0

      if (raw) {
        const finNow = finalizePlayerForLega(
          { raw_subtotal: raw.raw_subtotal, is_mvp: raw.is_mvp },
          own?.pct_now ?? 0,
          config,
        )
        const finMax = finalizePlayerForLega(
          { raw_subtotal: raw.raw_subtotal, is_mvp: raw.is_mvp },
          own?.pct_potential ?? 0,
          config,
        )
        popularity_penalty_now = finNow.popularity_penalty_amount
        popularity_penalty_potential = finMax.popularity_penalty_amount
        mvp_bonus = finNow.mvp_bonus_amount
        final_score_now = finNow.final_score
        if (counts) live_total += finNow.final_score
      }

      players.push({
        player_id: lp.player_id,
        name: player.name,
        role: player.role as FMRole,
        via,
        national_team: (player.fm_national_team as LiveTeamRef | null) ?? null,
        status: stateOf(lp.player_id),
        counts,
        rating: stats?.rating != null ? Number(stats.rating) : null,
        raw_subtotal: raw?.raw_subtotal ?? 0,
        popularity_penalty_now,
        popularity_penalty_potential,
        mvp_bonus,
        final_score_now,
      })
    }

    return {
      fantasy_team_id: team.id,
      name: team.name,
      formation: lineup?.formation ?? null,
      coach,
      live_total: Math.round(live_total * 100) / 100,
      players,
    }
  })

  teamsOut.sort((a, b) => b.live_total - a.live_total)

  return {
    computed_at: new Date().toISOString(),
    round: { id: round.id, name: round.name, phase_id: round.phase_id },
    teams: teamsOut,
    ownership,
  }
}
