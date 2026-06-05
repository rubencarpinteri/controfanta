// ============================================================
// CONTROFANTA — Rating Engine v3.1 — Core Logic
// ============================================================
// Pure TypeScript — no Supabase, no Next.js, no side effects.
//
// Per-player pipeline:
//
//   1. Minutes gate — < minutes_min_for_voto (default 15):
//        a) No decisive event → "s.v." (NV, skipped entirely)
//        b) Decisive event   → voto_base = base_score (6.0), B/M only
//
//   2. No rating yet (live-match exception):
//        voto_base = base_score (6.0), B/M only
//
//   3. Normal path:
//        voto_base = pivot_vote + slope × (rating − pivot_rating)
//        clamped to [voto_min, voto_max].
//
//   4. raw_subtotal = voto_base + Σ B/M    (NOT clamped)
//
//   5. Trademark — ownership-driven adjustment:
//        penalty       = |raw_subtotal| × popularity_pct/100
//        if calc_order = 'penalty_then_mvp':
//            after     = raw_subtotal − penalty
//            mvp_bonus = after × mvp_pct/100
//            fantavoto = after + mvp_bonus
//        else (mvp_then_penalty, additive):
//            mvp_bonus = raw_subtotal × mvp_pct/100
//            fantavoto = raw_subtotal + mvp_bonus − penalty
//
//   No final clamp — fantavoto can exceed voto_max or go negative.
// ============================================================

import { DEFAULT_ENGINE_CONFIG, deriveSlope } from './config'
import type {
  EngineConfig,
  EnginePlayerInput,
  PlayerEngineOutput,
  PlayerCalculationResult,
  PlayerSkipped,
  BonusMalusItem,
  MatchdayEngineResult,
  OwnershipBracket,
} from './types'

// ---- Numeric helpers ----------------------------------------

