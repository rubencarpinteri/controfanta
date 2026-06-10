// ============================================================
// domain/competitions/resultRules.ts
// ============================================================
// Pure helper: converts a pair of team total_fantavoto values
// into a fixture result (goals + outcome).
//
// Combines two layers:
//   1. Goal thresholds — each team's absolute score → goal count
//   2. Smoothing rules — converts unfair edge cases into draws
//      to absorb sub-1.5pt noise that would otherwise decide a match
//
// Used uniformly by Campionato and Battle Royal so a given pair of
// scores always produces the same result regardless of competition.
// ============================================================

import { fantaVotoToGoals, type GoalThreshold } from './goalThresholds'

export interface SmoothingConfig {
  /** If |home − away| < this, force a draw at the average band. */
  drawIfDiffBelow: number
  /** If exactly 1-goal lead but |home − away| < this, force a draw at the average band. */
  drawIf1GoalLeadAndDiffBelow: number
}

export interface PointsConfig {
  win: number
  draw: number
  loss: number
}

export interface ResultRulesConfig {
  thresholds: GoalThreshold[]
  smoothing: SmoothingConfig
  points: PointsConfig
}

export type FixtureOutcome = 'home_win' | 'away_win' | 'draw'

export interface FixtureResult {
  home_goals: number
  away_goals: number
  outcome: FixtureOutcome
  /** True when smoothing rules modified the raw band-derived result. */
  smoothed: boolean
}

/**
 * Pure function — same input always produces the same output.
 * No DB calls, no globals, fully testable.
 *
 * Accepts a subset of ResultRulesConfig because `points` is not needed for
 * fixture goal computation — it's only used downstream when awarding W/D/L.
 */
export function computeFixtureResult(
  homeFV: number,
  awayFV: number,
  cfg: Pick<ResultRulesConfig, 'thresholds' | 'smoothing'>
): FixtureResult {
  const rawHome = fantaVotoToGoals(homeFV, cfg.thresholds)
  const rawAway = fantaVotoToGoals(awayFV, cfg.thresholds)
  const diff = Math.abs(homeFV - awayFV)
  const goalDiff = Math.abs(rawHome - rawAway)

  // Smoothing rule 1: near-tie on raw points → draw at average band
  if (diff < cfg.smoothing.drawIfDiffBelow) {
    const avgGoals = fantaVotoToGoals((homeFV + awayFV) / 2, cfg.thresholds)
    return { home_goals: avgGoals, away_goals: avgGoals, outcome: 'draw', smoothed: true }
  }

  // Smoothing rule 2: 1-goal lead but tight points → draw at average band
  if (goalDiff === 1 && diff < cfg.smoothing.drawIf1GoalLeadAndDiffBelow) {
    const avgGoals = fantaVotoToGoals((homeFV + awayFV) / 2, cfg.thresholds)
    return { home_goals: avgGoals, away_goals: avgGoals, outcome: 'draw', smoothed: true }
  }

  if (rawHome > rawAway) return { home_goals: rawHome, away_goals: rawAway, outcome: 'home_win', smoothed: false }
  if (rawAway > rawHome) return { home_goals: rawHome, away_goals: rawAway, outcome: 'away_win', smoothed: false }
  return { home_goals: rawHome, away_goals: rawAway, outcome: 'draw', smoothed: false }
}

/** Default rules — used as fallback when a league has no result_rules row. */
export const DEFAULT_RESULT_RULES: ResultRulesConfig = {
  thresholds: [
    { min: 0,    goals: 0 },
    { min: 64.5, goals: 1 },
    { min: 70.5, goals: 2 },
    { min: 76.5, goals: 3 },
    { min: 82.5, goals: 4 },
    { min: 88.5, goals: 5 },
    { min: 94.5, goals: 6 },
  ],
  // Smoothing disabled by default — a 62 vs 61.9 is still a 1-0. Admins can
  // opt back in per league; suggested values if enabled: drawIfDiffBelow 1.0,
  // drawIf1GoalLeadAndDiffBelow 1.5.
  smoothing: {
    drawIfDiffBelow: 0,
    drawIf1GoalLeadAndDiffBelow: 0,
  },
  points: { win: 3, draw: 1, loss: 0 },
}
