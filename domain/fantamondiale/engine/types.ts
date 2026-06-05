import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'

// ---- inputs ----------------------------------------------------------------

export type FMEnginePlayerInput = {
  playerId: string
  role: 'P' | 'D' | 'C' | 'A'
  nationalTeamId: string
  stats: {
    minutes_played: number
    rating: number | null
    goals: number
    /** Subset of `goals` that came from penalty kicks. */
    penalties_scored: number
    assists: number
    yellow_cards: number
    red_cards: number
    penalties_saved: number
    penalties_missed: number
    own_goals: number
    goals_conceded: number
    is_mvp: boolean
  }
  matchContext: {
    real_match_id: string
    scoring_round_id: string
    home_team_id: string
    away_team_id: string
    home_score: number
    away_score: number
  }
}

export type FMEngineCoachInput = {
  coachId: string
  nationalTeamId: string
  tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
  /**
   * Opponent's frozen tier. Required for opponent-relative knockout
   * scoring; null in the group stage (or if it can't be resolved, in
   * which case scoring falls back to the absolute group matrix).
   */
  opponentTier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4' | null
  /** True for any non-group phase — selects the opponent-relative matrix. */
  isKnockout: boolean
  matchContext: {
    real_match_id: string
    scoring_round_id: string
    home_team_id: string
    away_team_id: string
    home_score: number
    away_score: number
  }
}

// ---- outputs ---------------------------------------------------------------

// Lega-agnostic per-(player, match) row. Popularity penalty and MVP bonus
// are not part of this output — they depend on which Lega's ownership applies
// to the player, and are computed at team-aggregation time via
// `finalizePlayerForLega`.
export type FMPlayerMatchScoreResult = {
  scoring_round_id: string
  real_match_id: string
  player_id: string
  base_rating: number | null
  z_rating: number | null
  voto_base: number | null
  football_bonus: number
  football_malus: number
  raw_subtotal: number
  is_mvp: boolean
  calc_snapshot: FMCompetitionConfig
}

// Per-Lega finalization: takes a player's raw subtotal + MVP flag and applies
// THIS Lega's ownership-derived popularity penalty and MVP bonus.
export type FMPlayerLegaFinalScore = {
  popularity_penalty_pct: number
  popularity_penalty_amount: number
  mvp_bonus_pct: number
  mvp_bonus_amount: number
  final_score: number
}

export type FMCoachMatchScoreResult = {
  scoring_round_id: string
  real_match_id: string
  coach_id: string
  team_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
  match_result: 'home_win' | 'draw' | 'away_win'
  bonus_or_malus: number
  final_score: number
  calc_snapshot: FMCompetitionConfig
}

export type FMTeamRoundScoreResult = {
  scoring_round_id: string
  fantasy_team_id: string
  player_total: number
  coach_total: number
  raw_total: number
  goals_scored: number
}

export type FMBattleRoyaleMatchupResult = {
  league_competition_id: string
  scoring_round_id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  team_a_goals: number
  team_b_goals: number
  result: 'home_win' | 'draw' | 'away_win'
  team_a_points: number
  team_b_points: number
}
