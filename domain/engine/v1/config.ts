// ============================================================
// CONTROFANTA — Rating Engine v3.1 — Config
// ============================================================
// Pivot + Bonus + Ownership/MVP. Identical structure on FM
// (domain/fantamondiale/config/defaults.ts).
//
// Defaults map SportMonks 6.50 (kickoff baseline) → voto 6.00.
// Trademark: popularity penalty + MVP bonus, capped at 50% each,
// applied with calc_order 'penalty_then_mvp' (compound, B option).
// ============================================================

import type { EngineConfig, OwnershipBracket } from './types'
import type { LeagueEngineConfig, Json } from '@/types/database.types'

const DEFAULT_POPULARITY_BRACKETS: OwnershipBracket[] = [
  { min_pct:  0, max_pct:  10, pct:  0 },
  { min_pct: 11, max_pct:  25, pct: 10 },
  { min_pct: 26, max_pct:  50, pct: 25 },
  { min_pct: 51, max_pct:  75, pct: 40 },
  { min_pct: 76, max_pct: 100, pct: 50 },
]

const DEFAULT_MVP_BONUS_BRACKETS: OwnershipBracket[] = [
  { min_pct:  0, max_pct:  10, pct: 50 },
  { min_pct: 11, max_pct:  25, pct: 40 },
  { min_pct: 26, max_pct:  50, pct: 25 },
  { min_pct: 51, max_pct:  75, pct: 15 },
  { min_pct: 76, max_pct: 100, pct:  5 },
]

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engine_version: 'v3.1',

  pivot_rating: 6.50,
  pivot_vote:   6.00,

  voto_min: 1.0,
  voto_max: 10.0,

  minutes_min_for_voto: 15,
  base_score: 6.0,

  // Official, user-confirmed standard (2026-06-10): flat +3 goal for every
  // role, GK-only clean sheet / goals-conceded, thresholds from 10'.
  bonus_malus: {
    goal_by_role: {
      GK:  3.0,
      DEF: 3.0,
      MID: 3.0,
      ATT: 3.0,
    },
    penalty_scored_discount: 0,
    assist:         1.0,
    own_goal:      -1.0,
    yellow_card:   -0.5,
    red_card:      -1.0,
    penalty_missed: -3.0,
    penalty_saved:  1.5,
    clean_sheet_by_role: {
      GK:  1.0,
      DEF: 0,
    },
    clean_sheet_min_minutes: 10,
    goals_conceded_by_role: {
      GK:  -1.0,
      DEF: 0,
    },
    goals_conceded_def_min_minutes: 10,
    brace_bonus:    0.5,
    hat_trick_bonus: 1.0,
  },

  popularity_brackets: DEFAULT_POPULARITY_BRACKETS,
  mvp_bonus_brackets:  DEFAULT_MVP_BONUS_BRACKETS,
  calc_order: 'penalty_then_mvp',
}

export function deriveSlope(cfg: EngineConfig): number {
  const denom = cfg.voto_max - cfg.pivot_rating
  if (denom <= 0) return 1
  return (cfg.voto_max - cfg.pivot_vote) / denom
}

// ---- DB bracket parsing -----------------------------------

function parseBrackets(value: Json | null | undefined, fallback: OwnershipBracket[]): OwnershipBracket[] {
  if (!value || !Array.isArray(value)) return fallback
  const out: OwnershipBracket[] = []
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).min_pct === 'number' &&
      typeof (item as Record<string, unknown>).max_pct === 'number' &&
      typeof (item as Record<string, unknown>).pct     === 'number'
    ) {
      const o = item as Record<string, number>
      out.push({ min_pct: o.min_pct!, max_pct: o.max_pct!, pct: o.pct! })
    }
  }
  return out.length > 0 ? out : fallback
}

/**
 * Build a per-league engine config from a DB row.
 * Falls back to DEFAULT_ENGINE_CONFIG when dbConfig is null.
 */
export function buildEngineConfig(
  dbConfig: LeagueEngineConfig | null
): EngineConfig {
  const base = DEFAULT_ENGINE_CONFIG
  if (!dbConfig) return base

  const calcOrder = (dbConfig.calc_order === 'mvp_then_penalty' || dbConfig.calc_order === 'penalty_then_mvp')
    ? dbConfig.calc_order
    : base.calc_order

  return {
    ...base,
    pivot_rating: dbConfig.pivot_rating ?? base.pivot_rating,
    pivot_vote:   dbConfig.pivot_vote   ?? base.pivot_vote,
    bonus_malus: {
      ...base.bonus_malus,
      goal_by_role: {
        GK:  dbConfig.goal_bonus_gk,
        DEF: dbConfig.goal_bonus_def,
        MID: dbConfig.goal_bonus_mid,
        ATT: dbConfig.goal_bonus_att,
      },
      penalty_scored_discount: dbConfig.penalty_scored_discount,
      brace_bonus:             dbConfig.brace_bonus,
      hat_trick_bonus:         dbConfig.hat_trick_bonus,
      assist:                  dbConfig.assist,
      own_goal:                dbConfig.own_goal,
      yellow_card:             dbConfig.yellow_card,
      red_card:                dbConfig.red_card,
      penalty_missed:          dbConfig.penalty_missed,
      penalty_saved:           dbConfig.penalty_saved,
      clean_sheet_by_role: {
        GK:  dbConfig.clean_sheet_gk,
        DEF: dbConfig.clean_sheet_def,
      },
      clean_sheet_min_minutes:        dbConfig.clean_sheet_min_minutes,
      goals_conceded_by_role: {
        GK:  dbConfig.goals_conceded_gk,
        DEF: dbConfig.goals_conceded_def,
      },
      goals_conceded_def_min_minutes: dbConfig.goals_conceded_def_min_minutes,
    },
    popularity_brackets: parseBrackets(dbConfig.popularity_brackets, base.popularity_brackets),
    mvp_bonus_brackets:  parseBrackets(dbConfig.mvp_bonus_brackets,  base.mvp_bonus_brackets),
    calc_order: calcOrder,
  }
}
