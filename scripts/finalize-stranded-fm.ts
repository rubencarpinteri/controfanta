/**
 * One-off: settle any FM match stuck `in_progress` because its FT was never
 * observed on the inplay feed. Mirrors the ratings-tick backstop.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/finalize-stranded-fm.ts
 */

import { createServiceClient } from '../lib/supabase/service'
import { finalizeStrandedFMMatches, listActiveLeagueRefs } from '../lib/sportmonks/db'

async function main() {
  const db = createServiceClient()
  const refs = await listActiveLeagueRefs(db)
  const fmCompetitionIds = refs.filter((r) => r.product === 'fm').map((r) => r.owner_id)
  console.log(`FM competitions: ${fmCompetitionIds.length}`)
  const res = await finalizeStrandedFMMatches(db, fmCompetitionIds, new Set<number>())
  console.log(JSON.stringify(res, null, 2))
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
