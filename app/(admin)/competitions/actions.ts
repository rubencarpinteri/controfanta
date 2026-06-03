'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { slugify } from '@/lib/slug'
import type { Json } from '@/types/database.types'
import type { ActionResult } from '@/lib/actionResult'

const uuid = z.string().uuid('ID non valido')

// scoring_config keeps only the per-competition method choice
// (goal_thresholds vs direct_comparison). All actual thresholds,
// smoothing and W/D/L points come from the unified game rules in
// league_engine_config (Regole di gioco).
const createCompetitionSchema = z.object({
  name: z.string().trim().min(1, 'Nome obbligatorio').max(100),
  type: z.enum(['campionato', 'battle_royale', 'coppa']),
  season: z.string().trim().max(20).nullable(),
  scoring_method: z.enum(['direct_comparison', 'goal_thresholds']),
})

// ============================================================
// createCompetitionAction
// ============================================================

export async function createCompetitionAction(
  formData: FormData
): Promise<ActionResult & { competition_id?: string }> {
  const parsed = createCompetitionSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    season: (formData.get('season') as string | null)?.trim() || null,
    scoring_method: formData.get('scoring_method'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Input non valido.', success: false }
  }
  const { name, type, season, scoring_method } = parsed.data

  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const scoring_config: Json = { method: scoring_method }

  // Human-readable URL slug, unique within the league (append -2, -3 … on clash).
  const baseSlug = slugify(name)
  const { data: existing } = await supabase
    .from('competitions')
    .select('slug')
    .eq('league_id', ctx.league.id)
    .like('slug', `${baseSlug}%`)
  const taken = new Set((existing ?? []).map((r) => r.slug))
  let slug = baseSlug
  for (let n = 2; taken.has(slug); n++) slug = `${baseSlug}-${n}`

  const { data: competition, error } = await supabase
    .from('competitions')
    .insert({
      league_id:      ctx.league.id,
      name,
      type,
      season,
      slug,
      scoring_config,
      created_by:     ctx.userId,
    })
    .select('id, slug')
    .single()

  if (error || !competition) {
    return { error: error?.message ?? 'Errore creazione competizione.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_create',
    entityType:  'competition',
    entityId:    competition.id,
    afterJson:   { name, type, season },
  })

  revalidatePath('/competitions')
  redirect(`/competitions/${competition.slug ?? competition.id}`)
}

// ============================================================
// updateCompetitionStatusAction
// ============================================================

export async function updateCompetitionStatusAction(
  competitionId: string,
  newStatus: 'active' | 'completed' | 'cancelled'
): Promise<ActionResult> {
  const parsed = z.object({
    competitionId: uuid,
    newStatus: z.enum(['active', 'completed', 'cancelled']),
  }).safeParse({ competitionId, newStatus })
  if (!parsed.success) return { error: 'Input non valido.', success: false }

  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, status')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return { error: 'Competizione non trovata.', success: false }

  // Guard: cannot reactivate a completed competition
  if (comp.status === 'completed' && newStatus === 'active') {
    return { error: 'Una competizione completata non può essere riattivata.', success: false }
  }

  const { error } = await supabase
    .from('competitions')
    .update({ status: newStatus })
    .eq('id', competitionId)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_status_change',
    entityType:  'competition',
    entityId:    competitionId,
    afterJson:   { old_status: comp.status, new_status: newStatus },
  })

  revalidatePath(`/competitions/${competitionId}`)
  revalidatePath('/competitions')

  return { error: null, success: true }
}