function round(value: number, dp = 3): number {
  const factor = Math.pow(10, dp)
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ---- Bracket lookup -----------------------------------------

function findBracketPct(brackets: OwnershipBracket[], ownershipPct: number): number {
  const b = brackets.find((br) => ownershipPct >= br.min_pct && ownershipPct <= br.max_pct)
  return b?.pct ?? 0
}

// ---- Decisive-event check -----------------------------------

function hasDecisiveEvent(input: EnginePlayerInput): boolean {
  return (
    input.goals_scored     > 0 ||
    input.assists          > 0 ||
    input.own_goals        > 0 ||
    input.yellow_cards     > 0 ||
    input.red_cards        > 0 ||
    input.penalties_scored > 0 ||
    input.penalties_missed > 0 ||
    input.penalties_saved  > 0
  )
}

// ---- Bonus / malus ------------------------------------------

function computeBonusMalus(
  input: EnginePlayerInput,
  config: EngineConfig
): { breakdown: BonusMalusItem[]; total: number } {
  const bm = config.bonus_malus
  const rc = input.rating_class
  const breakdown: BonusMalusItem[] = []

  const add = (label: string, quantity: number, points_each: number) => {
    if (quantity === 0) return
    breakdown.push({ label, quantity, points_each, total: round(quantity * points_each) })
  }

  const goalBonus = bm.goal_by_role[rc]
  const penGoalBonus = round(goalBonus - bm.penalty_scored_discount)
  const regularGoals = Math.max(0, input.goals_scored - input.penalties_scored)

  add('Gol', regularGoals, goalBonus)
  add('Gol (rigore)', input.penalties_scored, penGoalBonus)

  if (input.goals_scored >= 3) {
    add('Hat-trick', 1, bm.hat_trick_bonus)
  } else if (input.goals_scored === 2) {
    add('Doppietta', 1, bm.brace_bonus)
  }

  add('Assist', input.assists, bm.assist)
  add('Autogol', input.own_goals, bm.own_goal)
  if (input.immunita_granted) {
    // Card malus waived — show the cards in the breakdown at 0 so the UI can display the immunity badge
    if (input.yellow_cards > 0) add('Giallo (Immunità)', input.yellow_cards, 0)
    if (input.red_cards > 0) add('Rosso (Immunità)', input.red_cards, 0)
  } else {
    add('Giallo', input.yellow_cards, bm.yellow_card)
    add('Rosso', input.red_cards, bm.red_card)
  }
  add('Rigore sbagliato', input.penalties_missed, bm.penalty_missed)

  if (rc === 'GK') {
    add('Rigore parato', input.penalties_saved, bm.penalty_saved)
  }

  const csBonus = bm.clean_sheet_by_role[rc]
  if (
    csBonus !== undefined &&
    input.clean_sheet &&
    input.minutes_played >= bm.clean_sheet_min_minutes
  ) {
    add('Porta inviolata', 1, csBonus)
  }

  if (input.goals_conceded > 0) {
    const gcMalus = bm.goals_conceded_by_role[rc]
    if (gcMalus !== undefined) {
      const gcApplies =
        rc === 'GK' ||
        (rc === 'DEF' && input.minutes_played >= bm.goals_conceded_def_min_minutes)
      if (gcApplies) {
        add('Gol subiti', input.goals_conceded, gcMalus)
      }
    }
  }

  const total = round(breakdown.reduce((acc, b) => acc + b.total, 0))
  return { breakdown, total }
}

// ---- Pivot formula ------------------------------------------

export function ratingToVotoBase(rating: number, config: EngineConfig = DEFAULT_ENGINE_CONFIG): number {
  const slope = deriveSlope(config)
  const raw = config.pivot_vote + slope * (rating - config.pivot_rating)
  return round(clamp(raw, config.voto_min, config.voto_max))
}

// ---- Trademark step: ownership-driven adjustment -----------

interface OwnershipResult {
  ownership_pct: number
  mvp_bonus_pct: number
  mvp_bonus_amount: number
  popularity_penalty_pct: number
  popularity_penalty_amount: number
  fantavoto: number
}

function applyOwnership(raw_subtotal: number, input: EnginePlayerInput, config: EngineConfig): OwnershipResult {
  const popularity_penalty_pct = findBracketPct(config.popularity_brackets, input.ownership_pct)
  const mvp_bonus_pct = input.is_mvp
    ? findBracketPct(config.mvp_bonus_brackets, input.ownership_pct)
    : 0

  // Option C: penalty on ABSOLUTE value (popular bad players hurt more).
  const popularity_penalty_amount = round(Math.abs(raw_subtotal) * popularity_penalty_pct / 100)

  let fantavoto: number
  let mvp_bonus_amount: number

  if (config.calc_order === 'penalty_then_mvp') {
    // Option B: popularity first, then MVP compounded on what's left.
    const after = raw_subtotal - popularity_penalty_amount
    mvp_bonus_amount = round(after * mvp_bonus_pct / 100)
    fantavoto = round(after + mvp_bonus_amount)
  } else {
    // Additive on the original raw_subtotal.
    mvp_bonus_amount = round(raw_subtotal * mvp_bonus_pct / 100)
    fantavoto = round(raw_subtotal + mvp_bonus_amount - popularity_penalty_amount)
  }

  return {
    ownership_pct: input.ownership_pct,
    mvp_bonus_pct,
    mvp_bonus_amount,
    popularity_penalty_pct,
    popularity_penalty_amount,
    fantavoto,
  }
}

// ---- Per-player entry point ---------------------------------

export function calculatePlayerScore(
  input: EnginePlayerInput,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): PlayerEngineOutput {
  const { player_id, stats_id, is_provisional } = input

  // ----------------------------------------------------------------
  // Gate 1 — below minutes_min_for_voto (default 15).
  // ----------------------------------------------------------------
  if (input.minutes_played < config.minutes_min_for_voto) {
    if (!hasDecisiveEvent(input)) {
      const skipped: PlayerSkipped = {
        kind: 'skipped', player_id, stats_id, is_provisional, reason: 'NV',
      }
      return skipped
    }

    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const voto_base = config.base_score
    const raw_subtotal = round(voto_base + bmTotal)
    const own = applyOwnership(raw_subtotal, input, config)

    const result: PlayerCalculationResult = {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: true,
      no_ratings_exception: false,
      voto_base,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      raw_subtotal,
      ...own,
    }
    return result
  }

  // ----------------------------------------------------------------
  // Gate 2 — enough minutes, but no SportMonks rating yet.
  // ----------------------------------------------------------------
  if (input.rating === null) {
    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const voto_base = config.base_score
    const raw_subtotal = round(voto_base + bmTotal)
    const own = applyOwnership(raw_subtotal, input, config)

    return {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: false,
      no_ratings_exception: true,
      voto_base,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      raw_subtotal,
      ...own,
    }
  }

  // ----------------------------------------------------------------
  // Normal path — pivot formula + B/M + ownership trademark.
  // ----------------------------------------------------------------
  const voto_base = ratingToVotoBase(input.rating, config)
  const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
  const raw_subtotal = round(voto_base + bmTotal)
  const own = applyOwnership(raw_subtotal, input, config)

  return {
    kind: 'scored',
    player_id, stats_id, is_provisional,
    decisive_event_exception: false,
    no_ratings_exception: false,
    voto_base,
    bonus_malus_breakdown: breakdown,
    total_bonus_malus: bmTotal,
    raw_subtotal,
    ...own,
  }
}

// ---- Full matchday ------------------------------------------

export function computeMatchday(
  players: EnginePlayerInput[],
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): MatchdayEngineResult {
  const player_results = players.map((p) => calculatePlayerScore(p, config))
  return {
    engine_version: config.engine_version,
    player_results,
    scored_count:  player_results.filter((r) => r.kind === 'scored').length,
    skipped_count: player_results.filter((r) => r.kind === 'skipped').length,
  }
}
