// ============================================================
// FantaMondiale — Player score (engine v3.0 "Pivot + Bonus")
// ============================================================
// Two-stage scoring, split so popularity / MVP can be applied per-Lega:
//
//   Stage 1 (Lega-agnostic):  scorePlayerRaw
//     voto_base, football_bonus, football_malus, raw_subtotal
//
//   Stage 2 (per-Lega):       finalizePlayerForLega
//     popularity_penalty (from THIS Lega's ownership_pct)
//     mvp_bonus (gated by ownership and is_mvp)
//     final_score (combines the two per calc_order)
//
// Final score formula (game trademark):
//   penalty     = |raw_subtotal| × popularity_pct/100      // absolute
//   final_score = (raw_subtotal − penalty) × (1 + mvp_pct/100)
//
// Popularity penalty hits absolute value so a popular bad-game player is
// punished more, not less. MVP bonus compounds on the post-penalty score,
// so a popular MVP suffers double.
// ============================================================

import type {
  FMCompetitionConfig,
  FMBracket,
  FMEngineConfig,
} from '@/domain/fantamondiale/config/schema'
import type {
  FMEnginePlayerInput,
  FMPlayerMatchScoreResult,
  FMPlayerLegaFinalScore,
} from './types'

function findBracket(brackets: FMBracket[], pct: number): FMBracket | null {
  return brackets.find((b) => pct >= b.min_pct && pct <= b.max_pct) ?? null
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function deriveSlope(engine: FMEngineConfig): number {
  const denom = engine.voto_max - engine.pivot_rating
  if (denom <= 0) return 1
  return (engine.voto_max - engine.pivot_vote) / denom
}

/**
 * A "decisive event" rescues a player who played under the minutes gate: he
 * still gets a base_score and is NOT substituted. Only positive bonuses count
 * here — goal, assist, penalty scored, penalty saved. Maluses (yellow/red card,
 * own goal, penalty missed) deliberately do NOT count: a player booked or sent
 * off in his first minutes stays s.v. (no rating, no malus) and is subbed out.
 */
export function hasDecisiveEvent(stats: FMEnginePlayerInput['stats']): boolean {
  return (
    stats.goals           > 0 ||
    stats.assists         > 0 ||
    stats.penalties_saved > 0 ||
    (stats.penalties_scored ?? 0) > 0
  )
}

function computeCleanSheet(input: FMEnginePlayerInput, minMinutes: number): boolean {
  const { stats, nationalTeamId, matchContext } = input
  if (stats.minutes_played < minMinutes) return false

  const isHome = nationalTeamId === matchContext.home_team_id
  const isAway = nationalTeamId === matchContext.away_team_id
  if (!isHome && !isAway) return false

  const conceded = isHome ? matchContext.away_score : matchContext.home_score
  return conceded === 0
}

/**
 * Stage 1: Lega-agnostic per-(player, match) score. Computes voto_base,
 * football bonuses/maluses, and raw_subtotal. Does NOT apply popularity
 * penalty or MVP bonus — those depend on which Lega's ownership applies.
 */
export function scorePlayerRaw(
  input: FMEnginePlayerInput,
  config: FMCompetitionConfig,
  opts?: { immunitaGranted?: boolean },
): FMPlayerMatchScoreResult {
  const { engine, football } = config
  const { stats, role } = input
  // Immunità waives the yellow/red card malus only (own goal and missed
  // penalty still count). Applied per-lega by the round engine.
  const immunitaGranted = opts?.immunitaGranted ?? false

  // ---- voto_base (pivot formula + minutes gate) --------------------------
  let voto_base: number | null = null

  const decisive = hasDecisiveEvent(stats)
  const playedEnough = stats.minutes_played >= engine.minutes_min_for_voto

  if (playedEnough || decisive) {
    // A player who played the minutes gate OR was rescued by a decisive event
    // (goal/assist/pen) is scored. In BOTH cases we prefer the SportMonks
    // rating-derived voto_base when SportMonks published one — a sub who comes
    // on and scores keeps his real rating, not a flat base_score. We fall back
    // to base_score only when SportMonks gives no rating (common for very short
    // cameos that still produced a decisive event).
    if (stats.rating != null) {
      const slope = deriveSlope(engine)
      const raw = engine.pivot_vote + slope * (stats.rating - engine.pivot_rating)
      voto_base = clamp(raw, engine.voto_min, engine.voto_max)
    } else {
      voto_base = engine.base_score
    }
  }
  // else: pure s.v. — voto_base stays null, no scoring.

  // ---- football bonuses / maluses ---------------------------------------
  let football_bonus = 0
  let football_malus = 0

  const isGk = role === 'P'
  const isDef = role === 'D'

  if (voto_base !== null) {
    // Clean sheet. The keeper's bonus has NO minutes gate — a playing keeper
    // who didn't concede always earns it (voto_base !== null already proves he
    // played). The defender's bonus stays gated by clean_sheet.min_minutes.
    const gkCleanSheet = isGk && computeCleanSheet(input, 0)
    const defCleanSheet = isDef && computeCleanSheet(input, football.clean_sheet.min_minutes)

    // Goals — regular vs penalty (penalty bonus = role goal − discount)
    const penaltiesScored = stats.penalties_scored ?? 0
    const regularGoals = Math.max(0, stats.goals - penaltiesScored)
    const goalBonus = football.goal[role]
    const penGoalBonus = goalBonus - football.penalty_scored_discount

    football_bonus += regularGoals * goalBonus
    football_bonus += penaltiesScored * penGoalBonus

    if (stats.goals >= 3) football_bonus += football.hat_trick_bonus
    else if (stats.goals >= 2) football_bonus += football.brace_bonus

    football_bonus += stats.assists * football.assist

    if (gkCleanSheet) football_bonus += football.clean_sheet.P
    else if (defCleanSheet) football_bonus += football.clean_sheet.D

    if (isGk) {
      football_bonus += stats.penalties_saved * football.penalty_saved
    }

    // Maluses (config values are negative; we accumulate absolute amounts).
    // Immunità zeroes BOTH card maluses (giallo + rosso).
    if (!immunitaGranted) {
      football_malus += Math.abs(stats.yellow_cards * football.yellow_card)
      football_malus += Math.abs(stats.red_cards * football.red_card)
    }
    football_malus += Math.abs(stats.own_goals * football.own_goal)
    football_malus += Math.abs(stats.penalties_missed * football.penalty_missed)

    // Goals conceded — GK always; DEF only above def_min_minutes
    if (stats.goals_conceded > 0) {
      if (isGk) {
        football_malus += Math.abs(stats.goals_conceded * football.goals_conceded.P)
      } else if (isDef && stats.minutes_played >= football.goals_conceded.def_min_minutes) {
        football_malus += Math.abs(stats.goals_conceded * football.goals_conceded.D)
      }
    }
  }

  const raw_subtotal = (voto_base ?? 0) + football_bonus - football_malus

  return {
    scoring_round_id: input.matchContext.scoring_round_id,
    real_match_id: input.matchContext.real_match_id,
    player_id: input.playerId,
    base_rating: stats.rating,
    z_rating: null, // legacy column — engine v3.0 does not compute a z-score
    voto_base,
    football_bonus,
    football_malus,
    raw_subtotal,
    is_mvp: stats.is_mvp,
    calc_snapshot: config,
  }
}

/**
 * Stage 2: per-Lega finalization. Takes a player's Lega-agnostic raw subtotal
 * + MVP flag and applies THIS Lega's ownership-derived popularity penalty
 * and MVP bonus. Same player on the same match produces different final
 * scores in different Leghe — that's the whole point of the refactor.
 */
export function finalizePlayerForLega(
  raw: { raw_subtotal: number; is_mvp: boolean },
  ownershipPct: number,
  config: FMCompetitionConfig,
): FMPlayerLegaFinalScore {
  const { calc_order, mvp_bonus_brackets, popularity_brackets } = config

  const mvp_bonus_pct = raw.is_mvp
    ? (findBracket(mvp_bonus_brackets, ownershipPct)?.pct ?? 0)
    : 0
  const popularity_penalty_pct = findBracket(popularity_brackets, ownershipPct)?.pct ?? 0

  // Popularity penalty on absolute value — popular bad players hurt MORE.
  const popularity_penalty_amount = (Math.abs(raw.raw_subtotal) * popularity_penalty_pct) / 100

  let final_score: number
  let mvp_bonus_amount: number

  if (calc_order === 'penalty_then_mvp') {
    const afterPenalty = raw.raw_subtotal - popularity_penalty_amount
    mvp_bonus_amount = (afterPenalty * mvp_bonus_pct) / 100
    final_score = afterPenalty + mvp_bonus_amount
  } else {
    // 'mvp_then_penalty' — additive on the original raw_subtotal.
    mvp_bonus_amount = (raw.raw_subtotal * mvp_bonus_pct) / 100
    final_score = raw.raw_subtotal + mvp_bonus_amount - popularity_penalty_amount
  }

  return {
    popularity_penalty_pct,
    popularity_penalty_amount,
    mvp_bonus_pct,
    mvp_bonus_amount,
    final_score,
  }
}

/**
 * Public helper for the config editor's live preview.
 * Equivalent to the Serie A `ratingToVotoBase`.
 */
export function ratingToVotoBase(rating: number, engine: FMEngineConfig): number {
  const slope = deriveSlope(engine)
  const raw = engine.pivot_vote + slope * (rating - engine.pivot_rating)
  return clamp(raw, engine.voto_min, engine.voto_max)
}
