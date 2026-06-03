/**
 * Generalized FantaMondiale seed.
 *
 * Pulls the full team + squad roster for any SportMonks league/season
 * into an EXISTING fm_competition. Matches against current
 * fm_national_team rows by normalized name and FIFA code so any work
 * done in the admin UI (flags, UUIDs, custom edits) is preserved —
 * existing rows are enriched with sportmonks_team_id, missing nations
 * are inserted, orphans (in DB but not in SportMonks' season) are
 * reported (NOT deleted — admin removes via UI).
 *
 * Usage (after the WC SportMonks plan is active, June 1):
 *   FM_COMPETITION_ID=<uuid> \
 *   SPORTMONKS_LEAGUE_ID=<wc_league_id> \
 *   SPORTMONKS_SEASON_ID=<wc_season_id> \
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/seed-fm-from-sportmonks.ts
 *
 * The script is idempotent — safe to re-run after federations announce
 * roster changes, though the daily fixtures-sync cron also re-fetches
 * squads automatically.
 */

import { createServiceClient } from '../lib/supabase/service'
import { listTeamsInSeason, fetchCountryFlags, fetchTeamSquad, fetchTeamCoach } from '../lib/sportmonks/squad'
import { positionIdToFMRole } from '../lib/sportmonks/positions'

const COMPETITION_ID = process.env.FM_COMPETITION_ID
const LEAGUE_ID = Number(process.env.SPORTMONKS_LEAGUE_ID)
const SEASON_ID = Number(process.env.SPORTMONKS_SEASON_ID)

if (!COMPETITION_ID || !LEAGUE_ID || !SEASON_ID) {
  console.error('Required env: FM_COMPETITION_ID, SPORTMONKS_LEAGUE_ID, SPORTMONKS_SEASON_ID')
  process.exit(1)
}

// Common name aliases: SportMonks may use different official names than
// what fans/admins type. Match in both directions.
const NAME_ALIASES: Record<string, string[]> = {
  'south korea': ['korea republic', 'korea, south', 'republic of korea'],
  'north korea': ['korea dpr', 'korea, north', 'dpr korea'],
  'united states': ['usa', 'united states of america'],
  'czechia': ['czech republic'],
  'cape verde': ['cabo verde'],
  'ivory coast': ["cote d'ivoire", "côte d'ivoire"],
  'iran': ['ir iran', 'islamic republic of iran'],
  'türkiye': ['turkey', 'turkiye'],
  'bosnia and herzegovina': ['bosnia & herzegovina', 'bosnia-herzegovina'],
  'curaçao': ['curacao'],
  'dr congo': ['democratic republic of congo', 'congo dr'],
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameVariants(name: string): Set<string> {
  const base = normalizeName(name)
  const out = new Set<string>([base])
  // Direct lookup
  for (const alt of NAME_ALIASES[base] ?? []) out.add(normalizeName(alt))
  // Reverse lookup
  for (const [canon, alts] of Object.entries(NAME_ALIASES)) {
    if (alts.map(normalizeName).includes(base)) out.add(canon)
  }
  return out
}

function namesOverlap(a: string, b: string): boolean {
  const va = nameVariants(a)
  for (const v of nameVariants(b)) {
    if (va.has(v)) return true
  }
  return false
}

function buildFifaCode(name: string, used: Set<string>): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase()
  let code = (letters.slice(0, 3) || 'TBD').padEnd(3, 'X')
  let suffix = 0
  while (used.has(code)) {
    suffix += 1
    code = letters.slice(0, 2).padEnd(2, 'X') + String(suffix)
  }
  used.add(code)
  return code
}

