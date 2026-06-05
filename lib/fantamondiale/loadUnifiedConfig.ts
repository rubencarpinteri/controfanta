// ============================================================
// lib/controfantamondiale/loadUnifiedConfig.ts
// ============================================================
// Composes the FMCompetitionConfig consumed by the FM scoring
// pipeline from two sources:
//
//   * league_engine_config (global game rules)
//       pivot/voto_*, bonus/malus, popularity, MVP, calc_order,
//       goal_thresholds, smoothing, result_points
//
//   * fm_competition_config.config (competition shape)
//       squad, formations, coach_tier_matrix, tie_breakers
//
// This realises the unification: the same Regole di gioco apply
// to Serie A and ControFanta Mondiale; only the competition-specific
// shape (roster size, coach matrix, formations) varies per FM
// competition.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { DEFAULT_FM_CONFIG } from '@/domain/fantamondiale/config/defaults'
import type {
  FMCompetitionConfig,
  FMBracket,
} from '@/domain/fantamondiale/config/schema'
import type { GoalThreshold } from '@/domain/competitions/goalThresholds'

type Supabase = SupabaseClient<Database>

type EngineRow = Database['public']['Tables']['league_engine_config']['Row']

function parseBracketsField(value: Json | null | undefined, fallback: FMBracket[]): FMBracket[] {
  if (!Array.isArray(value)) return fallback
  const out: FMBracket[] = []
  for (const item of value) {
    if (
      item && typeof item === 'object' && !Array.isArray(item) &&
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

function parseThresholdRowsToFMArray(value: Json | null | undefined): number[] | null {
  if (!Array.isArray(value)) return null
  const rows: GoalThreshold[] = []
  for (const item of value) {
    if (
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).min === 'number' &&
      typeof (item as Record<string, unknown>).goals === 'number'
    ) {
      const o = item as Record<string, number>
      rows.push({ min: o.min!, goals: o.goals! })
    }
  }
  if (rows.length === 0) return null
  // FM thresholds are an ascending list of "score → +1 goal" cutpoints.
  // Project the {min, goals} rows by extracting each step at which goals
  // increases past the previous value.
  const sorted = [...rows].sort((a, b) => a.min - b.min)
  const out: number[] = []
  let prevGoals = 0
  for (const row of sorted) {
    while (row.goals > prevGoals) {
      out.push(row.min)
      prevGoals++
    }
  }
  return out.length > 0 ? out : null
}

function parsePoints(
  raw: Json | null | undefined,
  fallback: { win: number; draw: number; loss: number }
): { win: number; draw: number; loss: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const r = raw as Record<string, unknown>
  return {
    win:  typeof r.win  === 'number' ? r.win  : fallback.win,
    draw: typeof r.draw === 'number' ? r.draw : fallback.draw,
    loss: typeof r.loss === 'number' ? r.loss : fallback.loss,
  }
}

function parseSubstitution(raw: unknown): FMCompetitionConfig['substitution'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_FM_CONFIG.substitution
  const r = raw as Record<string, unknown>
  const trigger = r.trigger === 'no_rating' || r.trigger === 'min_minutes'
    ? r.trigger
    : DEFAULT_FM_CONFIG.substitution.trigger
  const min_minutes = typeof r.min_minutes === 'number'
    ? r.min_minutes
    : DEFAULT_FM_CONFIG.substitution.min_minutes
  return { trigger, min_minutes }
}

function parseCompetitionShape(raw: Json | null | undefined): {
  squad: FMCompetitionConfig['squad']
  formations: FMCompetitionConfig['formations']
  substitution: FMCompetitionConfig['substitution']
  coach_tier_matrix: FMCompetitionConfig['coach_tier_matrix']
  tie_breakers: FMCompetitionConfig['tie_breakers']
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      squad: DEFAULT_FM_CONFIG.squad,
      formations: DEFAULT_FM_CONFIG.formations,
      substitution: DEFAULT_FM_CONFIG.substitution,
      coach_tier_matrix: DEFAULT_FM_CONFIG.coach_tier_matrix,
      tie_breakers: DEFAULT_FM_CONFIG.tie_breakers,
    }
  }
  const r = raw as Record<string, unknown>
  // Defensively project each sub-field; fall back to defaults on shape mismatch.
  // The full Zod schema is still applied downstream by callers that need it.
  const rawSquad = (r.squad as Record<string, unknown> | undefined) ?? undefined
  const squad: FMCompetitionConfig['squad'] = rawSquad
    ? {
        ...DEFAULT_FM_CONFIG.squad,
        ...(rawSquad as Partial<FMCompetitionConfig['squad']>),
        role_quotas: {
          ...DEFAULT_FM_CONFIG.squad.role_quotas,
          ...((rawSquad.role_quotas as Partial<FMCompetitionConfig['squad']['role_quotas']>) ?? {}),
        },
      }
    : DEFAULT_FM_CONFIG.squad
  return {
    squad,
    formations: Array.isArray(r.formations) ? (r.formations as string[]) : DEFAULT_FM_CONFIG.formations,
    substitution: parseSubstitution(r.substitution),
    coach_tier_matrix:
      (r.coach_tier_matrix as FMCompetitionConfig['coach_tier_matrix']) ?? DEFAULT_FM_CONFIG.coach_tier_matrix,
    tie_breakers: Array.isArray(r.tie_breakers)
      ? (r.tie_breakers as FMCompetitionConfig['tie_breakers'])
      : DEFAULT_FM_CONFIG.tie_breakers,
  }
}

