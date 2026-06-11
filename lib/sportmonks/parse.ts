/**
 * Parse a SportMonks fixture (with lineups.details.type + events.type
 * includes) into a vendor-neutral ParsedFixture.
 *
 * Event → stat mapping (per SportMonks docs, confirmed):
 *   PENALTY               → goals_scored++ on player, penalties_scored++ on player
 *   MISSED_PENALTY        → penalties_missed++ on player,
 *                           penalties_saved++ on opposing GK on the pitch at that minute
 *   OWN_GOAL              → own_goals++ on player,
 *                           goals_conceded++ on same-team GK on pitch
 *   PENALTY_SHOOTOUT_GOAL → ignored (shootout not in fantasy stats)
 *   PENALTY_SHOOTOUT_MISS → ignored
 *
 * Notes:
 *  - Per-player MINUTES_PLAYED / GOALS / ASSISTS / YELLOWCARDS etc.
 *    come from the lineup.details stat dump. Event-derived counters
 *    (penalties_scored/missed/saved, own_goals) supplement those.
 *  - "GOALS" stat already includes penalty goals, so the engine's
 *    existing rule still holds: regular_goals = goals − penalties_scored.
 *  - clean_sheet: minutes_played >= 60 AND team conceded 0.
 *  - is_mvp: highest RATING in the fixture overall (single MVP).
 */

import type {
  ParsedFixture,
  ParsedPlayerStat,
  SMEvent,
  SMFixture,
  SMLineupEntry,
  SMStatDetail,
} from './types'

// ---------- stat helpers ----------

