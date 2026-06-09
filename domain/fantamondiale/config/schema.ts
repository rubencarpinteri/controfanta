// ============================================================
// FantaMondiale Statistico — Competition Config (Zod schema)
// ============================================================
// The entire rule engine is driven by a single JSONB document
// stored in fm_competition_config.config. This file defines the
// authoritative shape via Zod.
//
// Every value an admin can tune lives here:
//   * squad & budget defaults
//   * allowed formations
//   * football bonuses/maluses (P/D/C/A)
//   * popularity penalty brackets
//   * MVP bonus brackets
//   * coach tier matrix
//   * tie-breaker order
//   * calculation order (MVP vs penalty)
//   * Engine v2.0 normalization (mean/std/etc.)
//   * BR raw-score → goal thresholds
// ============================================================

import { z } from 'zod'

// ---- shared sub-schemas ------------------------------------

export const fmPlayerRoleSchema = z.enum(['P', 'D', 'C', 'A'])
export type FMPlayerRole = z.infer<typeof fmPlayerRoleSchema>

export const fmTeamTierSchema = z.enum(['tier_1', 'tier_2', 'tier_3', 'tier_4'])
export type FMTeamTier = z.infer<typeof fmTeamTierSchema>

export const fmBudgetModeSchema = z.enum(['fixed', 'reward_leaders', 'comeback'])
export type FMBudgetMode = z.infer<typeof fmBudgetModeSchema>

export const fmCalcOrderSchema = z.enum(['mvp_then_penalty', 'penalty_then_mvp'])
export type FMCalcOrder = z.infer<typeof fmCalcOrderSchema>

/**
 * How a level knockout tie (decided on penalties) scores the coach bonus:
 *   - 'draw':          the tie uses the `draw` column of the knockout matrix.
 *   - 'advancer_wins': there is no draw — the team that advanced (or won the
 *                      title) scores as a `win`, the other as a `loss`. The
 *                      advancer comes from the recorded match result, populated
 *                      from the SportMonks winner flag at ingest.
 */
export const fmKnockoutDrawModeSchema = z.enum(['draw', 'advancer_wins'])
export type FMKnockoutDrawMode = z.infer<typeof fmKnockoutDrawModeSchema>

export const fmTieBreakerSchema = z.enum([
  'br_points',
  'raw_score',
  'round_wins',
  'fewest_penalties',
  'mvp_bonuses',
  'best_single_round',
])
export type FMTieBreaker = z.infer<typeof fmTieBreakerSchema>

// ---- squad & budget ----------------------------------------

export const fmRoleQuotaSchema = z.object({
  P: z.number().int().min(0).max(10),
  D: z.number().int().min(0).max(15),
  C: z.number().int().min(0).max(15),
  A: z.number().int().min(0).max(15),
})
export type FMRoleQuota = z.infer<typeof fmRoleQuotaSchema>

export const fmSquadConfigSchema = z.object({
  pool_size: z.number().int().min(11).max(40),
  starters: z.number().int().min(7).max(11),
  bench: z.number().int().min(0).max(30),
  budget_default: z.number().int().min(50).max(10_000),
  role_quotas: fmRoleQuotaSchema,
}).refine(
  (s) => s.role_quotas.P + s.role_quotas.D + s.role_quotas.C + s.role_quotas.A === s.pool_size,
  { message: 'role_quotas P+D+C+A must equal pool_size', path: ['role_quotas'] },
)
export type FMSquadConfig = z.infer<typeof fmSquadConfigSchema>

// ---- formations --------------------------------------------

export const fmFormationListSchema = z.array(
  z.string().regex(/^\d-\d-\d$/, 'expected "X-Y-Z" format'),
).min(1)

// ---- substitution rule -------------------------------------

/**
 * Bench substitution rule. The chosen module is absolute (never reshapes);
 * a titolare who "doesn't play" is replaced by the first same-role bench
 * player in bench order. No cross-role fallback — same-role bench exhausted
 * means the slot stays empty and the team plays short.
 *
 * `trigger` decides WHEN a starter is considered "didn't play":
 *   - 'min_minutes': minutes_played < min_minutes (default 15)
 *   - 'no_rating':   the starter has no usable rating (s.v.)
 */
export const fmSubstitutionConfigSchema = z.object({
  trigger: z.enum(['min_minutes', 'no_rating']).default('min_minutes'),
  /** Used only when trigger === 'min_minutes'. */
  min_minutes: z.number().int().min(0).max(90).default(15),
})
export type FMSubstitutionConfig = z.infer<typeof fmSubstitutionConfigSchema>

// ---- football bonuses / maluses (Serie A-aligned) ----------