/**
 * Compose an FMCompetitionConfig from the unified game rules
 * (league_engine_config) and the FM-specific competition shape
 * (fm_competition_config.config).
 */
export async function loadFMUnifiedConfig(
  supabase: Supabase,
  competitionId: string
): Promise<FMCompetitionConfig> {
  // Single league today — pick the sole engine config row.
  // If/when multi-league lands, add an FK from fm_competition to leagues.
  const [{ data: engineRow }, { data: fmRow }] = await Promise.all([
    supabase
      .from('league_engine_config')
      .select('*')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('fm_competition_config')
      .select('config')
      .eq('competition_id', competitionId)
      .maybeSingle(),
  ])

  return composeFMConfig(engineRow ?? null, fmRow?.config ?? null)
}

/**
 * Pure composer — exposed for the FM "Regole di gioco" preview and tests.
 */
export function composeFMConfig(
  engineRow: EngineRow | null,
  fmConfigJson: Json | null
): FMCompetitionConfig {
  const base = DEFAULT_FM_CONFIG
  const shape = parseCompetitionShape(fmConfigJson)

  if (!engineRow) {
    return {
      ...base,
      ...shape,
    }
  }

  const calcOrder = (engineRow.calc_order === 'mvp_then_penalty' || engineRow.calc_order === 'penalty_then_mvp')
    ? engineRow.calc_order
    : base.calc_order

  const goalThresholds = parseThresholdRowsToFMArray(engineRow.goal_thresholds) ?? base.battle_royale.goal_thresholds
  const points = parsePoints(engineRow.result_points, {
    win:  base.battle_royale.win_points,
    draw: base.battle_royale.draw_points,
    loss: base.battle_royale.loss_points,
  })

  return {
    schema_version: 1,
    squad:        shape.squad,
    formations:   shape.formations,
    substitution: shape.substitution,
    coach_tier_matrix: shape.coach_tier_matrix,
    tie_breakers: shape.tie_breakers,

    engine: {
      pivot_rating: engineRow.pivot_rating ?? base.engine.pivot_rating,
      pivot_vote:   engineRow.pivot_vote   ?? base.engine.pivot_vote,
      voto_min:     base.engine.voto_min,
      voto_max:     base.engine.voto_max,
      minutes_min_for_voto: base.engine.minutes_min_for_voto,
      base_score:   base.engine.base_score,
    },

    football: {
      goal: {
        P: engineRow.goal_bonus_gk,
        D: engineRow.goal_bonus_def,
        C: engineRow.goal_bonus_mid,
        A: engineRow.goal_bonus_att,
      },
      penalty_scored_discount: engineRow.penalty_scored_discount,
      assist:         engineRow.assist,
      clean_sheet: {
        P: engineRow.clean_sheet_gk,
        D: engineRow.clean_sheet_def,
        min_minutes: engineRow.clean_sheet_min_minutes,
      },
      penalty_saved:  engineRow.penalty_saved,
      penalty_missed: engineRow.penalty_missed,
      yellow_card:    engineRow.yellow_card,
      red_card:       engineRow.red_card,
      own_goal:       engineRow.own_goal,
      goals_conceded: {
        P: engineRow.goals_conceded_gk,
        D: engineRow.goals_conceded_def,
        def_min_minutes: engineRow.goals_conceded_def_min_minutes,
      },
      brace_bonus:    engineRow.brace_bonus,
      hat_trick_bonus: engineRow.hat_trick_bonus,
    },

    popularity_brackets: parseBracketsField(engineRow.popularity_brackets, base.popularity_brackets),
    mvp_bonus_brackets:  parseBracketsField(engineRow.mvp_bonus_brackets,  base.mvp_bonus_brackets),

    calc_order: calcOrder,

    battle_royale: {
      goal_thresholds: goalThresholds,
      win_points:  points.win,
      draw_points: points.draw,
      loss_points: points.loss,
    },
  }
}
