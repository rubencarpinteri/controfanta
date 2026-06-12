/**
 * SportMonks ↔ Supabase glue.
 *
 * All writes go through the service-role client (RLS bypassed).
 * The cron routes are the only callers; UI code should never
 * touch these helpers directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { fetchTeamSquad, fetchTeamCoach } from './squad'
import { positionIdToFMRole } from './positions'
import type { ParsedFixture, SMFixture } from './types'

type DB = SupabaseClient<Database>

// ============================================================
// Active leagues
// ============================================================

export type ActiveLeagueRef = {
  /** Which product owns this row: 'serie_a' (leagues table) or 'fm' (fm_competition table). */
  product: 'serie_a' | 'fm'
  /** PK in the owning table. */
  owner_id: string
  /** SportMonks league ID to fetch. */
  sportmonks_league_id: number
}

export async function listActiveLeagueRefs(db: DB): Promise<ActiveLeagueRef[]> {
  const refs: ActiveLeagueRef[] = []

  const { data: leagues } = await db
    .from('leagues')
    .select('id, active_sportmonks_league_id')
    .not('active_sportmonks_league_id', 'is', null)
  for (const l of leagues ?? []) {
    if (l.active_sportmonks_league_id != null) {
      refs.push({ product: 'serie_a', owner_id: l.id, sportmonks_league_id: l.active_sportmonks_league_id })
    }
  }

  const { data: comps } = await db
    .from('fm_competition')
    .select('id, active_sportmonks_league_id')
    .not('active_sportmonks_league_id', 'is', null)
  for (const c of comps ?? []) {
    if (c.active_sportmonks_league_id != null) {
      refs.push({ product: 'fm', owner_id: c.id, sportmonks_league_id: c.active_sportmonks_league_id })
    }
  }

  return refs
}

// ============================================================
// Fixture cache upsert
// ============================================================

function smFixtureToCacheRow(fx: SMFixture) {
  const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
  const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
  const kickoff = fx.starting_at_timestamp
    ? new Date(fx.starting_at_timestamp * 1000).toISOString()
    : new Date(fx.starting_at + 'Z').toISOString()
  return {
    sportmonks_fixture_id: fx.id,
    league_id: fx.league_id,
    season_id: fx.season_id,
    stage_id: fx.stage_id ?? null,
    round_id: fx.round_id ?? null,
    home_team_id: home?.id ?? null,
    away_team_id: away?.id ?? null,
    home_team_name: home?.name ?? null,
    away_team_name: away?.name ?? null,
    kickoff_at: kickoff,
    state_id: fx.state_id,
    state_name: fx.state?.name ?? null,
    length_minutes: fx.length,
    raw_payload: fx as unknown as Json,
    fetched_at: new Date().toISOString(),
  }
}

export async function upsertFixtureCache(db: DB, fixtures: SMFixture[]): Promise<number> {
  if (!fixtures.length) return 0
  const rows = fixtures.map(smFixtureToCacheRow)
  const { error } = await db.from('sportmonks_fixtures').upsert(rows, { onConflict: 'sportmonks_fixture_id' })
  if (error) throw new Error(`upsertFixtureCache: ${error.message}`)
  return rows.length
}

// ============================================================
// ControFanta Mondiale auto-create: rounds + matches from fixtures
// ============================================================

/**
 * For a single FM competition, ensure each unique SportMonks round_id
 * has a corresponding fm_scoring_round, and each fixture has a
 * corresponding fm_real_match. Idempotent.
 *
 * Phase selection: uses the highest display_order non-archived phase
 * of the competition. The admin can re-parent rounds via the UI.
 */
