// ============================================================
// lib/engine/loadGameRules.ts
// ============================================================
// Single source of truth for game rules across every competition:
// Campionato, Battle Royale, Coppa, ControFanta Mondiale.
//
// Reads from league_engine_config (columns: goal_thresholds,
// smoothing, result_points) and returns a ResultRulesConfig.
//
// During the unification rollout, legacy sources are still read
// as a defensive fallback (will be removed in step 6):
//   - leagues.result_rules
//   - competitions.scoring_config.thresholds
//   - fm_competition_config.config.battle_royale.goal_thresholds
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import type { GoalThreshold } from '@/domain/competitions/goalThresholds'
import {
  DEFAULT_RESULT_RULES,
  type ResultRulesConfig,
  type SmoothingConfig,
  type PointsConfig,
} from '@/domain/competitions/resultRules'

type Supabase = SupabaseClient<Database>

type EngineConfigSlice = Pick<
  Database['public']['Tables']['league_engine_config']['Row'],
  'goal_thresholds' | 'smoothing' | 'result_points'
>

/**
 * Loads the unified game rules for a league from league_engine_config.
 * Returns DEFAULT_RESULT_RULES if no row exists yet (should not happen
 * after the unification migration's backfill).
 */
export async function loadGameRules(
  supabase: Supabase,
  leagueId: string
): Promise<ResultRulesConfig> {
  const { data } = await supabase
    .from('league_engine_config')
    .select('goal_thresholds, smoothing, result_points')
    .eq('league_id', leagueId)
    .maybeSingle()

  return parseGameRulesFromConfigRow(data)
}

/**
 * Pure parser for callers that already have the engine_config row in memory.
 * Tolerates legacy column shapes (jsonb-from-JSON-string, missing fields).
 */
export function parseGameRulesFromConfigRow(
  row: EngineConfigSlice | null
): ResultRulesConfig {
  if (!row) return DEFAULT_RESULT_RULES

  return {
    thresholds: parseThresholds(row.goal_thresholds),
    smoothing: parseSmoothing(row.smoothing),
    points: parsePoints(row.result_points),
  }
}

// ---- jsonb parsers ----------------------------------------------------------

function parseThresholds(raw: Json | null | undefined): GoalThreshold[] {
  if (!Array.isArray(raw)) return DEFAULT_RESULT_RULES.thresholds
  const out: GoalThreshold[] = []
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).min === 'number' &&
      typeof (item as Record<string, unknown>).goals === 'number'
    ) {
      const o = item as Record<string, number>
      out.push({ min: o.min!, goals: o.goals! })
    }
  }
  return out.length > 0 ? out : DEFAULT_RESULT_RULES.thresholds
}

function parseSmoothing(raw: Json | null | undefined): SmoothingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_RESULT_RULES.smoothing
  }
  const r = raw as Record<string, unknown>
  return {
    drawIfDiffBelow:
      typeof r.drawIfDiffBelow === 'number'
        ? r.drawIfDiffBelow
        : DEFAULT_RESULT_RULES.smoothing.drawIfDiffBelow,
    drawIf1GoalLeadAndDiffBelow:
      typeof r.drawIf1GoalLeadAndDiffBelow === 'number'
        ? r.drawIf1GoalLeadAndDiffBelow
        : DEFAULT_RESULT_RULES.smoothing.drawIf1GoalLeadAndDiffBelow,
  }
}

function parsePoints(raw: Json | null | undefined): PointsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_RESULT_RULES.points
  }
  const r = raw as Record<string, unknown>
  return {
    win:  typeof r.win  === 'number' ? r.win  : DEFAULT_RESULT_RULES.points.win,
    draw: typeof r.draw === 'number' ? r.draw : DEFAULT_RESULT_RULES.points.draw,
    loss: typeof r.loss === 'number' ? r.loss : DEFAULT_RESULT_RULES.points.loss,
  }
}
