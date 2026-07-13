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

  // 3. Seed phases — 6 tournament stages.
  //
  // NOTE: lock/reveal timestamps are intentionally NOT seeded here.
  // squad_lock_at / reveal_at (phase) and lock_at (scoring round) are
  // derived from real SportMonks fixture kickoffs by
  // autoCreateFMRoundsAndMatches (lib/sportmonks/db.ts) once fixtures are
  // ingested. Hand-entered timestamps were the source of a 2h timezone
  // bug (Italian wall-clock tagged as UTC) — fixtures are the single
  // source of truth so locks always track the real first kickoff, even if
  // FIFA reschedules. squad_open_at stays a fixed pre-tournament window.
  // sportmonks_stage_id maps each phase to its SportMonks stage so the
  // ingest attaches rounds/matches and derives locks automatically. Only
  // the group stage is known up front; knockout stage IDs are filled (via
  // the phase editor) once FIFA draws the bracket and SportMonks publishes
  // those stages.
  const phaseRows = [
    { kind: 'group_stage',  name: 'Fase a Gironi',     display_order: 1, squad_open_at: '2026-06-05T08:00:00Z', sportmonks_stage_id: 77478590 },
    { kind: 'round_of_32',  name: 'Sedicesimi',        display_order: 2, squad_open_at: '2026-06-27T08:00:00Z', sportmonks_stage_id: null },
    { kind: 'round_of_16',  name: 'Ottavi di Finale',  display_order: 3, squad_open_at: '2026-07-03T08:00:00Z', sportmonks_stage_id: null },
    { kind: 'quarter_final',name: 'Quarti di Finale',  display_order: 4, squad_open_at: '2026-07-08T08:00:00Z', sportmonks_stage_id: null },
    // Semifinali + Finali share ONE squad (league poll, 2026-07-13): a single
    // "Fase Finale" phase with two scoring rounds — Semifinali (both semis)
    // and Finali (3rd-place match + final). The 4 surviving nations each play
    // exactly two matches, so a per-stage redraft would be redundant.
    { kind: 'semi_final',   name: 'Fase Finale',       display_order: 5, squad_open_at: '2026-07-13T08:00:00Z', sportmonks_stage_id: null },
  ] as const

  const { error: phaseErr } = await supabase
    .from('fm_phase')
    .insert(phaseRows.map((p) => ({ ...p, competition_id: comp.id, budget_mode: 'comeback' as const })))
  if (phaseErr) throw new Error(phaseErr.message ?? 'Failed to create phases')

  // Scoring rounds are NOT seeded — autoCreateFMRoundsAndMatches creates
  // them per real SportMonks round with fixture-derived lock_at.

  redirect(`/controfantamondiale/${comp.id}` as Route)
}

export async function deleteCompetitionAction(competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_competition').delete().eq('id', competitionId)
  revalidatePath('/controfantamondiale')
}