export const fmFootballScoringSchema = z.object({
  /** Per-role goal bonus (regular goal). Penalty goal = goal[role] − penalty_scored_discount. */
  goal: z.object({
    P: z.number(),
    D: z.number(),
    C: z.number(),
    A: z.number(),
  }),
  /** Subtracted from goal[role] for each penalty scored. */
  penalty_scored_discount: z.number(),
  assist: z.number(),
  /** Per-role clean sheet bonus; applies when minutes >= clean_sheet.min_minutes. */
  clean_sheet: z.object({
    P: z.number(),
    D: z.number(),
    min_minutes: z.number().int().min(0).max(120),
  }),
  /** GK only. */
  penalty_saved: z.number(),
  penalty_missed: z.number(),
  yellow_card: z.number(),
  red_card: z.number(),
  own_goal: z.number(),
  /** Per-role goals-conceded malus. GK always; DEF only if minutes >= def_min_minutes. */
  goals_conceded: z.object({
    P: z.number(),
    D: z.number(),
    def_min_minutes: z.number().int().min(0).max(120),
  }),
  brace_bonus: z.number(),
  hat_trick_bonus: z.number(),
})
export type FMFootballScoring = z.infer<typeof fmFootballScoringSchema>

// ---- popularity penalty + MVP bonus brackets ---------------

export const fmBracketSchema = z.object({
  min_pct: z.number().min(0).max(100),
  max_pct: z.number().min(0).max(100),
  /** Penalty/bonus expressed as a percentage of the player's raw subtotal. */
  pct: z.number(),
})
export type FMBracket = z.infer<typeof fmBracketSchema>

export const fmBracketsSchema = z.array(fmBracketSchema).min(1)

// ---- coach tier matrix -------------------------------------

export const fmCoachTierMatrixSchema = z.object({
  tier_1: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_2: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_3: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_4: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
})
export type FMCoachTierMatrix = z.infer<typeof fmCoachTierMatrixSchema>

// ---- coach knockout matrix (opponent-relative) -------------
//
// From the round of 32 onward, a coach's bonus/malus no longer
// depends on their own (frozen) tier alone but on *favoredness*:
//
//   favoredness = opponentTierNumber − ownTierNumber   (−3 … +3)
//
// where tier_1 = 1 (strongest) … tier_4 = 4 (weakest). So a tier_1
// coach facing tier_4 is +3 (max favorite); a tier_4 facing tier_1
// is −3 (max underdog); same tier is 0 (coin flip). Favorites earn
// little for winning and are punished hard for losing; underdogs the
// reverse. `draw` applies when the tie is decided on penalties.
const fmWinDrawLoss = z.object({ win: z.number(), draw: z.number(), loss: z.number() })

export const fmCoachKnockoutMatrixSchema = z.object({
  fav_pos3: fmWinDrawLoss,
  fav_pos2: fmWinDrawLoss,
  fav_pos1: fmWinDrawLoss,
  fav_even: fmWinDrawLoss,
  fav_neg1: fmWinDrawLoss,
  fav_neg2: fmWinDrawLoss,
  fav_neg3: fmWinDrawLoss,
})
export type FMCoachKnockoutMatrix = z.infer<typeof fmCoachKnockoutMatrixSchema>

export const DEFAULT_COACH_KNOCKOUT_MATRIX: FMCoachKnockoutMatrix = {
  fav_pos3: { win: 0, draw: -2, loss: -4 },
  fav_pos2: { win: 1, draw: -1, loss: -3 },
  fav_pos1: { win: 2, draw:  0, loss: -2 },
  fav_even: { win: 3, draw:  1, loss: -1 },
  fav_neg1: { win: 4, draw:  2, loss:  0 },
  fav_neg2: { win: 5, draw:  3, loss:  1 },
  fav_neg3: { win: 6, draw:  3, loss:  1 },
}

/** Maps a favoredness integer (−3 … +3) to its matrix key. */
export function favorednessKey(favoredness: number): keyof FMCoachKnockoutMatrix {
  if (favoredness >= 3) return 'fav_pos3'
  if (favoredness === 2) return 'fav_pos2'
  if (favoredness === 1) return 'fav_pos1'
  if (favoredness === 0) return 'fav_even'
  if (favoredness === -1) return 'fav_neg1'
  if (favoredness === -2) return 'fav_neg2'
  return 'fav_neg3'
}

const TIER_NUMBER: Record<'tier_1' | 'tier_2' | 'tier_3' | 'tier_4', number> = {
  tier_1: 1, tier_2: 2, tier_3: 3, tier_4: 4,
}

