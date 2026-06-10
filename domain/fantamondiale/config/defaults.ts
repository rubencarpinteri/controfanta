// ============================================================
// FantaMondiale Statistico — Default Competition Config
// ============================================================
// Defaults for the 2026 WC competition.
//
// Player rating engine is the v3.0 "Pivot + Bonus" engine,
// aligned 1:1 with the Serie A engine: SportMonks 6.50 (kickoff
// baseline) → voto 6.00 (Italian sufficienza); (10, 10) anchor
// implicit. The < 15 min rule with decisive-event exception is
// identical.
//
// FM-specific game mechanics (MVP brackets, popularity penalties,
// coach tier matrix, Battle Royale thresholds) stay separate and
// apply after the rating → voto_base step.
// ============================================================

import type {
  FMCompetitionConfig,
  FMBracket,
  FMEngineConfig,
} from './schema'
import { DEFAULT_COACH_KNOCKOUT_MATRIX } from './schema'

const DEFAULT_ENGINE: FMEngineConfig = {
  pivot_rating: 6.50,
  pivot_vote:   6.00,
  voto_min:     1.0,
  voto_max:     10.0,
  minutes_min_for_voto: 15,
  base_score:   6.0,
}

// 6 ownership bands. Top cap 70%. More punishing at high ownership to match
// the 300-credit economy (more top players affordable → popularity must bite).
const DEFAULT_POPULARITY_BRACKETS: FMBracket[] = [
  { min_pct:  0, max_pct:  10, pct:  0 },
  { min_pct: 11, max_pct:  25, pct: 30 },
  { min_pct: 26, max_pct:  45, pct: 40 },
  { min_pct: 46, max_pct:  65, pct: 50 },
  { min_pct: 66, max_pct:  80, pct: 60 },
  { min_pct: 81, max_pct: 100, pct: 70 },
]

// Inverse: rarer MVP picks get bigger bonuses. Mirrors the 6-band PP curve.
const DEFAULT_MVP_BRACKETS: FMBracket[] = [
  { min_pct:  0, max_pct:  10, pct: 70 },
  { min_pct: 11, max_pct:  25, pct: 60 },
  { min_pct: 26, max_pct:  45, pct: 50 },
  { min_pct: 46, max_pct:  65, pct: 40 },
  { min_pct: 66, max_pct:  80, pct: 30 },
  { min_pct: 81, max_pct: 100, pct:  0 },
]

export const DEFAULT_FM_CONFIG: FMCompetitionConfig = {
  schema_version: 1,

  squad: {
    pool_size: 25,
    starters: 11,
    bench: 14,
    budget_default: 300,
    role_quotas: { P: 3, D: 8, C: 8, A: 6 },
  },

  substitution: {
    trigger: 'min_minutes',
    min_minutes: 15,
  },

  formations: [
    '3-4-3',
    '3-5-2',
    '4-3-3',
    '4-4-2',
    '4-5-1',
    '5-3-2',
    '5-4-1',
  ],

  // Serie A-aligned football B/M values.
  football: {
    // Flat goal = 2.0 (double the assist). Matches the live engine config,
    // which flattened the old per-role goal curve.
    goal: { P: 2.0, D: 2.0, C: 2.0, A: 2.0 },
    penalty_scored_discount: 0.3,
    assist: 1.0,
    clean_sheet: { P: 0.8, D: 0.5, min_minutes: 60 },
    penalty_saved: 2.0,
    penalty_missed: -3.0,
    yellow_card: -0.3,
    red_card: -1.5,
    own_goal: -1.5,
    goals_conceded: { P: -0.4, D: -0.15, def_min_minutes: 60 },
    brace_bonus: 0.5,
    hat_trick_bonus: 1.0,
  },

  popularity_brackets: DEFAULT_POPULARITY_BRACKETS,
  mvp_bonus_brackets: DEFAULT_MVP_BRACKETS,

  coach_tier_matrix: {
    tier_1: { win:  1, draw: -1, loss: -3 },
    tier_2: { win:  2, draw:  0, loss: -2 },
    tier_3: { win:  4, draw:  2, loss: -1 },
    tier_4: { win:  6, draw:  3, loss:  0 },
  },

  coach_tier_knockout_matrix: DEFAULT_COACH_KNOCKOUT_MATRIX,

  // Knockout has no draw by default: the team that advances scores a win and
  // the eliminated side a loss, however the tie was decided (90', ET, or
  // penalties). Admins can flip a competition back to 'draw' to score the
  // penalty-shootout case on its own column.
  coach_knockout_draw_mode: 'advancer_wins',

  tie_breakers: [
    'br_points',
    'raw_score',
    'round_wins',
    'fewest_penalties',
    'mvp_bonuses',
    'best_single_round',
  ],

  calc_order: 'mvp_then_penalty',

  engine: DEFAULT_ENGINE,

  battle_royale: {
    // Same threshold structure as Serie A engine: 66 = 1 goal,
    // +6 per additional goal. Tuned for ~25-player squad totals
    // landing in the 50–100 range.
    goal_thresholds: [66, 72, 78, 84, 90, 96, 102, 108],
    win_points: 3,
    draw_points: 1,
    loss_points: 0,
  },

  immunita_enabled: true,
}
