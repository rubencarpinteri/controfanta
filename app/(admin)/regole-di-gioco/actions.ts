'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { Json } from '@/types/database.types'

// ── Validation schema ────────────────────────────────────────────────────────

const bracketSchema = z.object({
  min_pct: z.number().min(0).max(100),
  max_pct: z.number().min(0).max(100),
  pct:     z.number().min(0).max(100),
})

const goalThresholdSchema = z.object({
  min:   z.number().min(0).max(200),
  goals: z.number().int().min(0).max(20),
})

const EngineConfigSchema = z.object({
  // Pivot anchor — rating → voto_base
  pivot_rating: z.coerce.number().min(3).max(10),
  pivot_vote:   z.coerce.number().min(1).max(10),

  // Goal bonuses
  goal_bonus_gk:  z.coerce.number().min(0).max(10),
  goal_bonus_def: z.coerce.number().min(0).max(10),
  goal_bonus_mid: z.coerce.number().min(0).max(10),
  goal_bonus_att: z.coerce.number().min(0).max(10),

  penalty_scored_discount: z.coerce.number().min(0).max(5),
  brace_bonus:             z.coerce.number().min(0).max(5),
  hat_trick_bonus:         z.coerce.number().min(0).max(5),

  // Events
  assist:         z.coerce.number().min(-5).max(5),
  own_goal:       z.coerce.number().min(-10).max(0),
  yellow_card:    z.coerce.number().min(-5).max(0),
  red_card:       z.coerce.number().min(-10).max(0),
  penalty_missed: z.coerce.number().min(-10).max(0),
  penalty_saved:  z.coerce.number().min(0).max(10),

  // Clean sheet
  clean_sheet_gk:            z.coerce.number().min(0).max(5),
  clean_sheet_def:           z.coerce.number().min(0).max(5),
  clean_sheet_min_minutes:   z.coerce.number().int().min(1).max(90),

  // Goals conceded
  goals_conceded_gk:               z.coerce.number().min(-5).max(0),
  goals_conceded_def:              z.coerce.number().min(-5).max(0),
  goals_conceded_def_min_minutes:  z.coerce.number().int().min(1).max(90),

  // Trademark — ownership-driven adjustment
  popularity_brackets_json: z.string(),
  mvp_bonus_brackets_json:  z.string(),
  calc_order:               z.enum(['mvp_then_penalty', 'penalty_then_mvp']),

  // Unified game rules — goal thresholds, smoothing, W/D/L points
  goal_thresholds_json:                z.string(),
  smoothing_drawIfDiffBelow:             z.coerce.number().min(0).max(10),
  smoothing_drawIf1GoalLeadAndDiffBelow: z.coerce.number().min(0).max(10),
  points_win:  z.coerce.number().int().min(0).max(10),
  points_draw: z.coerce.number().int().min(0).max(10),
  points_loss: z.coerce.number().int().min(0).max(10),
})

export interface SaveEngineConfigResult {
  error: string | null
  success: boolean
}

function parseBracketsField(json: string, label: string): { ok: true; value: Json } | { ok: false; error: string } {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { ok: false, error: `${label}: JSON non valido.` } }
  const parsed = z.array(bracketSchema).min(1).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `${label}: ${parsed.error.errors[0]?.message ?? 'forma non valida'}.` }
  }
  // Sort by min_pct ascending so DB always sees ordered ladder
  const sorted = [...parsed.data].sort((a, b) => a.min_pct - b.min_pct)
  return { ok: true, value: sorted as unknown as Json }
}

function parseThresholdsField(json: string): { ok: true; value: Json } | { ok: false; error: string } {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { ok: false, error: 'Soglie gol: JSON non valido.' } }
  const parsed = z.array(goalThresholdSchema).min(1).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `Soglie gol: ${parsed.error.errors[0]?.message ?? 'forma non valida'}.` }
  }
  const sorted = [...parsed.data].sort((a, b) => a.min - b.min)
  return { ok: true, value: sorted as unknown as Json }
}

// ── Action ───────────────────────────────────────────────────────────────────

export async function saveEngineConfigAction(
  _prev: SaveEngineConfigResult,
  formData: FormData
): Promise<SaveEngineConfigResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = Object.fromEntries(formData.entries())
  const parsed = EngineConfigSchema.safeParse(raw)

  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.')}: ${first?.message}`, success: false }
  }

  if (parsed.data.pivot_rating >= 10) {
    return { error: 'pivot_rating: deve essere minore di 10 (l\'ancoraggio 10→10 è implicito).', success: false }
  }

  const popParsed = parseBracketsField(parsed.data.popularity_brackets_json, 'Fasce popolarità')
  if (!popParsed.ok) return { error: popParsed.error, success: false }
  const mvpParsed = parseBracketsField(parsed.data.mvp_bonus_brackets_json,  'Fasce MVP')
  if (!mvpParsed.ok) return { error: mvpParsed.error, success: false }
  const thrParsed = parseThresholdsField(parsed.data.goal_thresholds_json)
  if (!thrParsed.ok) return { error: thrParsed.error, success: false }

  const {
    popularity_brackets_json: _p,
    mvp_bonus_brackets_json: _m,
    goal_thresholds_json: _t,
    smoothing_drawIfDiffBelow,
    smoothing_drawIf1GoalLeadAndDiffBelow,
    points_win,
    points_draw,
    points_loss,
    ...flat
  } = parsed.data
  void _p; void _m; void _t

  const smoothing: Json = {
    drawIfDiffBelow: smoothing_drawIfDiffBelow,
    drawIf1GoalLeadAndDiffBelow: smoothing_drawIf1GoalLeadAndDiffBelow,
  }
  const result_points: Json = {
    win: points_win,
    draw: points_draw,
    loss: points_loss,
  }

  const values = {
    ...flat,
    popularity_brackets: popParsed.value,
    mvp_bonus_brackets:  mvpParsed.value,
    goal_thresholds:     thrParsed.value,
    smoothing,
    result_points,
    league_id:  ctx.league.id,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('league_engine_config')
    .upsert(values, { onConflict: 'league_id' })

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'league_engine_config',
    entityId: ctx.league.id,
    afterJson: values as unknown as Json,
  })

  revalidatePath('/regole-di-gioco')
  revalidatePath('/methodology')

  return { error: null, success: true }
}

// ── Immunità on/off (league-level special rule) ──────────────────────────────
// Stored on league_engine_config so it composes into both the Serie A engine
// and the FantaMondiale engine. League-admin scope.
export async function setImmunitaEnabledAction(
  enabled: boolean,
): Promise<{ success: boolean; error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('league_engine_config')
    .upsert(
      { league_id: ctx.league.id, immunita_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: 'league_id' },
    )
  if (error) return { success: false, error: error.message }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'league_engine_config',
    entityId: ctx.league.id,
    afterJson: { immunita_enabled: enabled } as unknown as Json,
  })

  revalidatePath('/league')
  return { success: true, error: null }
}
