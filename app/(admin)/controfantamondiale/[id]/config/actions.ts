'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireFMContext, assertLeagueAdmin } from '@/lib/fantamondiale/server'
import {
  fmCompetitionConfigSchema,
  fmSquadConfigSchema,
  fmFormationListSchema,
  fmCoachTierMatrixSchema,
  fmKnockoutDrawModeSchema,
  fmTieBreakerSchema,
} from '@/domain/fantamondiale/config/schema'
import type { Json } from '@/types/database.types'

// FM-specific subset of the competition config persisted in fm_competition_config.
// Scoring rules (engine, football B/M, popularity, MVP, calc_order, BR thresholds,
// W/D/L points) are global and live on league_engine_config — they are NOT written
// here. Saving only updates this subset, preserving whatever JSONB shape the row
// previously had for forward compatibility.
const fmShapeSchema = z.object({
  squad: fmSquadConfigSchema,
  formations: fmFormationListSchema,
  coach_tier_matrix: fmCoachTierMatrixSchema,
  coach_knockout_draw_mode: fmKnockoutDrawModeSchema,
  tie_breakers: z.array(fmTieBreakerSchema).min(1),
})

export async function saveConfigAction(fd: FormData) {
  const ref = fd.get('competition_id') as string
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  const rawJson = fd.get('config_json') as string

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('JSON non valido')
  }

  // Editor sends the full composed FMCompetitionConfig (so Zod validation
  // catches accidental shape drift), but only the FM-specific subset is
  // persisted.
  const validated = fmCompetitionConfigSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
  }

  const shape = fmShapeSchema.parse({
    squad: validated.data.squad,
    formations: validated.data.formations,
    coach_tier_matrix: validated.data.coach_tier_matrix,
    coach_knockout_draw_mode: validated.data.coach_knockout_draw_mode,
    tie_breakers: validated.data.tie_breakers,
  })

  // Read whatever this Lega's row currently holds so we preserve unknown keys
  // and schema_version, then merge in the new FM-shape values. Fantasy config is
  // per-league (fm_league_competition_config), keyed by the Lega instance id.
  const { data: existing } = await supabase
    .from('fm_league_competition_config')
    .select('config')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .maybeSingle()

  const merged: Json = {
    ...((existing?.config as Record<string, Json> | undefined) ?? {}),
    schema_version: 1,
    squad: shape.squad as unknown as Json,
    formations: shape.formations as unknown as Json,
    coach_tier_matrix: shape.coach_tier_matrix as unknown as Json,
    coach_knockout_draw_mode: shape.coach_knockout_draw_mode,
    tie_breakers: shape.tie_breakers as unknown as Json,
  }

  await supabase
    .from('fm_league_competition_config')
    .upsert(
      { league_competition_id: ctx.legaCompetition.id, config: merged, updated_by: ctx.userId },
      { onConflict: 'league_competition_id' }
    )

  revalidatePath(`/controfantamondiale/${ref}/config`)
  revalidatePath(`/controfantamondiale/${ref}/regole`)
}