async function main() {
  const db = createServiceClient()

  console.log(`▸ Seeding FM competition ${COMPETITION_ID}`)
  console.log(`  SportMonks league=${LEAGUE_ID}, season=${SEASON_ID}\n`)

  // ---------- 1. Verify + activate competition ----------
  const { data: comp, error: compErr } = await db
    .from('fm_competition')
    .select('id, name, active_sportmonks_league_id')
    .eq('id', COMPETITION_ID!)
    .maybeSingle()
  if (compErr) throw new Error(`fm_competition lookup: ${compErr.message}`)
  if (!comp) throw new Error(`fm_competition ${COMPETITION_ID} not found`)
  console.log(`  competition: "${comp.name}"`)

  if (comp.active_sportmonks_league_id !== LEAGUE_ID) {
    await db.from('fm_competition')
      .update({ active_sportmonks_league_id: LEAGUE_ID })
      .eq('id', COMPETITION_ID!)
    console.log(`  → set active_sportmonks_league_id=${LEAGUE_ID}`)
  }

  // ---------- 2. Fetch teams from SportMonks ----------
  const smTeams = await listTeamsInSeason(SEASON_ID)
  console.log(`  ${smTeams.length} real national teams in SportMonks season ${SEASON_ID}`)

  const flagByCountry = await fetchCountryFlags(
    smTeams.map((t) => t.country_id).filter((id): id is number => id != null),
  )
  console.log(`  ${flagByCountry.size} country flags fetched\n`)

  // ---------- 3. Load existing fm_national_team rows ----------
  const { data: existingTeams } = await db
    .from('fm_national_team')
    .select('id, name, fifa_code, sportmonks_team_id')
    .eq('competition_id', COMPETITION_ID!)

  const usedFifaCodes = new Set((existingTeams ?? []).map((t) => t.fifa_code))
  const matchedSmIds = new Set<number>()
  const teamUuidBySmId = new Map<number, string>()

  // ---------- 4. Match + upsert teams ----------
  let teams_matched = 0
  let teams_inserted = 0
  const orphans: Array<{ id: string; name: string; fifa_code: string }> = []

  for (const sm of smTeams) {
    // Official assets from SportMonks — the single source of truth.
    const logoUrl = sm.image_path ?? null
    const flagUrl = sm.country_id != null ? (flagByCountry.get(sm.country_id) ?? null) : null
    // Prefer the official SportMonks short_code; fall back to a derived
    // code only in the impossible case it's missing.
    const fifaCode = sm.short_code ?? buildFifaCode(sm.name, usedFifaCodes)

    // Already wired (sportmonks_team_id set): refresh assets + official code.
    const byId = (existingTeams ?? []).find((t) => t.sportmonks_team_id === sm.id)
    if (byId) {
      await db.from('fm_national_team')
        .update({ fifa_code: fifaCode, logo_url: logoUrl, flag_url: flagUrl })
        .eq('id', byId.id)
      matchedSmIds.add(sm.id)
      teamUuidBySmId.set(sm.id, byId.id)
      teams_matched += 1
      continue
    }

    // Match by name (with aliases): wire id + assets + official code.
    // Existing curated display name is preserved.
    const byName = (existingTeams ?? []).find((t) => namesOverlap(t.name, sm.name))
    if (byName) {
      await db.from('fm_national_team')
        .update({ sportmonks_team_id: sm.id, fifa_code: fifaCode, logo_url: logoUrl, flag_url: flagUrl })
        .eq('id', byName.id)
      matchedSmIds.add(sm.id)
      teamUuidBySmId.set(sm.id, byName.id)
      teams_matched += 1
      console.log(`  ✓ matched "${byName.name}" → sm=${sm.id} (${fifaCode})`)
      continue
    }

    // Insert new team with official name, code, logo and flag.
    const { data: created, error } = await db.from('fm_national_team').insert({
      competition_id: COMPETITION_ID!,
      name: sm.name,
      fifa_code: fifaCode,
      logo_url: logoUrl,
      flag_url: flagUrl,
      sportmonks_team_id: sm.id,
      status: 'active',
    }).select('id').single()
    if (error) {
      console.error(`  ✗ insert "${sm.name}" failed: ${error.message}`)
      continue
    }
    matchedSmIds.add(sm.id)
    teamUuidBySmId.set(sm.id, created.id)
    teams_inserted += 1
    console.log(`  + inserted "${sm.name}" (${fifaCode})`)
  }

  // Orphans: in DB but not in SportMonks season
  for (const t of existingTeams ?? []) {
    if (t.sportmonks_team_id && matchedSmIds.has(t.sportmonks_team_id)) continue
    if (!t.sportmonks_team_id && !smTeams.some((sm) => namesOverlap(t.name, sm.name))) {
      orphans.push({ id: t.id, name: t.name, fifa_code: t.fifa_code })
    }
  }

  console.log(`\n  ${teams_matched} matched, ${teams_inserted} new, ${orphans.length} orphan(s)`)
  if (orphans.length) {
    console.log(`  Orphans (not in SportMonks season — remove via admin UI if obsolete):`)
    for (const o of orphans) console.log(`    - ${o.name} (${o.fifa_code})`)
  }

  // ---------- 5. Squads ----------
  console.log(`\n▸ Fetching squads...`)
  let players_inserted = 0
  let players_updated = 0
  const squadErrors: string[] = []

  for (const sm of smTeams) {
    const teamUuid = teamUuidBySmId.get(sm.id)
    if (!teamUuid) continue
    try {
      const squad = await fetchTeamSquad(sm.id)
      for (const entry of squad) {
        const role = positionIdToFMRole(entry.position_id ?? entry.player?.position_id ?? null)
        if (!role) continue
        const playerName = entry.player.display_name ?? entry.player.name ?? `Player ${entry.player_id}`
        const photoUrl = entry.player.image_path ?? null

        const { data: existing } = await db
          .from('fm_player')
          .select('id')
          .eq('competition_id', COMPETITION_ID!)
          .eq('sportmonks_player_id', entry.player_id)
          .maybeSingle()

        if (existing) {
          await db.from('fm_player').update({
            national_team_id: teamUuid,
            name: playerName,
            role,
            shirt_number: entry.jersey_number,
            photo_url: photoUrl,
          }).eq('id', existing.id)
          players_updated += 1
        } else {
          const { error } = await db.from('fm_player').insert({
            competition_id: COMPETITION_ID!,
            national_team_id: teamUuid,
            name: playerName,
            role,
            shirt_number: entry.jersey_number,
            photo_url: photoUrl,
            sportmonks_player_id: entry.player_id,
          })
          if (error) squadErrors.push(`${sm.name} / ${playerName}: ${error.message}`)
          else players_inserted += 1
        }
      }
    } catch (e) {
      squadErrors.push(`squad ${sm.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`  ${players_inserted} new, ${players_updated} updated`)
  if (squadErrors.length) {
    console.log(`  ${squadErrors.length} squad error(s):`)
    for (const e of squadErrors.slice(0, 10)) console.log(`    - ${e}`)
    if (squadErrors.length > 10) console.log(`    ...and ${squadErrors.length - 10} more`)
  }

  // ---------- 6. Coaches (best-effort) ----------
  console.log(`\n▸ Fetching coaches (best-effort)...`)
  let coaches_inserted = 0
  let coaches_failed = 0
  for (const sm of smTeams) {
    const teamUuid = teamUuidBySmId.get(sm.id)
    if (!teamUuid) continue
    try {
      const coach = await fetchTeamCoach(sm.id)
      if (!coach) continue
      const { data: existing } = await db
        .from('fm_coach')
        .select('id')
        .eq('competition_id', COMPETITION_ID!)
        .eq('national_team_id', teamUuid)
        .maybeSingle()
      if (existing) {
        await db.from('fm_coach').update({
          name: coach.name,
          sportmonks_coach_id: coach.id,
        }).eq('id', existing.id)
      } else {
        await db.from('fm_coach').insert({
          competition_id: COMPETITION_ID!,
          national_team_id: teamUuid,
          name: coach.name,
          sportmonks_coach_id: coach.id,
        })
        coaches_inserted += 1
      }
    } catch {
      coaches_failed += 1
    }
  }
  console.log(`  ${coaches_inserted} inserted, ${coaches_failed} failed (free tier likely)`)

  console.log(`\n✓ Done.`)
  console.log(`  competition_id: ${COMPETITION_ID}`)
  console.log(`  league_id:      ${LEAGUE_ID}`)
  console.log(`\nNext: trigger fixtures-sync to populate fm_real_match rows:`)
  console.log(`  curl -H 'Authorization: Bearer $CRON_SECRET' \\`)
  console.log(`       https://controfanta.vercel.app/api/cron/sportmonks-fixtures-sync`)
}

main().catch((e) => {
  console.error('seed failed:', e)
  process.exit(1)
})
