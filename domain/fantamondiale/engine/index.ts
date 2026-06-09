import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import { loadFMUnifiedConfig, loadFMUnifiedConfigForLega } from '@/lib/fantamondiale/loadUnifiedConfig'
import { scorePlayerRaw, finalizePlayerForLega, hasDecisiveEvent } from './playerScore'
import {
  applySubstitutions,
  type FMRole,
  type SubStarter,
  type SubBench,
  type FieldedPlayer,
} from './substitution'
import { scoreCoach } from './coachScore'
import { aggregateTeamRoundScore } from './roundScore'
import { computeBattleRoyale } from './battleRoyale'
import type { FMEnginePlayerInput, FMEngineCoachInput, FMPlayerMatchScoreResult } from './types'

type Supabase = SupabaseClient<Database>

// ============================================================
// FantaMondiale round engine — per-Lega bucketed
// ============================================================
// Pipeline for a single scoring round:
//   1. Score players RAW (Lega-agnostic)   → fm_player_match_score
//   2. Score coaches                       → fm_coach_match_score
//   3. For each Lega instance playing this tournament:
//        a. Compute ownership_pct per player within this Lega's pool
//        b. Finalize per-Lega player scores (popularity penalty + MVP bonus)
//        c. Aggregate team round scores                → fm_fantasy_team_round_score
//        d. Battle Royale pairing within the Lega      → fm_battle_royale_matchup
//        e. Update BR tally on the round scores
//        f. Recompute standings from all scored rounds → fm_competition_standing
//
// Key invariant: same player on same match yields different final scores in
// different Leghe (because popularity penalty depends on this Lega's
// ownership pool). The Lega-agnostic raw_subtotal in fm_player_match_score
// is what makes that split possible without recomputing voto_base N times.
// ============================================================

export type RoundEngineResult = {
  teamsScored: number
  playerScoresWritten: number
  coachScoresWritten: number
  brMatchupsWritten: number
  legaInstancesProcessed: number
}

