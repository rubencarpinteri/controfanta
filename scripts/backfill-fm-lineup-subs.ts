/**
 * Backfill the new real-match lineup columns (is_starter, sub minutes,
 * replaced/replacement player) on fm_player_match_stats for matches that
 * already played — the live cron only re-polls in-progress fixtures, so
 * finished matches (e.g. the WC opener) need a one-off re-parse from the
 * stored SportMonks payload.
 *
 * Re-parses sportmonks_fixtures.raw_payload and re-runs upsertFMPlayerStats,
 * which now writes the full lineup structure. Idempotent.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/backfill-fm-lineup-subs.ts
 */

import { createServiceClient } from '../lib/supabase/service'
import { parseFixture } from '../lib/sportmonks/parse'
import { fetchFixtureWithDetail } from '../lib/sportmonks/fixtures'
import { upsertFMPlayerStats } from '../lib/sportmonks/db'

async function main() {
  const db = createServiceClient()

  const { data: comps } = await db
    .from('fm_competition')
    .select('id, name, active_sportmonks_league_id')
  if (!comps?.length) {
    console.error('No fm_competition rows.')
    process.exit(1)
  }

  for (const comp of comps) {
    // Real matches that have kicked off (finished or in-progress) carry lineup
    // structure we want; the schedule payload in sportmonks_fixtures lacks it,
    // so re-fetch each fixture from the API with full includes. fm_real_match
    // links to a competition only through its scoring round.
    const { data: rounds } = await db
      .from('fm_scoring_round')
      .select('id')
      .eq('competition_id', comp.id)
    const roundIds = (rounds ?? []).map((r) => r.id)
    if (!roundIds.length) {
      console.log(`${comp.name}: no rounds`)
      continue
    }
    // DB status can be stale (seeded as 'scheduled'); the API state is
    // authoritative, so re-fetch every fixture and let the upsert set status +
    // lineup. Unplayed fixtures return empty lineups and are no-ops.
    const { data: matches } = await db
      .from('fm_real_match')
      .select('sportmonks_fixture_id, status')
      .in('scoring_round_id', roundIds)
      .not('sportmonks_fixture_id', 'is', null)
    if (!matches?.length) {
      console.log(`${comp.name}: no matches`)
      continue
    }

    let updated = 0
    let stats = 0
    for (const m of matches) {
      if (m.sportmonks_fixture_id == null) continue
      try {
        const fx = await fetchFixtureWithDetail(m.sportmonks_fixture_id)
        const parsed = parseFixture(fx)
        const r = await upsertFMPlayerStats(db, comp.id, parsed)
        if (r.match_updated) updated += 1
        stats += r.stats_upserted
      } catch (e) {
        console.log(`  fixture ${m.sportmonks_fixture_id} err: ${e instanceof Error ? e.message : e}`)
      }
    }
    console.log(`${comp.name}: ${matches.length} kicked-off, ${updated} updated, ${stats} stat rows`)
  }
}

main().then(() => process.exit(0))
