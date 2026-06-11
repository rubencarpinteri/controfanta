// ============================================================
// FantaMondiale — automatic round scheduling + knockout elimination
// ============================================================
// Two cheap, DB-only, idempotent sweeps meant to run on the 1-minute
// ratings-tick (and again on the daily fixtures-sync as a downtime
// backstop). Neither makes any SportMonks API call — they only act on
// data already persisted by the ingest path.
//
//   autoAdvanceRounds   — flips fm_scoring_round forward at its scheduled
//                         times: draft → open at lineup_open_at, then
//                         open → locked at lock_at. Forward-only, so a
//                         manual admin transition is never undone; admins
//                         override by advancing early or clearing a time.
//
//   autoEliminateNations — once a KNOCKOUT match is finished with a
//                         decisive result, marks the losing nation
//                         `eliminated` (so its coach/players drop out of
//                         the next redraft). The result comes from the
//                         SportMonks winner flag, so it names the side that
//                         advanced even when the tie went to penalties.
//                         Group-stage matches never eliminate on their own.
// ============================================================

import type { createServiceClient } from '@/lib/supabase/service'

type DB = ReturnType<typeof createServiceClient>

export async function autoAdvanceRounds(
  db: DB,
  nowIso: string = new Date().toISOString(),
): Promise<{ opened: number; locked: number }> {
  // draft → open once the lineup window has opened. Run first so a round
  // whose lock time ALSO already passed (e.g. cron downtime) cascades to
  // locked in the same sweep below.
  const { data: opened } = await db
    .from('fm_scoring_round')
    .update({ status: 'open' })
    .eq('status', 'draft')
    .not('lineup_open_at', 'is', null)
    .lte('lineup_open_at', nowIso)
    .select('id')

  // open → locked once the lock deadline has passed.
  const { data: locked } = await db
    .from('fm_scoring_round')
    .update({ status: 'locked' })
    .eq('status', 'open')
    .not('lock_at', 'is', null)
    .lte('lock_at', nowIso)
    .select('id')

  return { opened: opened?.length ?? 0, locked: locked?.length ?? 0 }
}

export async function autoEliminateNations(
  db: DB,
  nowIso: string = new Date().toISOString(),
): Promise<{ eliminated: number; nations: string[] }> {
  // Knockout phases only — a single group match never eliminates anyone.
  const { data: koPhases } = await db
    .from('fm_phase')
    .select('id')
    .neq('kind', 'group_stage')
  const koPhaseIds = (koPhases ?? []).map((p) => p.id)
  if (koPhaseIds.length === 0) return { eliminated: 0, nations: [] }

  const { data: koRounds } = await db
    .from('fm_scoring_round')
    .select('id')
    .in('phase_id', koPhaseIds)
  const koRoundIds = (koRounds ?? []).map((r) => r.id)
  if (koRoundIds.length === 0) return { eliminated: 0, nations: [] }

  // Finished knockout matches with a decisive winner flag. `result` is
  // home_win/away_win even for shootouts (SportMonks marks the advancer).
  const { data: matches } = await db
    .from('fm_real_match')
    .select('home_team_id, away_team_id, result')
    .in('scoring_round_id', koRoundIds)
    .eq('status', 'finished')
    .in('result', ['home_win', 'away_win'])

  const loserIds = new Set<string>()
  for (const m of matches ?? []) {
    const loser = m.result === 'home_win' ? m.away_team_id : m.home_team_id
    if (loser) loserIds.add(loser)
  }
  if (loserIds.size === 0) return { eliminated: 0, nations: [] }

  // Only flip nations that are still active — keeps the sweep idempotent and
  // preserves a manual override (an admin-restored nation stays active unless
  // it loses again).
  const { data: flipped } = await db
    .from('fm_national_team')
    .update({ status: 'eliminated', eliminated_at: nowIso })
    .in('id', Array.from(loserIds))
    .eq('status', 'active')
    .select('fifa_code')

  return { eliminated: flipped?.length ?? 0, nations: (flipped ?? []).map((t) => t.fifa_code) }
}
