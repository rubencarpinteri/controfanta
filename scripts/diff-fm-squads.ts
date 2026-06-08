/**
 * FantaMondiale squad drift check (READ-ONLY).
 *
 * For every nation in an FM competition, fetches the CURRENT squad from
 * SportMonks and diffs it against what's stored in fm_player. Surfaces
 * last-minute roster changes — injured players dropped and their
 * replacements called up — that happened after the last seed.
 *
 * Nothing is written. This only prints a report; reconcile via the
 * admin UI or by re-running seed-fm-from-sportmonks.ts once reviewed.
 *
 * Usage:
 *   FM_COMPETITION_ID=<uuid> \
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/diff-fm-squads.ts
 */

import { createServiceClient } from '../lib/supabase/service'
import { fetchTeamSquad } from '../lib/sportmonks/squad'
import { positionIdToFMRole } from '../lib/sportmonks/positions'

const COMPETITION_ID = process.env.FM_COMPETITION_ID

if (!COMPETITION_ID) {
  console.error('Required env: FM_COMPETITION_ID')
  process.exit(1)
}

type DbPlayer = { sportmonks_player_id: number | null; name: string }

async function main() {
  const db = createServiceClient()

  // Nations that are wired to SportMonks (have a team id).
  const { data: teams, error: teamErr } = await db
    .from('fm_national_team')
    .select('id, name, sportmonks_team_id')
    .eq('competition_id', COMPETITION_ID!)
    .not('sportmonks_team_id', 'is', null)
    .order('name')
  if (teamErr) throw new Error(`fm_national_team: ${teamErr.message}`)
  if (!teams?.length) {
    console.log('No SportMonks-wired nations found.')
    return
  }

  console.log(`▸ Diffing ${teams.length} nations against live SportMonks squads\n`)

  let nationsWithChanges = 0
  let totalAdded = 0
  let totalDropped = 0

  for (const team of teams) {
    // Stored squad for this nation, keyed by SportMonks player id.
    const { data: dbRows } = await db
      .from('fm_player')
      .select('sportmonks_player_id, name')
      .eq('competition_id', COMPETITION_ID!)
      .eq('national_team_id', team.id)

    const dbById = new Map<number, DbPlayer>()
    for (const r of (dbRows ?? []) as DbPlayer[]) {
      if (r.sportmonks_player_id != null) dbById.set(r.sportmonks_player_id, r)
    }

    let liveSquad
    try {
      liveSquad = await fetchTeamSquad(team.sportmonks_team_id as number)
    } catch (e) {
      console.log(`  ⚠ ${team.name}: squad fetch failed — ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    // Live squad keyed by player id (only roles we track).
    const liveById = new Map<number, string>()
    for (const entry of liveSquad) {
      const role = positionIdToFMRole(entry.position_id ?? entry.player?.position_id ?? null)
      if (!role) continue
      const name = entry.player?.display_name ?? entry.player?.name ?? `Player ${entry.player_id}`
      liveById.set(entry.player_id, name)
    }

    // Called up now, not in DB → new / replacement players.
    const added: string[] = []
    for (const [id, name] of liveById) {
      if (!dbById.has(id)) added.push(`${name} (sm=${id})`)
    }
    // In DB, no longer in live squad → dropped (likely the injured ones).
    const dropped: string[] = []
    for (const [id, p] of dbById) {
      if (!liveById.has(id)) dropped.push(`${p.name} (sm=${id})`)
    }

    if (added.length === 0 && dropped.length === 0) continue

    nationsWithChanges += 1
    totalAdded += added.length
    totalDropped += dropped.length
    console.log(`  ● ${team.name}  (DB ${dbById.size} → live ${liveById.size})`)
    for (const a of added) console.log(`      + IN   ${a}`)
    for (const d of dropped) console.log(`      − OUT  ${d}`)
    console.log('')
  }

  console.log(`\n✓ Done. ${nationsWithChanges} nation(s) changed — ${totalAdded} in, ${totalDropped} out.`)
  if (nationsWithChanges === 0) {
    console.log('  All stored squads match the live SportMonks rosters.')
  } else {
    console.log('  Reconcile by re-running seed-fm-from-sportmonks.ts (idempotent) or editing in the admin UI.')
  }
}

main().catch((e) => {
  console.error('diff failed:', e)
  process.exit(1)
})
