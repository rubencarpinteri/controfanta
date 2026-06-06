// ============================================================
// FM live snapshot writer — called from the ratings-tick cron.
// ============================================================
// For every round that is currently live (≥1 match kicked off and not yet
// finished), recompute and persist the live board for each lega playing that
// round's competition. One row per (lega, round) in fm_live_round_snapshot.
//
// Computed once per league per tick — never on the page request path — so
// cost scales with live leagues, not viewers × leagues × ticks.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { computeLiveRoundSnapshot } from '@/domain/fantamondiale/engine/liveSnapshot'

type DB = SupabaseClient<Database>

export type LiveSnapshotWriteSummary = {
  live_rounds: number
  legas_processed: number
  snapshots_written: number
  errors: string[]
}

/**
 * Recompute + upsert live snapshots for all currently-live rounds.
 * Never throws — collects per-lega errors into the summary so a snapshot
 * failure can never break stats ingestion.
 */
export async function writeLiveSnapshots(db: DB): Promise<LiveSnapshotWriteSummary> {
  const summary: LiveSnapshotWriteSummary = {
    live_rounds: 0,
    legas_processed: 0,
    snapshots_written: 0,
    errors: [],
  }

  const nowIso = new Date().toISOString()

  // Rounds with ≥1 match that has kicked off and isn't finished/cancelled.
  // (After every match finishes, the round drops out and its last snapshot
  // simply persists until the finalization engine runs.)
  const { data: liveMatches, error: matchErr } = await db
    .from('fm_real_match')
    .select('scoring_round_id')
    .lte('kickoff_at', nowIso)
    .in('status', ['scheduled', 'in_progress'])
  if (matchErr) {
    summary.errors.push(`live-match query: ${matchErr.message}`)
    return summary
  }

  const liveRoundIds = [...new Set((liveMatches ?? []).map((m) => m.scoring_round_id))]
  summary.live_rounds = liveRoundIds.length
  if (liveRoundIds.length === 0) return summary

  // Map each live round → its competition, then competition → its legas.
  const { data: rounds } = await db
    .from('fm_scoring_round')
    .select('id, competition_id')
    .in('id', liveRoundIds)

  const competitionIds = [...new Set((rounds ?? []).map((r) => r.competition_id))]
  const { data: legas } = await db
    .from('fm_league_competition')
    .select('id, fm_competition_id')
    .in('fm_competition_id', competitionIds.length > 0 ? competitionIds : ['x'])

  const legasByCompetition = new Map<string, string[]>()
  for (const l of legas ?? []) {
    const arr = legasByCompetition.get(l.fm_competition_id) ?? []
    arr.push(l.id)
    legasByCompetition.set(l.fm_competition_id, arr)
  }

  for (const round of rounds ?? []) {
    const legaIds = legasByCompetition.get(round.competition_id) ?? []
    for (const legaCompId of legaIds) {
      summary.legas_processed += 1
      try {
        const snapshot = await computeLiveRoundSnapshot(round.id, legaCompId, db)
        if (!snapshot) continue
        const { error } = await db.from('fm_live_round_snapshot').upsert(
          {
            league_competition_id: legaCompId,
            scoring_round_id: round.id,
            snapshot: snapshot as unknown as Database['public']['Tables']['fm_live_round_snapshot']['Insert']['snapshot'],
            computed_at: snapshot.computed_at,
          },
          { onConflict: 'league_competition_id,scoring_round_id' },
        )
        if (error) {
          summary.errors.push(`upsert ${legaCompId}/${round.id}: ${error.message}`)
        } else {
          summary.snapshots_written += 1
        }
      } catch (e) {
        summary.errors.push(
          `compute ${legaCompId}/${round.id}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }

  return summary
}
