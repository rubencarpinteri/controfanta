'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'
import { DEFAULT_FM_CONFIG } from '@/domain/fantamondiale/config/defaults'
import type { Json } from '@/types/database.types'

export async function bootstrapWC2026Action() {
  await requireSuperAdmin()
  const supabase = await createClient()

  // 1. Create competition
  const { data: comp, error: compErr } = await supabase
    .from('fm_competition')
    .insert({
      name: 'ControFanta Mondiale',
      edition: '2026',
      timezone: 'Europe/Rome',
      status: 'draft',
      starts_at: '2026-06-12T12:00:00Z',
      ends_at: '2026-07-19T21:00:00Z',
    })
    .select()
    .single()
  if (compErr || !comp) throw new Error(compErr?.message ?? 'Failed to create competition')

  // 2. Seed config with WC defaults
  await supabase
    .from('fm_competition_config')
    .insert({ competition_id: comp.id, config: DEFAULT_FM_CONFIG as unknown as Json })

  // 3. Seed phases — 6 tournament stages
  const phaseRows = [
    { kind: 'group_stage',  name: 'Fase a Gironi',     display_order: 1, squad_open_at: '2026-06-05T08:00:00Z', squad_lock_at: '2026-06-11T21:00:00Z', reveal_at: '2026-06-11T21:05:00Z' },
    { kind: 'round_of_32',  name: 'Ottavi di Finale',  display_order: 2, squad_open_at: '2026-06-27T08:00:00Z', squad_lock_at: '2026-06-28T18:00:00Z', reveal_at: '2026-06-28T18:05:00Z' },
    { kind: 'round_of_16',  name: 'Sedicesimi',        display_order: 3, squad_open_at: '2026-07-03T08:00:00Z', squad_lock_at: '2026-07-04T17:00:00Z', reveal_at: '2026-07-04T17:05:00Z' },
    { kind: 'quarter_final',name: 'Quarti di Finale',  display_order: 4, squad_open_at: '2026-07-08T08:00:00Z', squad_lock_at: '2026-07-10T17:00:00Z', reveal_at: '2026-07-10T17:05:00Z' },
    { kind: 'semi_final',   name: 'Semifinali',        display_order: 5, squad_open_at: '2026-07-13T08:00:00Z', squad_lock_at: '2026-07-14T17:00:00Z', reveal_at: '2026-07-14T17:05:00Z' },
    { kind: 'final',        name: 'Finale',            display_order: 6, squad_open_at: '2026-07-17T08:00:00Z', squad_lock_at: '2026-07-18T17:00:00Z', reveal_at: '2026-07-18T17:05:00Z' },
  ] as const

  const { data: phases, error: phaseErr } = await supabase
    .from('fm_phase')
    .insert(phaseRows.map((p) => ({ ...p, competition_id: comp.id, budget_mode: 'comeback' as const })))
    .select()
  if (phaseErr || !phases) throw new Error(phaseErr?.message ?? 'Failed to create phases')

  const phaseByKind = Object.fromEntries(phases.map((p) => [p.kind, p.id]))

  // 4. Seed scoring rounds — 3 group matchdays + 1 per knockout stage
  const roundRows = [
    { phase_kind: 'group_stage',  name: 'Giornata 1',           display_order: 1, lineup_open_at: '2026-06-12T08:00:00Z', lock_at: '2026-06-12T20:55:00Z' },
    { phase_kind: 'group_stage',  name: 'Giornata 2',           display_order: 2, lineup_open_at: '2026-06-17T08:00:00Z', lock_at: '2026-06-17T20:55:00Z' },
    { phase_kind: 'group_stage',  name: 'Giornata 3',           display_order: 3, lineup_open_at: '2026-06-23T08:00:00Z', lock_at: '2026-06-23T20:55:00Z' },
    { phase_kind: 'round_of_32',  name: 'Ottavi di Finale',     display_order: 1, lineup_open_at: '2026-06-29T08:00:00Z', lock_at: '2026-06-29T20:55:00Z' },
    { phase_kind: 'round_of_16',  name: 'Sedicesimi di Finale', display_order: 1, lineup_open_at: '2026-07-04T08:00:00Z', lock_at: '2026-07-04T20:55:00Z' },
    { phase_kind: 'quarter_final',name: 'Quarti di Finale',     display_order: 1, lineup_open_at: '2026-07-10T08:00:00Z', lock_at: '2026-07-10T20:55:00Z' },
    { phase_kind: 'semi_final',   name: 'Semifinali',           display_order: 1, lineup_open_at: '2026-07-14T08:00:00Z', lock_at: '2026-07-14T20:55:00Z' },
    { phase_kind: 'final',        name: 'Finale',               display_order: 1, lineup_open_at: '2026-07-18T08:00:00Z', lock_at: '2026-07-18T20:55:00Z' },
  ]

  await supabase.from('fm_scoring_round').insert(
    roundRows.map(({ phase_kind, ...rest }) => ({
      ...rest,
      competition_id: comp.id,
      phase_id: phaseByKind[phase_kind]!,
      status: 'draft' as const,
    }))
  )

  redirect(`/controfantamondiale/${comp.id}` as Route)
}

export async function deleteCompetitionAction(competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_competition').delete().eq('id', competitionId)
  revalidatePath('/controfantamondiale')
}
