'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext, isSuperAdmin } from '@/lib/league'
import { slugify } from '@/lib/slug'
import { seedLegaFantasyLayer } from '@/lib/fantamondiale/seedLegaFantasyLayer'

/**
 * Opt the current Lega into a global FM tournament (WC/Euros/Nations/CL).
 * League admins (or super admins) only. Creates the per-Lega instance row
 * and redirects to its detail page.
 */
export async function optLegaIntoFMCompetitionAction(
  fmCompetitionId: string,
): Promise<never> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const allowed = ctx.role === 'league_admin' || (await isSuperAdmin())
  if (!allowed) throw new Error('Solo gli amministratori della Lega possono iscrivere la Lega.')

  const { data: comp } = await supabase
    .from('fm_competition')
    .select('id, name, edition, status')
    .eq('id', fmCompetitionId)
    .maybeSingle()
  if (!comp) throw new Error('Competizione non trovata.')
  if (comp.status === 'completed' || comp.status === 'archived') {
    throw new Error('Le iscrizioni a questa competizione sono chiuse.')
  }

  // Enroll the Lega via a SECURITY DEFINER function. The slug must be globally
  // unique, but RLS hides other leagues' rows from a client query — so building
  // the slug client-side produced duplicates and a 500. The function generates
  // the slug seeing all rows and inserts atomically (idempotent: returns the
  // existing instance id if already enrolled).
  const baseSlug = slugify(`${comp.name}-${comp.edition}`)
  const { data: legaCompId, error } = await supabase.rpc('opt_lega_into_fm', {
    p_league_id: ctx.league.id,
    p_fm_competition_id: fmCompetitionId,
    p_base_slug: baseSlug,
  })

  if (error || !legaCompId) {
    throw new Error(error?.message ?? 'Impossibile iscrivere la Lega.')
  }

  // Resolve the slug for the redirect (readable: the Lega's own instance).
  const { data: row } = await supabase
    .from('fm_league_competition')
    .select('slug')
    .eq('id', legaCompId)
    .maybeSingle()

  // Clone the editable fantasy layer (cadence/budget, prices, config) so this
  // Lega's admin starts from the global defaults and can diverge freely.
  await seedLegaFantasyLayer(supabase, legaCompId, fmCompetitionId)

  revalidatePath('/dashboard')
  redirect(`/controfantamondiale/${row?.slug ?? legaCompId}` as Route)
}
