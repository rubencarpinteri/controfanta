/**
 * One-off: recompute + persist the live snapshot for a single (lega, round)
 * so newly-added snapshot fields (match team ids, player national_team_id)
 * land without waiting for the ratings-tick cron. Verification helper.
 *
 * Usage:
 *   FM_LEGA_COMP_ID=<uuid> FM_ROUND_ID=<uuid> \
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/recompute-live-snapshot.ts
 */

import { createServiceClient } from '../lib/supabase/service'
import { computeLiveRoundSnapshot } from '../domain/fantamondiale/engine/liveSnapshot'

const LEGA_COMP_ID = process.env.FM_LEGA_COMP_ID
const ROUND_ID = process.env.FM_ROUND_ID

async function main() {
  const db = createServiceClient()

  // Recompute every persisted (lega, round) row, or a single one if ids given.
  let rows: { league_competition_id: string; scoring_round_id: string }[]
  if (LEGA_COMP_ID && ROUND_ID) {
    rows = [{ league_competition_id: LEGA_COMP_ID, scoring_round_id: ROUND_ID }]
  } else {
    const { data } = await db
      .from('fm_live_round_snapshot')
      .select('league_competition_id, scoring_round_id')
    rows = data ?? []
  }
  console.log(`Recomputing ${rows.length} snapshot row(s)…`)

  for (const row of rows) {
    const snapshot = await computeLiveRoundSnapshot(
      row.scoring_round_id,
      row.league_competition_id,
      db,
    )
    if (!snapshot) {
      console.log(`  skip ${row.league_competition_id} (null)`)
      continue
    }
    const { error } = await db
      .from('fm_live_round_snapshot')
      .upsert(
        {
          league_competition_id: row.league_competition_id,
          scoring_round_id: row.scoring_round_id,
          snapshot: snapshot as never,
          computed_at: snapshot.computed_at,
        },
        { onConflict: 'league_competition_id,scoring_round_id' },
      )
    const sample = snapshot.matches.flatMap((m) => m.players)[0]
    console.log(
      `  ${error ? 'ERR ' + error.message : 'ok'} lega=${row.league_competition_id} nation=${sample?.national_team_id ?? 'none'}`,
    )
  }
}

main().then(() => process.exit(0))