export async function runRoundEngine(roundId: string, supabase: Supabase): Promise<RoundEngineResult> {
  // ---- 1. Round + config ------------------------------------------------
  const { data: round, error: roundErr } = await supabase
    .from('fm_scoring_round')
    .select('id, phase_id, competition_id')
    .eq('id', roundId)
    .single()
  if (roundErr || !round) throw new Error(`Round not found: ${roundErr?.message}`)

  // Phase kind decides coach scoring mode: group_stage → absolute tier
  // matrix; any knockout round → opponent-relative favoredness matrix.
  const { data: phase, error: phaseErr } = await supabase
    .from('fm_phase')
    .select('kind')
    .eq('id', round.phase_id)
    .single()
  if (phaseErr || !phase) throw new Error(`Phase not found: ${phaseErr?.message}`)
  const isKnockout = phase.kind !== 'group_stage'

  const composed = await loadFMUnifiedConfig(supabase, round.competition_id)
  const config = fmCompetitionConfigSchema.parse(composed)

  // ---- 2. Real matches for the round -----------------------------------
  const { data: matches, error: matchErr } = await supabase
    .from('fm_real_match')
    .select('id, home_team_id, away_team_id, home_score, away_score, result')
    .eq('scoring_round_id', roundId)
  if (matchErr) throw new Error(`Matches load failed: ${matchErr.message}`)
  if (!matches || matches.length === 0) throw new Error('No real matches found for this round')

  const matchIds = matches.map((m) => m.id)
  const matchByTeamId = new Map<string, (typeof matches)[0]>()
  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) {
      throw new Error(`Match ${m.id} has no result yet — enter scores before running the engine`)
    }
    matchByTeamId.set(m.home_team_id, m)
    matchByTeamId.set(m.away_team_id, m)
  }

  // ---- 3. Submitted lineups (across every Lega instance) ----------------
  const { data: lineups, error: lineupErr } = await supabase
    .from('fm_matchday_lineup')
    .select('id, fantasy_team_id, fm_matchday_lineup_player(player_id, is_starter, bench_order)')
    .eq('scoring_round_id', roundId)
    .not('submitted_at', 'is', null)
  if (lineupErr) throw new Error(`Lineups load failed: ${lineupErr.message}`)
  if (!lineups || lineups.length === 0) throw new Error('No submitted lineups found for this round')

  // ---- 4. Players, stats, squads, coaches -------------------------------
  // Load ALL lineup players (starters + bench) — bench players need raw
  // scores so they can be subbed in.
  const allPlayerIds = [
    ...new Set(
      lineups.flatMap((l) => l.fm_matchday_lineup_player.map((p) => p.player_id))
    ),
  ]
  const { data: players, error: playerErr } = await supabase
    .from('fm_player')
    .select('id, role, national_team_id')
    .in('id', allPlayerIds)
  if (playerErr) throw new Error(`Players load failed: ${playerErr.message}`)
  const playerById = new Map((players ?? []).map((p) => [p.id, p]))

  const { data: allStats, error: statsErr } = await supabase
    .from('fm_player_match_stats')
    .select(
      'real_match_id, player_id, minutes_played, rating, goals, penalties_scored, assists, yellow_cards, red_cards, penalties_saved, penalties_missed, own_goals, goals_conceded, is_mvp'
    )
    .in('real_match_id', matchIds)
  if (statsErr) throw new Error(`Stats load failed: ${statsErr.message}`)
  const statsByKey = new Map((allStats ?? []).map((s) => [`${s.player_id}:${s.real_match_id}`, s]))

  const { data: phaseSquads, error: squadErr } = await supabase
    .from('fm_phase_squad')
    .select('fantasy_team_id, coach_id')
    .eq('phase_id', round.phase_id)
  if (squadErr) throw new Error(`Phase squads load failed: ${squadErr.message}`)
  const coachIdByTeamId = new Map(
    (phaseSquads ?? [])
      .filter((s): s is typeof s & { coach_id: string } => s.coach_id != null)
      .map((s) => [s.fantasy_team_id, s.coach_id])
  )

  const uniqueCoachIds = [...new Set(coachIdByTeamId.values())]

  const { data: coaches, error: coachErr } = await supabase
    .from('fm_coach')
    .select('id, national_team_id')
    .in('id', uniqueCoachIds)
  if (coachErr) throw new Error(`Coaches load failed: ${coachErr.message}`)
  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]))

  // Tiers are competition-level and frozen for the whole tournament.
  // Load ALL of them (not just drafted coaches) — knockout scoring needs
  // the opponent's tier, and the opponent may be undrafted.
  const { data: coachTiers, error: tierErr } = await supabase
    .from('fm_competition_coach_tier')
    .select('coach_id, tier, fm_coach(national_team_id)')
    .eq('competition_id', round.competition_id)
  if (tierErr) throw new Error(`Coach tiers load failed: ${tierErr.message}`)
  const tierByNationalTeamId = new Map<string, FMEngineCoachInput['tier']>()
  for (const ct of coachTiers ?? []) {
    const ntId = (ct.fm_coach as { national_team_id: string } | null)?.national_team_id
    if (ntId) tierByNationalTeamId.set(ntId, ct.tier as FMEngineCoachInput['tier'])
  }
  const tierByCoachId = new Map(
    (coachTiers ?? []).map((ct) => [ct.coach_id, ct.tier as FMEngineCoachInput['tier']])
  )

  // ============================================================
  // STEP 1: Lega-agnostic raw player scores
  // ============================================================
  // Key: "playerId:matchId". Computed once per (player, match) regardless
  // of which Lega the player is rostered in.
  const rawByKey = new Map<string, FMPlayerMatchScoreResult>()

  type StatRow = NonNullable<typeof allStats>[number]
  type MatchRow = (typeof matches)[number]
  // Build the engine input for one (player, match) — reused for the raw pass
  // and for the per-lega immunity recompute below.
  const buildInput = (
    playerId: string,
    role: FMEnginePlayerInput['role'],
    nationalTeamId: string,
    match: MatchRow,
    stats: StatRow,
  ): FMEnginePlayerInput => ({
    playerId,
    role,
    nationalTeamId,
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
      home_score: match.home_score!,
      away_score: match.away_score!,
    },
  })

  for (const lineup of lineups) {
    for (const lp of lineup.fm_matchday_lineup_player) {
      // Raw score every lineup player (starter or bench) — a bench player
      // who comes on must already have a computed score.
      const player = playerById.get(lp.player_id)
      if (!player) continue

      const match = matchByTeamId.get(player.national_team_id)
      if (!match) continue

      const scoreKey = `${lp.player_id}:${match.id}`
      if (rawByKey.has(scoreKey)) continue

      const stats = statsByKey.get(scoreKey)
      if (!stats) continue

      rawByKey.set(
        scoreKey,
        scorePlayerRaw(buildInput(lp.player_id, player.role as FMEnginePlayerInput['role'], player.national_team_id, match, stats), config),
      )
    }
  }

  const playerScoreRows = [...rawByKey.values()].map((r) => ({
    scoring_round_id: r.scoring_round_id,
    real_match_id: r.real_match_id,
    player_id: r.player_id,
    base_rating: r.base_rating,
    z_rating: r.z_rating,
    voto_base: r.voto_base,
    football_bonus: r.football_bonus,
    football_malus: r.football_malus,
    raw_subtotal: r.raw_subtotal,
    is_mvp: r.is_mvp,
    calc_snapshot: r.calc_snapshot as unknown as Json,
  }))

  if (playerScoreRows.length > 0) {
    const { error } = await supabase
      .from('fm_player_match_score')
      .upsert(playerScoreRows, { onConflict: 'scoring_round_id,player_id,real_match_id' })
    if (error) throw new Error(`Player score upsert failed: ${error.message}`)
  }

  // ============================================================
  // STEP 1.5: Resolve bench substitutions per team.
  // ============================================================
  // Lega-agnostic: a team's fielded set depends only on its own lineup +
  // match stats, not on ownership. "Module is king": strict role-locked,
  // bench-order-ranked subs, no cross-role fallback, play short when the
  // same-role bench is exhausted. The fielded set drives BOTH ownership and
  // the final per-player scores below.
  const sub = config.substitution

  // A starter counts as "played" (kept, not substituted) when he has a usable
  // score AND either reached the minute threshold OR made a decisive
  // contribution. The decisive-event clause is what protects a player who, say,
  // scores at minute 2 and is subbed off injured at minute 11 — his goal must
  // always count, regardless of the minute threshold.
  const didPlay = (playerId: string, matchId: string): boolean => {
    const raw = rawByKey.get(`${playerId}:${matchId}`)
    const hasUsableScore = !!raw && raw.voto_base !== null

    if (sub.trigger === 'no_rating') {
      // Sub only on a true s.v. (no usable voto at all).
      return hasUsableScore
    }

    // 'min_minutes': must have a usable score to contribute at all, then keep
    // him if he played enough OR he had a decisive event (goal/assist/card…).
    if (!hasUsableScore) return false
    const stats = statsByKey.get(`${playerId}:${matchId}`)
    if (!stats) return false
    if (stats.minutes_played >= sub.min_minutes) return true
    return hasDecisiveEvent({
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
    })
  }

  const fieldedByTeam = new Map<string, FieldedPlayer[]>()

  for (const lineup of lineups) {
    const starters: SubStarter[] = []
    const benchList: SubBench[] = []

    for (const lp of lineup.fm_matchday_lineup_player) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const match = matchByTeamId.get(player.national_team_id)
      const played = match ? didPlay(lp.player_id, match.id) : false
      const role = player.role as FMRole

      if (lp.is_starter) {
        starters.push({ player_id: lp.player_id, role, played })
      } else {
        benchList.push({
          player_id: lp.player_id,
          role,
          bench_order: lp.bench_order ?? 999,
          played,
        })
      }
    }

    const { fielded } = applySubstitutions(starters, benchList)
    fieldedByTeam.set(lineup.fantasy_team_id, fielded)
  }

  // ============================================================
  // STEP 2: Coach scores (Lega-agnostic — coaches are global to the
  // tournament template, scored once per match regardless of Lega).
  // ============================================================
  const coachScoreRows: {
    scoring_round_id: string
    real_match_id: string
    coach_id: string
    team_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
    match_result: 'home_win' | 'draw' | 'away_win'
    bonus_or_malus: number
    final_score: number
    calc_snapshot: Json
  }[] = []

  for (const coachId of uniqueCoachIds) {
    const coach = coachById.get(coachId)
    if (!coach) continue
    const tier = tierByCoachId.get(coachId)
    if (!tier) continue
    const match = matchByTeamId.get(coach.national_team_id)
    if (!match) continue

    const opponentTeamId =
      match.home_team_id === coach.national_team_id
        ? match.away_team_id
        : match.home_team_id
    const opponentTier = tierByNationalTeamId.get(opponentTeamId) ?? null

    const input: FMEngineCoachInput = {
      coachId,
      nationalTeamId: coach.national_team_id,
      tier,
      opponentTier,
      isKnockout,
      matchContext: {
        real_match_id: match.id,
        scoring_round_id: roundId,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_score: match.home_score!,
        away_score: match.away_score!,
        result: match.result,
      },
    }

    const result = scoreCoach(input, config)
    if (!result) continue

    coachScoreRows.push({
      scoring_round_id: result.scoring_round_id,
      real_match_id: result.real_match_id,
      coach_id: result.coach_id,
      team_tier: result.team_tier,
      match_result: result.match_result,
      bonus_or_malus: result.bonus_or_malus,
      final_score: result.final_score,
      calc_snapshot: result.calc_snapshot as unknown as Json,
    })
  }

  if (coachScoreRows.length > 0) {
    const { error } = await supabase
      .from('fm_coach_match_score')
      .upsert(coachScoreRows, { onConflict: 'real_match_id,coach_id' })
    if (error) throw new Error(`Coach score upsert failed: ${error.message}`)
  }

  const coachTotalByCoachId = new Map<string, number>()
  for (const row of coachScoreRows) {
    coachTotalByCoachId.set(
      row.coach_id,
      (coachTotalByCoachId.get(row.coach_id) ?? 0) + row.final_score
    )
  }

  // ============================================================
  // STEP 3: Load every team across all Lega instances of this tournament.
  // Each team has a league_competition_id pointing at its Lega's instance.
  // ============================================================
  const { data: allTeams, error: teamsErr } = await supabase
    .from('fm_fantasy_team')
    .select('id, league_competition_id, fm_league_competition!inner(fm_competition_id)')
    .eq('fm_league_competition.fm_competition_id', round.competition_id)
  if (teamsErr) throw new Error(`Teams load failed: ${teamsErr.message}`)

  const teamsByLega = new Map<string, string[]>()
  for (const t of allTeams ?? []) {
    const list = teamsByLega.get(t.league_competition_id) ?? []
    list.push(t.id)
    teamsByLega.set(t.league_competition_id, list)
  }

  // Lineup index by team for quick per-Lega lookup.
  const lineupByTeamId = new Map<string, (typeof lineups)[0]>()
  for (const l of lineups) lineupByTeamId.set(l.fantasy_team_id, l)

  // Scoring round window for full-tournament standings recompute later.
  const { data: scoredRounds, error: roundsErr } = await supabase
    .from('fm_scoring_round')
    .select('id')
    .eq('competition_id', round.competition_id)
    .in('status', ['scoring', 'published'])
  if (roundsErr) throw new Error(`Scored rounds load failed: ${roundsErr.message}`)
  const scoredRoundIds = (scoredRounds ?? []).map((r) => r.id)
  if (!scoredRoundIds.includes(roundId)) scoredRoundIds.push(roundId)

  let totalBrMatchupsWritten = 0
  let totalTeamsScored = 0
  let legaInstancesProcessed = 0

  // ============================================================
  // STEP 4: Per-Lega loop
  // ============================================================
  for (const [legaCompId, legaTeamIds] of teamsByLega) {
    const totalLegaTeams = legaTeamIds.length
    if (totalLegaTeams === 0) continue

    legaInstancesProcessed += 1

    // This Lega's own fantasy config drives the overlay (popularity penalty, MVP
    // bonus, BR thresholds/points, tie-breakers). Raw player/coach match scores
    // above stay on the shared global `config` so the same match yields the same
    // raw points everywhere; only the per-Lega overlay varies.
    const legaConfig = fmCompetitionConfigSchema.parse(
      await loadFMUnifiedConfigForLega(supabase, legaCompId)
    )

    // 4a. Ownership snapshot within this Lega.
    // Counts only players who ACTUALLY PLAYED (fielded = starters who played
    // + bench subs who came on). A benched player who never enters does not
    // count toward ownership. For each fielded player, count how many distinct
    // teams in THIS Lega fielded him, divided by total teams.
    const ownershipCounts = new Map<string, number>()
    for (const teamId of legaTeamIds) {
      const fielded = fieldedByTeam.get(teamId)
      if (!fielded) continue
      const fieldedIds = new Set<string>(fielded.map((f) => f.player_id))
      for (const pid of fieldedIds) {
        ownershipCounts.set(pid, (ownershipCounts.get(pid) ?? 0) + 1)
      }
    }

    const ownershipRows = [...ownershipCounts.entries()].map(([player_id, teams_owning]) => ({
      league_competition_id: legaCompId,
      scoring_round_id: roundId,
      player_id,
      teams_owning,
      teams_total: totalLegaTeams,
      ownership_pct: (teams_owning / totalLegaTeams) * 100,
    }))

    if (ownershipRows.length > 0) {
      const { error } = await supabase
        .from('fm_round_player_ownership')
        .upsert(ownershipRows, {
          onConflict: 'league_competition_id,scoring_round_id,player_id',
        })
      if (error) throw new Error(`Ownership upsert (lega ${legaCompId}) failed: ${error.message}`)
    }

    const ownershipPctByPlayer = new Map(
      ownershipRows.map((r) => [r.player_id, r.ownership_pct])
    )

    // 4b. Finalize each team's score using THIS Lega's ownership.
    const teamScores: ReturnType<typeof aggregateTeamRoundScore>[] = []

    for (const teamId of legaTeamIds) {
      const lineup = lineupByTeamId.get(teamId)
      const coachId = coachIdByTeamId.get(teamId)
      const coachFinalScore = coachId ? (coachTotalByCoachId.get(coachId) ?? 0) : 0

      if (!lineup) {
        // Team didn't submit — pad with zero so it still appears in standings.
        teamScores.push(
          aggregateTeamRoundScore({
            scoringRoundId: roundId,
            fantasyTeamId: teamId,
            playerFinalScores: [],
            coachFinalScore: 0,
            config: legaConfig,
          })
        )
        continue
      }

      // Score the fielded set: starters who played + bench subs who came on.
      // Empty slots (play short) simply contribute nothing.
      const fielded = fieldedByTeam.get(teamId) ?? []
      const playerFinalScores = fielded.flatMap((fp) => {
        const player = playerById.get(fp.player_id)
        if (!player) return []
        const match = matchByTeamId.get(player.national_team_id)
        if (!match) return []
        const raw = rawByKey.get(`${fp.player_id}:${match.id}`)
        if (!raw) return []

        // Immunità: a player fielded by exactly ONE team in this lega has his
        // card malus waived. Ownership is per-lega, so this is resolved here
        // (not in the global raw pass). Recompute his raw only when he was
        // actually booked — otherwise the global raw already matches.
        let rawSubtotal = raw.raw_subtotal
        if (config.immunita_enabled && (ownershipCounts.get(fp.player_id) ?? 0) === 1) {
          const stats = statsByKey.get(`${fp.player_id}:${match.id}`)
          if (stats && (stats.yellow_cards > 0 || stats.red_cards > 0)) {
            rawSubtotal = scorePlayerRaw(
              buildInput(fp.player_id, player.role as FMEnginePlayerInput['role'], player.national_team_id, match, stats),
              config,
              { immunitaGranted: true },
            ).raw_subtotal
          }
        }

        const own = ownershipPctByPlayer.get(fp.player_id) ?? 0
        const { final_score } = finalizePlayerForLega(
          { raw_subtotal: rawSubtotal, is_mvp: raw.is_mvp },
          own,
          legaConfig,
        )
        return [final_score]
      })

      teamScores.push(
        aggregateTeamRoundScore({
          scoringRoundId: roundId,
          fantasyTeamId: teamId,
          playerFinalScores,
          coachFinalScore,
          config: legaConfig,
        })
      )
    }

    totalTeamsScored += teamScores.length

    const teamScoreRows = teamScores.map((ts) => ({
      scoring_round_id: ts.scoring_round_id,
      fantasy_team_id: ts.fantasy_team_id,
      player_total: ts.player_total,
      coach_total: ts.coach_total,
      raw_total: ts.raw_total,
      goals_scored: ts.goals_scored,
      br_wins: 0,
      br_draws: 0,
      br_losses: 0,
      br_points: 0,
    }))

    if (teamScoreRows.length > 0) {
      const { error } = await supabase
        .from('fm_fantasy_team_round_score')
        .upsert(teamScoreRows, { onConflict: 'scoring_round_id,fantasy_team_id' })
      if (error) throw new Error(`Team score upsert (lega ${legaCompId}) failed: ${error.message}`)
    }

    // 4c. Battle Royale within this Lega only.
    const matchups = computeBattleRoyale(teamScores, roundId, legaCompId, legaConfig)

    const matchupRows = matchups.map((m) => ({
      league_competition_id: m.league_competition_id,
      scoring_round_id: m.scoring_round_id,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      team_a_score: m.team_a_score,
      team_b_score: m.team_b_score,
      team_a_goals: m.team_a_goals,
      team_b_goals: m.team_b_goals,
      result: m.result,
      team_a_points: m.team_a_points,
      team_b_points: m.team_b_points,
    }))

    if (matchupRows.length > 0) {
      const { error } = await supabase
        .from('fm_battle_royale_matchup')
        .upsert(matchupRows, {
          onConflict: 'league_competition_id,scoring_round_id,team_a_id,team_b_id',
        })
      if (error) throw new Error(`BR matchup upsert (lega ${legaCompId}) failed: ${error.message}`)
    }
    totalBrMatchupsWritten += matchupRows.length

    // 4d. Tally per-team BR into fm_fantasy_team_round_score.
    const brByTeam = new Map<
      string,
      { br_wins: number; br_draws: number; br_losses: number; br_points: number }
    >()
    const ensureBr = (teamId: string) => {
      if (!brByTeam.has(teamId)) {
        brByTeam.set(teamId, { br_wins: 0, br_draws: 0, br_losses: 0, br_points: 0 })
      }
      return brByTeam.get(teamId)!
    }
    for (const m of matchups) {
      const a = ensureBr(m.team_a_id)
      const b = ensureBr(m.team_b_id)
      a.br_points += m.team_a_points
      b.br_points += m.team_b_points
      if (m.result === 'home_win') {
        a.br_wins += 1
        b.br_losses += 1
      } else if (m.result === 'away_win') {
        a.br_losses += 1
        b.br_wins += 1
      } else {
        a.br_draws += 1
        b.br_draws += 1
      }
    }
    for (const [teamId, br] of brByTeam) {
      const { error } = await supabase
        .from('fm_fantasy_team_round_score')
        .update(br)
        .eq('scoring_round_id', roundId)
        .eq('fantasy_team_id', teamId)
      if (error) throw new Error(`BR update failed for team ${teamId}: ${error.message}`)
    }

    // 4e. Standings recompute for THIS Lega only (across all scored rounds).
    const legaTeamIdSet = new Set(legaTeamIds)
    const { data: legaRoundScores, error: allTsErr } = await supabase
      .from('fm_fantasy_team_round_score')
      .select('fantasy_team_id, raw_total, br_wins, br_draws, br_losses, br_points')
      .in('scoring_round_id', scoredRoundIds)
      .in('fantasy_team_id', legaTeamIds)
    if (allTsErr) throw new Error(`Lega round scores load failed: ${allTsErr.message}`)

    type StandingAgg = {
      br_points_total: number
      raw_score_total: number
      round_wins: number
      best_round_score: number
    }
    const aggByTeam = new Map<string, StandingAgg>()
    for (const teamId of legaTeamIds) {
      aggByTeam.set(teamId, {
        br_points_total: 0,
        raw_score_total: 0,
        round_wins: 0,
        best_round_score: 0,
      })
    }
    for (const ts of legaRoundScores ?? []) {
      if (!legaTeamIdSet.has(ts.fantasy_team_id)) continue
      const agg = aggByTeam.get(ts.fantasy_team_id)
      if (!agg) continue
      const rawTotal = Number(ts.raw_total)
      agg.br_points_total += ts.br_points
      agg.raw_score_total += rawTotal
      agg.round_wins += ts.br_wins
      agg.best_round_score = Math.max(agg.best_round_score, rawTotal)
    }

    const rankedLega = [...aggByTeam.entries()].sort(([, a], [, b]) => {
      if (b.br_points_total !== a.br_points_total) return b.br_points_total - a.br_points_total
      return b.raw_score_total - a.raw_score_total
    })

    const standingRows = rankedLega.map(([fantasyTeamId, agg], idx) => ({
      league_competition_id: legaCompId,
      fantasy_team_id: fantasyTeamId,
      br_points_total: agg.br_points_total,
      raw_score_total: agg.raw_score_total,
      round_wins: agg.round_wins,
      best_round_score: agg.best_round_score,
      rank: idx + 1,
      computed_at: new Date().toISOString(),
    }))

    if (standingRows.length > 0) {
      const { error } = await supabase
        .from('fm_competition_standing')
        .upsert(standingRows, { onConflict: 'league_competition_id,fantasy_team_id' })
      if (error) throw new Error(`Standing upsert (lega ${legaCompId}) failed: ${error.message}`)
    }
  }

  return {
    teamsScored: totalTeamsScored,
    playerScoresWritten: playerScoreRows.length,
    coachScoresWritten: coachScoreRows.length,
    brMatchupsWritten: totalBrMatchupsWritten,
    legaInstancesProcessed,
  }
}