function readStat(details: SMStatDetail[] | undefined, developerName: string): number | null {
  if (!details) return null
  const d = details.find((x) => x.type?.developer_name === developerName)
  if (!d) return null
  const v = d.data?.value
  if (v === undefined || v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function readBool(details: SMStatDetail[] | undefined, developerName: string): boolean {
  if (!details) return false
  const d = details.find((x) => x.type?.developer_name === developerName)
  if (!d) return false
  const v = d.data?.value as unknown
  return v === true || v === 1 || v === '1' || v === 'true'
}

function readStatN(details: SMStatDetail[] | undefined, name: string): number {
  return readStat(details, name) ?? 0
}

function dumpAllStats(details: SMStatDetail[] | undefined): Record<string, number | string | boolean> {
  if (!details) return {}
  const out: Record<string, number | string | boolean> = {}
  for (const d of details) {
    const name = d.type?.developer_name
    if (!name) continue
    const v = d.data?.value
    if (v === undefined || v === null) continue
    out[name] = v as number | string | boolean
  }
  return out
}

// ---------- GK-on-pitch resolver ----------

type Sub = { off_player_id: number; on_player_id: number; minute: number; team_id: number }

function extractSubs(events: SMEvent[] | undefined): Sub[] {
  if (!events) return []
  const subs: Sub[] = []
  for (const e of events) {
    const dev = e.type?.developer_name
    if (dev !== 'SUBSTITUTION') continue
    if (e.player_id == null || e.related_player_id == null) continue
    subs.push({
      off_player_id: e.related_player_id,
      on_player_id: e.player_id,
      minute: e.minute ?? 0,
      team_id: e.participant_id,
    })
  }
  return subs.sort((a, b) => a.minute - b.minute)
}

/**
 * Returns the player_id of the GK on the pitch for the given team at
 * the given minute. Falls back to the starting GK if subs are unclear.
 */
function resolveGoalkeeperAtMinute(
  lineups: SMLineupEntry[],
  events: SMEvent[] | undefined,
  team_id: number,
  minute: number,
): number | null {
  const teamLineups = lineups.filter((l) => l.team_id === team_id)
  const startingGK = teamLineups.find((l) => l.type_id === 11 && (l.position_id === 24 || l.player?.position_id === 24))
  if (!startingGK) {
    // Edge case: starting GK position_id might be miss-set; fall back to lineup-position 1.
    const fallback = teamLineups.find((l) => l.type_id === 11 && l.formation_position === 1)
    if (!fallback) return null
    return resolveGKWithSubs(fallback.player_id, teamLineups, events, minute)
  }
  return resolveGKWithSubs(startingGK.player_id, teamLineups, events, minute)
}

function resolveGKWithSubs(
  startingGKId: number,
  teamLineups: SMLineupEntry[],
  events: SMEvent[] | undefined,
  minute: number,
): number {
  // Any GK substitution before `minute` shifts the on-pitch GK.
  const subs = extractSubs(events).filter((s) => teamLineups.some((l) => l.player_id === s.off_player_id || l.player_id === s.on_player_id))
  let currentGK = startingGKId
  for (const s of subs) {
    if (s.minute > minute) break
    if (s.off_player_id !== currentGK) continue
    // confirm replacement is also a GK
    const incoming = teamLineups.find((l) => l.player_id === s.on_player_id)
    if (!incoming) continue
    const incomingPos = incoming.position_id ?? incoming.player?.position_id
    if (incomingPos === 24) {
      currentGK = s.on_player_id
    }
  }
  return currentGK
}

// ---------- main parse ----------

export function parseFixture(fixture: SMFixture): ParsedFixture {
  const lineups = fixture.lineups ?? []
  const events = fixture.events ?? []
  const participants = fixture.participants ?? []
  const home = participants.find((p) => p.meta?.location === 'home') ?? participants[0]
  const away = participants.find((p) => p.meta?.location === 'away') ?? participants[1]

  // Map team_id → goals scored by that team. Derived from goals_scored on
  // all that team's players (cheap, no team-level stat needed).
  const teamGoals = new Map<number, number>()
  for (const l of lineups) {
    const g = readStatN(l.details, 'GOALS')
    teamGoals.set(l.team_id, (teamGoals.get(l.team_id) ?? 0) + g)
  }
  // Own goals are scored "into your own net" — by SportMonks convention the
  // event's participant_id is the team of the player scoring it (so own
  // goals end up boosting the OPPOSITE team's score on the scoreboard).
  // We don't try to derive team scores from events; we just rely on
  // result_info for the headline scoreline.
  const homeId = home?.id ?? null
  const awayId = away?.id ?? null

  // Build per-player base rows from lineups.details
  const byPlayer = new Map<number, ParsedPlayerStat>()
  for (const l of lineups) {
    const minutes = readStatN(l.details, 'MINUTES_PLAYED')
    const rating = readStat(l.details, 'RATING')
    const goals = readStatN(l.details, 'GOALS')
    const assists = readStatN(l.details, 'ASSISTS')
    const yellow = readStatN(l.details, 'YELLOWCARDS')
    const red = readStatN(l.details, 'REDCARDS') + readStatN(l.details, 'YELLOWREDCARDS')
    const conceded = readStatN(l.details, 'GOALS_CONCEDED')
    const captain = readBool(l.details, 'CAPTAIN')
    const posId = l.position_id ?? l.player?.position_id ?? null

    byPlayer.set(l.player_id, {
      sportmonks_player_id: l.player_id,
      sportmonks_team_id: l.team_id,
      position_id: posId,
      detailed_position_id: l.player?.detailed_position_id ?? null,
      rating,
      minutes_played: minutes,
      goals_scored: goals,
      assists,
      yellow_cards: yellow,
      red_cards: red,
      penalties_scored: 0,
      penalties_missed: 0,
      penalties_saved: 0,
      own_goals: 0,
      goals_conceded: conceded,
      clean_sheet: false,
      is_captain: captain,
      is_starter: l.type_id === 11,
      jersey_number: l.jersey_number ?? null,
      subbed_on_minute: null,
      subbed_off_minute: null,
      replaced_sm_id: null,
      replacement_sm_id: null,
      is_mvp: false,
      raw_stats: dumpAllStats(l.details),
    })
  }

  // Pair up substitutions: the leaver gets subbed_off + replacement, the
  // entrant gets subbed_on + replaced. Drives the "X came on for Y" display.
  for (const s of extractSubs(events)) {
    const off = byPlayer.get(s.off_player_id)
    const on = byPlayer.get(s.on_player_id)
    if (off) {
      off.subbed_off_minute = s.minute
      off.replacement_sm_id = s.on_player_id
    }
    if (on) {
      on.subbed_on_minute = s.minute
      on.replaced_sm_id = s.off_player_id
    }
  }

  // Apply event-derived counters
  for (const ev of events) {
    const dev = ev.type?.developer_name
    if (!dev) continue
    if (dev === 'PENALTY_SHOOTOUT_GOAL' || dev === 'PENALTY_SHOOTOUT_MISS') continue
    const minute = ev.minute ?? 0

    if (dev === 'PENALTY' && ev.player_id != null) {
      const p = byPlayer.get(ev.player_id)
      if (p) p.penalties_scored += 1
      continue
    }

    if (dev === 'MISSED_PENALTY' && ev.player_id != null) {
      const p = byPlayer.get(ev.player_id)
      if (p) p.penalties_missed += 1
      // Award penalties_saved to opposing GK on the pitch
      const opposingTeamId = ev.participant_id === homeId ? awayId : homeId
      if (opposingTeamId != null) {
        const gk = resolveGoalkeeperAtMinute(lineups, events, opposingTeamId, minute)
        if (gk != null) {
          const gkRow = byPlayer.get(gk)
          if (gkRow) gkRow.penalties_saved += 1
        }
      }
      continue
    }

    if (dev === 'OWN_GOAL' && ev.player_id != null) {
      const p = byPlayer.get(ev.player_id)
      if (p) p.own_goals += 1
      // Charge goals_conceded to same-team GK on pitch (only if GOALS_CONCEDED stat hasn't already captured it — best-effort)
      const gk = resolveGoalkeeperAtMinute(lineups, events, ev.participant_id, minute)
      if (gk != null && gk !== ev.player_id) {
        // GOALS_CONCEDED stat already counts every concession, so we
        // intentionally do NOT increment here to avoid double-counting.
        // Kept as an explicit no-op for documentation.
      }
      continue
    }
  }

  // Clean sheet: minutes_played >= 60 AND team conceded 0
  const teamConceded = new Map<number, number>()
  for (const p of byPlayer.values()) {
    teamConceded.set(p.sportmonks_team_id, Math.max(teamConceded.get(p.sportmonks_team_id) ?? 0, p.goals_conceded))
  }
  for (const p of byPlayer.values()) {
    if (p.minutes_played >= 60 && (teamConceded.get(p.sportmonks_team_id) ?? 0) === 0) {
      p.clean_sheet = true
    }
  }

  // MVP: highest RATING (single MVP for the whole match)
  let mvpId: number | null = null
  let mvpRating = -Infinity
  for (const p of byPlayer.values()) {
    if (p.rating != null && p.rating > mvpRating) {
      mvpRating = p.rating
      mvpId = p.sportmonks_player_id
    }
  }
  if (mvpId != null) {
    const m = byPlayer.get(mvpId)
    if (m) m.is_mvp = true
  }

  // Scoreline: prefer SportMonks' authoritative CURRENT score (include=scores),
  // which correctly counts own goals. Summing players' GOALS misses own goals
  // (an OG is credited to the scorer, not the beneficiary team), producing a
  // wrong scoreline and — via `result` below — wrong coach points. Fall back to
  // the summed goals only when the scores include is absent.
  function authoritativeScore(teamId: number | null): number | null {
    if (teamId == null) return null
    const current = (fixture.scores ?? []).filter((s) => s.description === 'CURRENT')
    const entry = current.find((s) => s.participant_id === teamId)
    const goals = entry?.score?.goals
    return typeof goals === 'number' ? goals : null
  }
  const homeScore =
    authoritativeScore(homeId) ?? (homeId != null ? teamGoals.get(homeId) ?? 0 : null)
  const awayScore =
    authoritativeScore(awayId) ?? (awayId != null ? teamGoals.get(awayId) ?? 0 : null)

  // Outcome: prefer the SportMonks winner flag (it names the advancer even when
  // a knockout tie is decided on penalties). Fall back to the scoreline, which
  // is all that's available for matches without a winner flag (e.g. group
  // stage, or before a shootout settles).
  let result: 'home_win' | 'draw' | 'away_win' | null = null
  if (home?.meta?.winner === true) result = 'home_win'
  else if (away?.meta?.winner === true) result = 'away_win'
  else if (homeScore != null && awayScore != null) {
    result = homeScore > awayScore ? 'home_win' : homeScore < awayScore ? 'away_win' : 'draw'
  }

  return {
    sportmonks_fixture_id: fixture.id,
    league_id: fixture.league_id,
    season_id: fixture.season_id,
    stage_id: fixture.stage_id ?? null,
    round_id: fixture.round_id ?? null,
    home_team_id: homeId,
    away_team_id: awayId,
    home_team_name: home?.name ?? null,
    away_team_name: away?.name ?? null,
    kickoff_at: fixture.starting_at_timestamp
      ? new Date(fixture.starting_at_timestamp * 1000).toISOString()
      : new Date(fixture.starting_at + 'Z').toISOString(),
    state_id: fixture.state_id,
    state_name: fixture.state?.name ?? null,
    length_minutes: fixture.length,
    home_score: homeScore,
    away_score: awayScore,
    result,
    players: Array.from(byPlayer.values()),
  }
}