/** favoredness = opponentTierNumber − ownTierNumber, clamped to [−3, 3]. */
export function computeFavoredness(
  ownTier: keyof typeof TIER_NUMBER,
  opponentTier: keyof typeof TIER_NUMBER,
): number {
  return TIER_NUMBER[opponentTier] - TIER_NUMBER[ownTier]
}

// ---- Engine v3.0 — Pivot + Bonus (aligned with Serie A) ---

/**
 * Player rating engine. Same architecture as the Serie A engine:
 *   voto_base = pivot_vote + slope × (rating − pivot_rating)
 *   slope     = (voto_max − pivot_vote) / (voto_max − pivot_rating)
 *
 * Defaults map SportMonks 6.50 (kickoff baseline) → voto 6.00.
 * Below `minutes_min_for_voto` the rating is discarded and the
 * player is "s.v." unless a decisive event fires (in which case
 * voto_base = base_score and only B/M applies).
 */
export const fmEngineConfigSchema = z.object({
  /** SportMonks rating that pivots to `pivot_vote`. */
  pivot_rating: z.number().min(3).max(10),
  /** Italian voto base that the pivot_rating maps to. */
  pivot_vote: z.number().min(1).max(10),
  /** Hard clamp on the voto base (1..10 by default). */
  voto_min: z.number().min(0).max(10),
  voto_max: z.number().min(0).max(10),
  /** Below this minute count the rating is discarded (s.v. rule). */
  minutes_min_for_voto: z.number().int().min(0).max(90),
  /** Baseline used when a decisive event fires for a <min-minutes player. */
  base_score: z.number().min(1).max(10),
})
export type FMEngineConfig = z.infer<typeof fmEngineConfigSchema>

// ---- Battle Royale goal thresholds -------------------------

/**
 * Ordered ascending list of raw-score thresholds. A team's
 * goal count is the number of thresholds it meets or exceeds.
 *   thresholds [66, 72, 78, 84, 90, 96, 102] →
 *     score 71.5  → 1 goal
 *     score 78.0  → 3 goals
 *     score 91.2  → 5 goals
 */
export const fmBattleRoyaleSchema = z.object({
  goal_thresholds: z.array(z.number()).min(1),
  /** Win/draw/loss points per BR matchup. */
  win_points: z.number().int().min(0).max(10).default(3),
  draw_points: z.number().int().min(0).max(10).default(1),
  loss_points: z.number().int().min(0).max(10).default(0),
})
export type FMBattleRoyaleConfig = z.infer<typeof fmBattleRoyaleSchema>

// ---- top-level competition config --------------------------

export const fmCompetitionConfigSchema = z.object({
  schema_version: z.literal(1),
  squad: fmSquadConfigSchema,
  formations: fmFormationListSchema,
  substitution: fmSubstitutionConfigSchema.default({ trigger: 'min_minutes', min_minutes: 15 }),
  football: fmFootballScoringSchema,
  popularity_brackets: fmBracketsSchema,
  mvp_bonus_brackets: fmBracketsSchema,
  coach_tier_matrix: fmCoachTierMatrixSchema,
  coach_tier_knockout_matrix: fmCoachKnockoutMatrixSchema.default(DEFAULT_COACH_KNOCKOUT_MATRIX),
  coach_knockout_draw_mode: fmKnockoutDrawModeSchema.default('advancer_wins'),
  tie_breakers: z.array(fmTieBreakerSchema).min(1),
  calc_order: fmCalcOrderSchema,
  engine: fmEngineConfigSchema,
  battle_royale: fmBattleRoyaleSchema,
  /**
   * Immunità: when true, a player fielded by exactly ONE team in a lega for a
   * scoring round has his yellow/red card malus waived. League-level game rule
   * (stored on league_engine_config), so it is composed in, not part of the
   * per-competition shape. Defaults true to preserve "sempre attiva" behaviour.
   */
  immunita_enabled: z.boolean().default(true),
})
export type FMCompetitionConfig = z.infer<typeof fmCompetitionConfigSchema>

// ---- per-phase overrides -----------------------------------

export const fmPhaseBudgetConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('fixed'),
    budget: z.number().int().min(50).max(10_000),
  }),
  z.object({
    mode: z.literal('reward_leaders'),
    /** Index 0 = 1st place, index N-1 = last place. */
    budget_by_rank: z.array(z.number().int().min(50).max(10_000)).min(1),
  }),
  z.object({
    mode: z.literal('comeback'),
    budget_by_rank: z.array(z.number().int().min(50).max(10_000)).min(1),
  }),
])
export type FMPhaseBudgetConfig = z.infer<typeof fmPhaseBudgetConfigSchema>
