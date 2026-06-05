// ============================================================
// CONTROFANTA — Rating Engine v3.1 — Types
// ============================================================
// Single-source: SportMonks. "Pivot + Bonus + Ownership/MVP" engine.
//
// Per-player pipeline:
//   voto_base    = clamp( pivot_vote + slope×(rating−pivot_rating), 1, 10 )
//   raw_subtotal = voto_base + football_bonus − football_malus    (no clamp)
//   penalty      = |raw_subtotal| × popularity_pct/100
//   final/fantavoto = (raw_subtotal − penalty) × (1 + mvp_pct/100) (no clamp)
// ============================================================

import type { RatingClass } from '@/types/database.types'

// ---- Input -------------------------------------------------

/** All data the engine needs for a single player. */
export interface EnginePlayerInput {
  player_id: string
  stats_id: string
  rating_class: RatingClass
  minutes_played: number
  is_provisional: boolean

  /** SportMonks rating — null when source hasn't published yet. */
  rating: number | null

  // Event counts
  goals_scored: number        // includes penalties_scored
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number    // subset of goals_scored
  penalties_missed: number
  penalties_saved: number     // GK only in practice
  clean_sheet: boolean
  goals_conceded: number

  /** True if this player had the highest SportMonks rating in their match. */
  is_mvp: boolean

  /** Frozen at lineup deadline. 0 if no snapshot yet (engine skips MVP/penalty). */
  ownership_pct: number

  /**
   * When true, card malus (yellow + red) is waived for this player.
   * Set by the engine orchestrator when the player appears in exactly one
   * effective lineup across all teams in the league for this matchday.
   */
  immunita_granted?: boolean
}

// ---- Config types ------------------------------------------

export interface BonusMalusConfig {
  goal_by_role: Record<RatingClass, number>
  penalty_scored_discount: number
  assist: number
  own_goal: number
  yellow_card: number
  red_card: number
  penalty_missed: number
  penalty_saved: number
  clean_sheet_by_role: Partial<Record<RatingClass, number>>
  clean_sheet_min_minutes: number
  goals_conceded_by_role: Partial<Record<RatingClass, number>>
  goals_conceded_def_min_minutes: number
  brace_bonus: number
  hat_trick_bonus: number
}

/** Ownership-band ladder for MVP bonus / popularity penalty. */
export interface OwnershipBracket {
  min_pct: number
  max_pct: number
  /** Penalty/bonus as a percentage of |raw_subtotal|. */
  pct: number
}

export type CalcOrder = 'mvp_then_penalty' | 'penalty_then_mvp'

export interface EngineConfig {
  engine_version: string

  /** Pivot anchors for the rating → voto_base line. */
  pivot_rating: number
  pivot_vote: number

  /** Hard bounds for voto_base (NOT for final fantavoto). */
  voto_min: number
  voto_max: number

  /** Below this minute count the rating is discarded (s.v. rule). */
  minutes_min_for_voto: number

  /** Baseline used when a decisive event fires for a <min-minutes player. */
  base_score: number

  bonus_malus: BonusMalusConfig

  /** Trademark trio — identical structure on FM. */
  popularity_brackets: OwnershipBracket[]
  mvp_bonus_brackets: OwnershipBracket[]
  calc_order: CalcOrder
}

// ---- BM item -----------------------------------------------

export interface BonusMalusItem {
  label: string
  quantity: number
  points_each: number
  total: number
}

// ---- Output ------------------------------------------------

export interface PlayerCalculationResult {
  kind: 'scored'
  player_id: string
  stats_id: string
  is_provisional: boolean

  decisive_event_exception: boolean
  no_ratings_exception: boolean

  /** Rating-derived voto, clamped 1–10. */
  voto_base: number

  bonus_malus_breakdown: BonusMalusItem[]
  total_bonus_malus: number

  /** voto_base + bonus − malus. NOT clamped. */
  raw_subtotal: number

  /** Frozen ownership % at lineup deadline (0 if no snapshot yet). */
  ownership_pct: number

  /** MVP bonus, looked up from mvp_bonus_brackets. 0 if not MVP. */
  mvp_bonus_pct: number
  mvp_bonus_amount: number

  /** Popularity penalty, looked up from popularity_brackets. Always applies. */
  popularity_penalty_pct: number
  popularity_penalty_amount: number

  /**
   * Final fantavoto = (raw_subtotal − popularity_penalty) × (1 + mvp_bonus/100)
   * No clamp — can exceed voto_max or go negative.
   */
  fantavoto: number
}

export interface PlayerSkipped {
  kind: 'skipped'
  player_id: string
  stats_id: string
  is_provisional: boolean
  reason: 'NV'
}

export type PlayerEngineOutput = PlayerCalculationResult | PlayerSkipped

export interface MatchdayEngineResult {
  engine_version: string
  player_results: PlayerEngineOutput[]
  scored_count: number
  skipped_count: number
}
