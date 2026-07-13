import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'
import type { FMTeamRoundScoreResult, FMBattleRoyaleMatchupResult } from './types'

export function computeBattleRoyale(
  teamScores: FMTeamRoundScoreResult[],
  scoringRoundId: string,
  legaCompetitionId: string,
  config: FMCompetitionConfig,
): FMBattleRoyaleMatchupResult[] {
  const { win_points, draw_points, loss_points, round_points_multipliers } = config.battle_royale
  // Per-round stake multiplier (e.g. Finale ×2). Applied to the points of
  // every pairwise matchup in the round; W/D/L records are unaffected.
  const mult = round_points_multipliers?.[scoringRoundId] ?? 1
  const matchups: FMBattleRoyaleMatchupResult[] = []

  for (let i = 0; i < teamScores.length; i++) {
    for (let j = i + 1; j < teamScores.length; j++) {
      const teamA = teamScores[i]!
      const teamB = teamScores[j]!

      // Ensure lexicographic order (team_a_id < team_b_id) as required by DB constraint
      const [a, b] = teamA.fantasy_team_id < teamB.fantasy_team_id
        ? [teamA, teamB]
        : [teamB, teamA]

      const a_goals = a.goals_scored
      const b_goals = b.goals_scored
      const a_score = a.raw_total
      const b_score = b.raw_total

      let result: 'home_win' | 'draw' | 'away_win'
      let a_points: number
      let b_points: number

      if (a_goals > b_goals) {
        result = 'home_win'
        a_points = win_points * mult
        b_points = loss_points * mult
      } else if (a_goals < b_goals) {
        result = 'away_win'
        a_points = loss_points * mult
        b_points = win_points * mult
      } else {
        result = 'draw'
        a_points = draw_points * mult
        b_points = draw_points * mult
      }

      matchups.push({
        league_competition_id: legaCompetitionId,
        scoring_round_id: scoringRoundId,
        team_a_id: a.fantasy_team_id,
        team_b_id: b.fantasy_team_id,
        team_a_score: a_score,
        team_b_score: b_score,
        team_a_goals: a_goals,
        team_b_goals: b_goals,
        result,
        team_a_points: a_points,
        team_b_points: b_points,
      })
    }
  }

  return matchups
}

export type StandingDelta = {
  fantasy_team_id: string
  br_points_delta: number
  raw_score_delta: number
  round_wins_delta: number
  mvp_bonus_delta: number
  popularity_penalty_delta: number
  best_round_score: number
}

export function computeStandingDeltas(
  matchups: FMBattleRoyaleMatchupResult[],
  teamScores: FMTeamRoundScoreResult[],
  mvpBonusByTeam: Map<string, number>,
  popularityPenaltyByTeam: Map<string, number>,
): StandingDelta[] {
  const byTeam = new Map<string, StandingDelta>()

  const ensure = (teamId: string) => {
    if (!byTeam.has(teamId)) {
      byTeam.set(teamId, {
        fantasy_team_id: teamId,
        br_points_delta: 0,
        raw_score_delta: 0,
        round_wins_delta: 0,
        mvp_bonus_delta: 0,
        popularity_penalty_delta: 0,
        best_round_score: 0,
      })
    }
    return byTeam.get(teamId)!
  }

  for (const m of matchups) {
    const a = ensure(m.team_a_id)
    const b = ensure(m.team_b_id)
    a.br_points_delta += m.team_a_points
    b.br_points_delta += m.team_b_points
    if (m.result === 'home_win') a.round_wins_delta += 1
    if (m.result === 'away_win') b.round_wins_delta += 1
  }

  for (const ts of teamScores) {
    const delta = ensure(ts.fantasy_team_id)
    delta.raw_score_delta = ts.raw_total
    delta.best_round_score = ts.raw_total
    delta.mvp_bonus_delta = mvpBonusByTeam.get(ts.fantasy_team_id) ?? 0
    delta.popularity_penalty_delta = popularityPenaltyByTeam.get(ts.fantasy_team_id) ?? 0
  }

  return [...byTeam.values()]
}
