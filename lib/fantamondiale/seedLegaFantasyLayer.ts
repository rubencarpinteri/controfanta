// ============================================================
// Seed a Lega's per-league fantasy layer from the global template.
// ============================================================
// When a Lega enrolls into a global FM tournament, it gets its own editable
// copy of the fantasy layer (redraft cadence + budget, prices, fantasy config)
// keyed by fm_league_competition.id, cloned from the shared template. The real-
// world layer (fixtures, pool, phase timing, scoring rounds) stays global.
//
// Idempotent: every write uses ON CONFLICT DO NOTHING / ignoreDuplicates, so a
// re-run (or a Lega enrolled before this layer existed and later backfilled)
// never overwrites a league admin's edits.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Supabase = SupabaseClient<Database>

export async function seedLegaFantasyLayer(
  supabase: Supabase,
  legaCompId: string,
  globalCompetitionId: string,
): Promise<void> {
  // Global phases for this tournament (carry the cadence/budget defaults).
  const { data: phases } = await supabase
    .from('fm_phase')
    .select('id, requires_new_squad, budget_mode, budget_config')
    .eq('competition_id', globalCompetitionId)

  const phaseList = phases ?? []
  if (phaseList.length > 0) {
    await supabase.from('fm_league_phase').upsert(
      phaseList.map((p) => ({
        league_competition_id: legaCompId,
        phase_id: p.id,
        requires_new_squad: p.requires_new_squad,
        budget_mode: p.budget_mode,
        budget_config: p.budget_config,
      })),
      { onConflict: 'league_competition_id,phase_id', ignoreDuplicates: true },
    )
  }

  // Prices: clone the global per-phase prices for every phase of this tournament.
  const phaseIds = phaseList.map((p) => p.id)
  if (phaseIds.length > 0) {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data: prices } = await supabase
        .from('fm_phase_player_price')
        .select('phase_id, player_id, price, source')
        .in('phase_id', phaseIds)
        .range(from, from + PAGE - 1)
      const batch = prices ?? []
      if (batch.length > 0) {
        await supabase.from('fm_league_phase_player_price').upsert(
          batch.map((r) => ({
            league_competition_id: legaCompId,
            phase_id: r.phase_id,
            player_id: r.player_id,
            price: r.price,
            source: r.source,
          })),
          { onConflict: 'league_competition_id,phase_id,player_id', ignoreDuplicates: true },
        )
      }
      if (batch.length < PAGE) break
    }
  }

  // Fantasy config: clone the global config blob.
  const { data: globalCfg } = await supabase
    .from('fm_competition_config')
    .select('config')
    .eq('competition_id', globalCompetitionId)
    .maybeSingle()

  await supabase.from('fm_league_competition_config').upsert(
    { league_competition_id: legaCompId, config: globalCfg?.config ?? {} },
    { onConflict: 'league_competition_id', ignoreDuplicates: true },
  )
}