export async function autoCreateFMRoundsAndMatches(
  db: DB,
  competition_id: string,
  fixtures: SMFixture[],
): Promise<{ rounds_created: number; matches_created: number }> {
  if (!fixtures.length) return { rounds_created: 0, matches_created: 0 }

  // Map each SportMonks stage_id to its fm_phase. This is the single
  // source of truth for attaching ingested rounds/matches to the correct
  // tournament phase — replacing the old "highest display_order" heuristic
  // that dumped every round onto one phase and required manual re-parenting.
  // Phases without a sportmonks_stage_id (e.g. knockout phases before the
  // bracket is drawn) simply aren't matched yet; their fixtures are skipped
  // until the mapping is filled.
  const { data: phases } = await db
    .from('fm_phase')
    .select('id, display_order, status, sportmonks_stage_id')
    .eq('competition_id', competition_id)
    .neq('status', 'completed')
  const stageToPhase = new Map<number, { id: string }>()
  for (const p of phases ?? []) {
    if (p.sportmonks_stage_id != null) stageToPhase.set(p.sportmonks_stage_id, { id: p.id })
  }
  if (!stageToPhase.size) {
    console.warn('[autoCreateFMRoundsAndMatches] no phase has sportmonks_stage_id set; nothing to attach')
    return { rounds_created: 0, matches_created: 0 }
  }

  // Resolve team UUIDs by sportmonks_team_id
  const teamSmIds = new Set<number>()
  for (const fx of fixtures) {
    const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
    const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
    if (home?.id) teamSmIds.add(home.id)
    if (away?.id) teamSmIds.add(away.id)
  }
  const { data: teamRows } = await db
    .from('fm_national_team')
    .select('id, sportmonks_team_id')
    .eq('competition_id', competition_id)
    .in('sportmonks_team_id', Array.from(teamSmIds))
  const teamSmToUuid = new Map<number, string>()
  for (const t of teamRows ?? []) {
    if (t.sportmonks_team_id != null) teamSmToUuid.set(t.sportmonks_team_id, t.id)
  }

  // Group fixtures by SportMonks round_id
  const byRound = new Map<number, SMFixture[]>()
  const orphans: SMFixture[] = []
  for (const fx of fixtures) {
    if (fx.round_id == null) {
      orphans.push(fx)
      continue
    }
    const arr = byRound.get(fx.round_id) ?? []
    arr.push(fx)
    byRound.set(fx.round_id, arr)
  }

  let rounds_created = 0
  let matches_created = 0
  const touchedPhaseIds = new Set<string>()

  for (const [roundId, roundFixtures] of byRound) {
    // Resolve the phase from the round's stage. SM groups fixtures into
    // stages; we attach the round to the phase mapped to that stage_id.
    const stageId = roundFixtures.find((f) => f.stage_id != null)?.stage_id ?? null
    const targetPhase = stageId != null ? stageToPhase.get(stageId) : undefined
    if (!targetPhase) {
      console.warn(`[autoCreateFMRoundsAndMatches] round ${roundId} stage ${stageId ?? 'null'} has no mapped phase, skipping`)
      continue
    }

    const earliestKickoff = roundFixtures
      .map((f) => f.starting_at_timestamp ? new Date(f.starting_at_timestamp * 1000) : new Date(f.starting_at + 'Z'))
      .sort((a, b) => a.getTime() - b.getTime())[0]
    if (!earliestKickoff) continue
    const lockAt = new Date(earliestKickoff.getTime() - 1 * 60 * 1000).toISOString()

    const roundNameFromSM = roundFixtures.find((f) => f.round?.name)?.round?.name
    const roundName = roundNameFromSM ? `Giornata ${roundNameFromSM}` : `Round ${roundId}`
    const displayOrder = roundNameFromSM && !isNaN(parseInt(roundNameFromSM, 10))
      ? parseInt(roundNameFromSM, 10)
      : roundId

    // Upsert by (competition_id, name) — there is no SM round_id column on
    // fm_scoring_round; we encode it in the name. Idempotent because name
    // is stable per SportMonks round.
    const { data: existing } = await db
      .from('fm_scoring_round')
      .select('id')
      .eq('competition_id', competition_id)
      .eq('name', roundName)
      .maybeSingle()

    let scoringRoundId = existing?.id
    if (!scoringRoundId) {
      const { data: inserted, error } = await db
        .from('fm_scoring_round')
        .insert({
          competition_id,
          phase_id: targetPhase.id,
          name: roundName,
          display_order: displayOrder,
          lock_at: lockAt,
          status: 'draft',
        })
        .select('id')
        .single()
      if (error) throw new Error(`autoCreateFMRounds: insert round ${roundName}: ${error.message}`)
      scoringRoundId = inserted.id
      rounds_created += 1
    }

    // Upsert fm_real_match rows
    for (const fx of roundFixtures) {
      const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
      const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
      if (!home?.id || !away?.id) continue
      const homeUuid = teamSmToUuid.get(home.id)
      const awayUuid = teamSmToUuid.get(away.id)
      if (!homeUuid || !awayUuid) continue

      const { data: existingMatch } = await db
        .from('fm_real_match')
        .select('id')
        .eq('sportmonks_fixture_id', fx.id)
        .maybeSingle()
      if (existingMatch) continue

      const kickoff = fx.starting_at_timestamp
        ? new Date(fx.starting_at_timestamp * 1000).toISOString()
        : new Date(fx.starting_at + 'Z').toISOString()
      const { error } = await db.from('fm_real_match').insert({
        scoring_round_id: scoringRoundId,
        home_team_id: homeUuid,
        away_team_id: awayUuid,
        kickoff_at: kickoff,
        status: 'scheduled',
        sportmonks_fixture_id: fx.id,
      })
      if (error) throw new Error(`autoCreateFMMatches: insert match ${fx.id}: ${error.message}`)
      matches_created += 1
    }

    touchedPhaseIds.add(targetPhase.id)
  }

  if (orphans.length) {
    console.warn(`[autoCreateFMRoundsAndMatches] ${orphans.length} fixtures with no round_id, skipping`)
  }

  // Derive each touched phase's squad lock / reveal from real fixtures, so
  // the rosa lock tracks the actual first kickoff of the phase (and
  // re-tracks automatically if FIFA reschedules). squad_lock_at = earliest
  // kickoff across all of the phase's matches; reveal_at = +5 min. This is
  // the single source of truth — no hand-entered timestamps.
  for (const phaseId of touchedPhaseIds) {
    const { data: phaseRoundIds } = await db
      .from('fm_scoring_round')
      .select('id')
      .eq('phase_id', phaseId)
    const roundIds = (phaseRoundIds ?? []).map((r) => r.id)
    if (!roundIds.length) continue
    const { data: firstMatch } = await db
      .from('fm_real_match')
      .select('kickoff_at')
      .in('scoring_round_id', roundIds)
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (firstMatch?.kickoff_at) {
      const firstKickoff = new Date(firstMatch.kickoff_at)
      const squadLockAt = firstKickoff.toISOString()
      const revealAt = new Date(firstKickoff.getTime() + 5 * 60 * 1000).toISOString()
      await db
        .from('fm_phase')
        .update({ squad_lock_at: squadLockAt, reveal_at: revealAt })
        .eq('id', phaseId)
    }
  }

  return { rounds_created, matches_created }
}

// ============================================================
// ControFanta Mondiale: daily squad refresh
// ============================================================

/**
 * Re-fetch every national team's squad from SportMonks and upsert
 * fm_player rows. Idempotent: existing players (matched by
 * sportmonks_player_id) get their name/role/shirt_number/team
 * updated; new players are inserted; missing players are NOT
 * deleted (a player dropped from a roster keeps their historical
 * stats but won't appear in new squads picked through the UI —
 * handled separately if needed).
 *
 * One SportMonks call per team. For WC2026: 32 calls/day, trivial
 * against the rate-limit budget. Returns a summary for the cron log.
 */
export async function refreshFMSquads(
  db: DB,
  competition_id: string,
): Promise<{ teams_processed: number; players_upserted: number; errors: string[] }> {
  const { data: teams } = await db
    .from('fm_national_team')
    .select('id, name, sportmonks_team_id')
    .eq('competition_id', competition_id)
    .not('sportmonks_team_id', 'is', null)

  const errors: string[] = []
  let players_upserted = 0
  let teams_processed = 0

  for (const team of teams ?? []) {
    if (team.sportmonks_team_id == null) continue
    teams_processed += 1
    try {
      const squad = await fetchTeamSquad(team.sportmonks_team_id)
      for (const entry of squad) {
        const role = positionIdToFMRole(entry.position_id ?? entry.player?.position_id ?? null)
        if (!role) continue
        const playerName = entry.player.display_name ?? entry.player.name ?? `Player ${entry.player_id}`

        const { data: existing } = await db
          .from('fm_player')
          .select('id')
          .eq('competition_id', competition_id)
          .eq('sportmonks_player_id', entry.player_id)
          .maybeSingle()

        if (existing) {
          // NB: `role` is intentionally NOT updated here. Managers draft players
          // by role and lineup/quota validity depends on it; letting a daily
          // SportMonks reclassification flip a drafted player's role mid-tournament
          // would silently invalidate rosters. Role is set once at insert and
          // only ever changed deliberately by an admin. Cosmetic fields stay fresh.
          await db.from('fm_player').update({
            national_team_id: team.id,
            name: playerName,
            shirt_number: entry.jersey_number,
          }).eq('id', existing.id)
        } else {
          const { error } = await db.from('fm_player').insert({
            competition_id,
            national_team_id: team.id,
            name: playerName,
            role,
            shirt_number: entry.jersey_number,
            sportmonks_player_id: entry.player_id,
          })
          if (error) {
            errors.push(`team ${team.name}, player ${entry.player_id}: ${error.message}`)
          } else {
            players_upserted += 1
          }
        }
      }
    } catch (e) {
      errors.push(`team ${team.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Coach upsert — best-effort per team
  for (const team of teams ?? []) {
    if (team.sportmonks_team_id == null) continue
    try {
      const coach = await fetchTeamCoach(team.sportmonks_team_id)
      if (!coach) continue
      const { data: existing } = await db
        .from('fm_coach')
        .select('id')
        .eq('competition_id', competition_id)
        .eq('national_team_id', team.id)
        .maybeSingle()
      if (existing) {
        await db.from('fm_coach').update({ name: coach.name, sportmonks_coach_id: coach.id }).eq('id', existing.id)
      } else {
        await db.from('fm_coach').insert({
          competition_id,
          national_team_id: team.id,
          name: coach.name,
          sportmonks_coach_id: coach.id,
        })
      }
    } catch {
      // coach endpoint may be unavailable on some plan tiers — skip silently
    }
  }

  return { teams_processed, players_upserted, errors }
}

// ============================================================
// ControFanta Mondiale: upsert parsed player stats for one fixture
// ============================================================

export async function upsertFMPlayerStats(
  db: DB,
  competition_id: string,
  parsed: ParsedFixture,
): Promise<{ stats_upserted: number; match_updated: boolean }> {
  // 1. Resolve fm_real_match by sportmonks_fixture_id
  const { data: match } = await db
    .from('fm_real_match')
    .select('id, status')
    .eq('sportmonks_fixture_id', parsed.sportmonks_fixture_id)
    .maybeSingle()
  if (!match) return { stats_upserted: 0, match_updated: false }

  // 2. Update score + status on the match
  const matchStatus: 'scheduled' | 'in_progress' | 'finished' = parsed.state_id === 5
    ? 'finished'
    : parsed.state_id === 1
      ? 'scheduled'
      : 'in_progress'
  await db.from('fm_real_match').update({
    home_score: parsed.home_score,
    away_score: parsed.away_score,
    result: parsed.result,
    status: matchStatus,
    // Live elapsed minute from the ticking period. When finished, freeze at the
    // match length (90/120). Stays null while scheduled or at half-time. Never
    // use length_minutes as the live value — that is the duration, not the clock.
    minute: matchStatus === 'finished'
      ? (parsed.length_minutes > 0 ? parsed.length_minutes : null)
      : parsed.live_minute,
  }).eq('id', match.id)

  // 3. Resolve fm_player UUIDs by sportmonks_player_id (one query)
  const smPlayerIds = parsed.players.map((p) => p.sportmonks_player_id)
  if (!smPlayerIds.length) return { stats_upserted: 0, match_updated: true }

  const { data: playerRows } = await db
    .from('fm_player')
    .select('id, sportmonks_player_id')
    .eq('competition_id', competition_id)
    .in('sportmonks_player_id', smPlayerIds)
  const smToUuid = new Map<number, string>()
  for (const r of playerRows ?? []) {
    if (r.sportmonks_player_id != null) smToUuid.set(r.sportmonks_player_id, r.id)
  }

  // 4. Upsert fm_player_match_stats
  const rows: Array<Database['public']['Tables']['fm_player_match_stats']['Insert']> = []
  for (const p of parsed.players) {
    const uuid = smToUuid.get(p.sportmonks_player_id)
    if (!uuid) continue  // unknown player (squad not synced) — skip
    rows.push({
      real_match_id: match.id,
      player_id: uuid,
      minutes_played: p.minutes_played,
      rating: p.rating,
      goals: p.goals_scored,
      penalties_scored: p.penalties_scored,
      assists: p.assists,
      yellow_cards: p.yellow_cards,
      red_cards: p.red_cards,
      penalties_saved: p.penalties_saved,
      penalties_missed: p.penalties_missed,
      own_goals: p.own_goals,
      clean_sheet: p.clean_sheet,
      goals_conceded: p.goals_conceded,
      is_mvp: p.is_mvp,
      is_starter: p.is_starter,
      is_captain: p.is_captain,
      jersey_number: p.jersey_number,
      subbed_on_minute: p.subbed_on_minute,
      subbed_off_minute: p.subbed_off_minute,
      replaced_player_id: p.replaced_sm_id != null ? (smToUuid.get(p.replaced_sm_id) ?? null) : null,
      replacement_player_id: p.replacement_sm_id != null ? (smToUuid.get(p.replacement_sm_id) ?? null) : null,
      raw_payload: { source: 'sportmonks', stats: p.raw_stats } as unknown as Json,
    })
  }

  if (!rows.length) return { stats_upserted: 0, match_updated: true }

  const { error } = await db
    .from('fm_player_match_stats')
    .upsert(rows, { onConflict: 'real_match_id,player_id' })
  if (error) throw new Error(`upsertFMPlayerStats: ${error.message}`)

  return { stats_upserted: rows.length, match_updated: true }
}

// ============================================================
// Serie A: upsert parsed player stats for one fixture
// ============================================================

/**
 * Mirror of {@link upsertFMPlayerStats} for Serie A. Writes into
 * `player_match_stats` keyed by (matchday_id, player_id).
 *
 * Mapping chain:
 *   sportmonks_fixture_id → matchday_fixtures.matchday_id (scoped to league)
 *   sportmonks_player_id  → serie_a_players.id → league_players.id (scoped to league)
 *
 * Rules:
 *  - Rows are written with `entered_by = null` and `is_provisional = true`.
 *  - If an existing row for (matchday, player) is non-provisional
 *    (i.e. an admin manually edited it), we skip it — manual edits win.
 *  - Returns early with matchday_id=null if no matchday in this league
 *    is linked to this fixture (e.g. the admin hasn't configured it yet).
 */
export async function upsertSerieAPlayerStats(
  db: DB,
  league_id: string,
  parsed: ParsedFixture,
): Promise<{ stats_upserted: number; matchday_id: string | null }> {
  // 1. Resolve matchday for this fixture *within this league*
  const { data: mf } = await db
    .from('matchday_fixtures')
    .select('matchday_id, matchdays!inner(id, league_id)')
    .eq('sportmonks_fixture_id', parsed.sportmonks_fixture_id)
    .eq('matchdays.league_id', league_id)
    .maybeSingle()
  if (!mf) return { stats_upserted: 0, matchday_id: null }
  const matchday_id = mf.matchday_id

  // 2. Resolve league_player UUIDs from sportmonks_player_ids
  const smPlayerIds = parsed.players.map((p) => p.sportmonks_player_id)
  if (!smPlayerIds.length) return { stats_upserted: 0, matchday_id }

  const { data: saPlayers } = await db
    .from('serie_a_players')
    .select('id, sportmonks_player_id')
    .in('sportmonks_player_id', smPlayerIds)
  const saIdsBySm = new Map<number, string>()
  const saIds: string[] = []
  for (const r of saPlayers ?? []) {
    if (r.sportmonks_player_id != null) {
      saIdsBySm.set(r.sportmonks_player_id, r.id)
      saIds.push(r.id)
    }
  }
  if (!saIds.length) return { stats_upserted: 0, matchday_id }

  const { data: lpRows } = await db
    .from('league_players')
    .select('id, serie_a_player_id')
    .eq('league_id', league_id)
    .in('serie_a_player_id', saIds)
  const lpIdBySaId = new Map<string, string>()
  for (const r of lpRows ?? []) {
    if (r.serie_a_player_id) lpIdBySaId.set(r.serie_a_player_id, r.id)
  }

  // sportmonks_player_id → league_player.id
  const lpIdBySm = new Map<number, string>()
  for (const [smId, saId] of saIdsBySm) {
    const lpId = lpIdBySaId.get(saId)
    if (lpId) lpIdBySm.set(smId, lpId)
  }
  if (!lpIdBySm.size) return { stats_upserted: 0, matchday_id }

  // 3. Find which (matchday, player) rows are already non-provisional
  //    (manual edits) — those we must NOT overwrite.
  const candidateLpIds = Array.from(lpIdBySm.values())
  const { data: lockedRows } = await db
    .from('player_match_stats')
    .select('player_id, is_provisional')
    .eq('matchday_id', matchday_id)
    .in('player_id', candidateLpIds)
  const lockedSet = new Set<string>()
  for (const r of lockedRows ?? []) {
    if (r.is_provisional === false) lockedSet.add(r.player_id)
  }

  // 4. Build upsert rows
  const rows: Array<Database['public']['Tables']['player_match_stats']['Insert']> = []
  for (const p of parsed.players) {
    const lpId = lpIdBySm.get(p.sportmonks_player_id)
    if (!lpId) continue  // unknown player (not in this league's pool) — skip
    if (lockedSet.has(lpId)) continue  // manual edit wins

    rows.push({
      matchday_id,
      player_id: lpId,
      entered_by: null,
      is_provisional: true,
      rating: p.rating,
      minutes_played: p.minutes_played,
      goals_scored: p.goals_scored,
      assists: p.assists,
      yellow_cards: p.yellow_cards,
      red_cards: p.red_cards,
      penalties_scored: p.penalties_scored,
      penalties_missed: p.penalties_missed,
      penalties_saved: p.penalties_saved,
      own_goals: p.own_goals,
      goals_conceded: p.goals_conceded,
      clean_sheet: p.clean_sheet,
      is_mvp: p.is_mvp,
      sportmonks_raw_stats: { source: 'sportmonks', stats: p.raw_stats } as unknown as Json,
    })
  }

  if (!rows.length) return { stats_upserted: 0, matchday_id }

  const { error } = await db
    .from('player_match_stats')
    .upsert(rows, { onConflict: 'matchday_id,player_id' })
  if (error) throw new Error(`upsertSerieAPlayerStats: ${error.message}`)

  return { stats_upserted: rows.length, matchday_id }
}

// ============================================================
// Pre-flight check: is anything live-window right now?
// ============================================================

export async function hasFixturesInLiveWindow(db: DB): Promise<boolean> {
  const now = new Date()
  // Window widened to kickoff+210min: knockout matches run extra-time + a
  // shootout + half-time/ET breaks, which can push final-rating settling well
  // past the old +130 cap. Better to make a few extra cheap inplay calls than
  // to stop polling while a match is still live.
  const from = new Date(now.getTime() - 210 * 60 * 1000).toISOString()
  const to = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  // Only open the live window for fixtures that aren't already finished in
  // fm_real_match — avoids keeping the window open for games that ended hours
  // ago but whose kickoff_at is still within the 210-min gate.
  const { data: candidates } = await db
    .from('sportmonks_fixtures')
    .select('sportmonks_fixture_id')
    .gte('kickoff_at', from)
    .lte('kickoff_at', to)
  if (candidates?.length) {
    const smIds = candidates.map((c) => c.sportmonks_fixture_id)
    // Fixtures that are either not linked to fm_real_match yet, or linked but
    // not yet finished — either case means we should keep polling.
    const { data: finished } = await db
      .from('fm_real_match')
      .select('sportmonks_fixture_id')
      .in('sportmonks_fixture_id', smIds)
      .eq('status', 'finished')
    const finishedIds = new Set((finished ?? []).map((r) => r.sportmonks_fixture_id))
    const anyNotDone = smIds.some((id) => !finishedIds.has(id))
    if (anyNotDone) return true
  }

  // Reality override: the check above trusts the fixture cache's kickoff_at,
  // which can be stale if FIFA reschedules and the daily sync hasn't caught up.
  // If any real match is still flagged in_progress (kickoff within the last 6h
  // to bound a stuck row), keep polling regardless of the cache — so live rating
  // ingest can never be silently halted by a wrong cached kickoff.
  const recent = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
  const { count: fmLive } = await db
    .from('fm_real_match')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in_progress')
    .gte('kickoff_at', recent)
  return (fmLive ?? 0) > 0
}

