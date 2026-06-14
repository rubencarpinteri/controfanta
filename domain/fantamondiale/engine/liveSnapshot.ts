// ============================================================
// FantaMondiale — Live round snapshot (engine, live-tolerant)
// ============================================================
// Sibling of `runRoundEngine`, but for matches still in progress. Unlike the
// finalization pass it NEVER throws on missing/partial results — it treats a
// starter's match as one of three states (played / not_played / pending) and
// produces a per-lega board with provisional player scores and, crucially,
// BOTH the current and the *potential* ownership penalty.
//
// Why two ownership numbers (the trademark subtlety):
//   The popularity penalty is monotonic and cross-team coupled. A player
//   benched in team B can be subbed in if B's same-role starter doesn't play,
//   which raises his ownership — and therefore everyone's penalty on him —
//   retroactively. So we compute, per player across the whole lega:
//     fielded_now  — teams fielding him under the optimistic assumption that
//                    every still-live starter will end up playing.
//     fielded_max  — teams that COULD field him if every still-live starter
//                    ends up NOT playing (the ceiling).
//   The page shows "−now ▸ up to −potential".
//
// Reuses the pure engine pieces: scorePlayerRaw, applySubstitutions,
// finalizePlayerForLega — so live and final scoring can never diverge.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import { loadFMUnifiedConfigForLega } from '@/lib/fantamondiale/loadUnifiedConfig'
import { scorePlayerRaw, finalizePlayerForLega, hasDecisiveEvent } from './playerScore'
import { scoreCoach } from './coachScore'
import { applySubstitutions, type FMRole, type SubStarter, type SubBench } from './substitution'
import type { FMEngineCoachInput } from './types'

type CoachTier = FMEngineCoachInput['tier']

type Supabase = SupabaseClient<Database>

type PlayState = 'played' | 'not_played' | 'pending'

type CachedSportmonksFixture = {
  participants?: Array<{
    id: number
    meta?: { location?: 'home' | 'away' | null } | null
  }>
  events?: Array<{
    id?: number | null
    participant_id?: number | null
    player_name?: string | null
    related_player_name?: string | null
    minute?: number | null
    extra_minute?: number | null
    type?: { developer_name?: string | null } | null
  }>
}

function extractGoalEventsFromFixture(
  rawPayload: unknown,
  match: { home_team: LiveTeamRef; away_team: LiveTeamRef },
): LiveSnapshotGoalEvent[] {
  if (!rawPayload || typeof rawPayload !== 'object') return []
  const fixture = rawPayload as CachedSportmonksFixture
  const events = Array.isArray(fixture.events) ? fixture.events : []
  if (events.length === 0) return []

  const homeSmId = fixture.participants?.find((p) => p.meta?.location === 'home')?.id ?? null
  const awaySmId = fixture.participants?.find((p) => p.meta?.location === 'away')?.id ?? null

  return events
    .flatMap((event, index): LiveSnapshotGoalEvent[] => {
      const type = event.type?.developer_name
      if (type !== 'GOAL' && type !== 'PENALTY' && type !== 'OWN_GOAL') return []

      const eventTeamIsHome = homeSmId != null && event.participant_id === homeSmId
      const eventTeamIsAway = awaySmId != null && event.participant_id === awaySmId
      const code =
        type === 'OWN_GOAL'
          ? eventTeamIsHome
            ? match.away_team.fifa_code
            : eventTeamIsAway
              ? match.home_team.fifa_code
              : ''
          : eventTeamIsHome
            ? match.home_team.fifa_code
            : eventTeamIsAway
              ? match.away_team.fifa_code
              : ''

      return [{
        key: `sm-goal-${event.id ?? index}`,
        minute: event.minute ?? null,
        extra_minute: event.extra_minute ?? null,
        scorer: event.player_name ?? '—',
        code,
        assist: event.related_player_name ?? null,
        own: type === 'OWN_GOAL',
      }]
    })
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.extra_minute ?? 0) - (b.extra_minute ?? 0))
}

// ---- snapshot payload shape (persisted as jsonb) ---------------------------

export type LiveTeamRef = {
  name: string
  fifa_code: string
  logo_url: string | null
  flag_url: string | null
}

/** One fantasy team that owns a given player, and how they deployed him. */
export type LiveOwnerRef = {
  fantasy_team_id: string
  team_name: string
  status: 'titolare' | 'panchina'
}

export type LiveSnapshotPlayer = {
  player_id: string
  name: string
  role: FMRole
  via: 'starter' | 'sub' | 'bench'
  /** Bench priority from the submitted lineup; null for starters. */
  bench_order: number | null
  national_team: LiveTeamRef | null
  status: PlayState
  /** Is this player in the fielded-now set (i.e. counts toward live_total)? */
  counts: boolean
  /**
   * Fantasy-substitution linkage (for the campetto's "who replaced whom" badges):
   *  - on a fielded sub (via === 'sub'): the non-playing titolare he came on for.
   *  - on a non-playing titolare who was replaced: the bench sub now in his slot.
   * Both null when not part of a substitution (or a starter played short).
   */
  sub_for: { player_id: string; name: string } | null
  replaced_by: { player_id: string; name: string } | null
  /**
   * For a non-playing titolare with no replacement yet: true if a same-role
   * bench candidate's match is still upcoming (he may still come on), false if
   * every eligible candidate's match is over (the team plays short for good).
   * Null when not a played-short starter.
   */
  replacement_pending: boolean | null
  /** First same-role bench candidate who can still fill this empty slot. */
  replacement_candidate: { player_id: string; name: string } | null
  rating: number | null
  /** Calibrated fantasy voto before football bonus/malus and ownership effects. */
  voto_base: number | null
  /** Team panel base voto, shaped like the real-match panel display. */
  display_voto_base: number | null
  /** Team panel total voto with visible football bonus/malus, before ownership effects. */
  display_voto_total: number | null
  raw_subtotal: number
  football_bonus: number
  football_malus: number
  clean_sheet_bonus: number
  yellow_cards: number
  red_cards: number
  own_goals: number
  penalties_scored: number
  penalties_saved: number
  penalties_missed: number
  goals: number
  assists: number
  immunita_active: boolean
  popularity_penalty_now: number
  popularity_penalty_potential: number
  popularity_penalty_potential_without_immunity: number | null
  final_score_potential_without_immunity: number | null
  immunity_removed_malus: number
  /** Bracket penalty % (ownership-derived) — known up-front, even pre-match.
   *  e.g. 20% ownership → 30 here. The amount above is this % of |raw_subtotal|. */
  popularity_penalty_pct_now: number
  popularity_penalty_pct_potential: number
  mvp_bonus: number
  final_score_now: number
  /** OTHER fantasy teams in the lega that also rostered this player. */
  owners: LiveOwnerRef[]
}

export type LiveSnapshotCoach = {
  name: string
  tier: string | null
  team: LiveTeamRef | null
  /** Live (provisional) coach bonus/malus; null until his match kicks off. */
  live_score: number | null
  /** Coach's nation result so far: W / D / L (null before kickoff). */
  live_result: 'W' | 'D' | 'L' | null
}

export type LiveSnapshotTeam = {
  fantasy_team_id: string
  name: string
  manager_name: string | null
  formation: string | null
  coach: LiveSnapshotCoach | null
  /** Players-only total. */
  players_total: number
  /** players_total + coach live_score. */
  live_total: number
  players: LiveSnapshotPlayer[]
}

export type LiveOwnershipEntry = {
  fielded_now: number
  max_possible: number
  pct_now: number
  pct_potential: number
}

/** One player as they appear in a real (national-team) match lineup. */
export type LiveSnapshotRealPlayer = {
  player_id: string
  name: string
  role: FMRole
  /** Which national team this player belongs to — lets the UI split home/away. */
  national_team_id: string
  jersey_number: number | null
  /** Real-match starting XI vs bench (SportMonks lineup). */
  is_starter: boolean
  /** SportMonks rating (the input to the voto), null if no rating yet. */
  rating: number | null
  /** Engine voto before football bonus/malus. Null means S.V. */
  voto_base: number | null
  /** Fantasy voto = raw subtotal (voto_base + football bonus/malus), pre-ownership. */
  voto: number | null
  /** Real-match panel base voto, shaped to keep legacy calibrated-voto semantics. */
  display_voto_base: number | null
  /** Real-match panel total voto with visible football bonus/malus. */
  display_voto_total: number | null
  football_bonus: number
  football_malus: number
  clean_sheet_bonus: number
  /** Highest-rated player in the fixture. */
  is_mvp: boolean
  popularity_penalty_now: number
  popularity_penalty_pct_now: number
  mvp_bonus: number
  final_score_now: number | null
  minutes_played: number | null
  /** Play status, so the UI can render −, X (DNP, match over) or S.V. */
  play_state: PlayState
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  own_goals: number
  penalties_scored: number
  penalties_saved: number
  penalties_missed: number
  /** Minute he came on / went off (real-match substitution). */
  subbed_on_minute: number | null
  subbed_off_minute: number | null
  /** Name of the player he replaced / who replaced him. */
  replaced_player_name: string | null
  replacement_player_name: string | null
  /** Which fantasy teams in the lega rostered him, titolare or panchina. */
  owners: LiveOwnerRef[]
  /**
   * Ownership signal among this lega's fantasy teams.
   * 'excl_safe'  — fielded_now === 1 AND max_possible === 1 (true exclusive)
   * 'excl_risk'  — fielded_now === 1 BUT max_possible > 1 (sub risk in another team)
   * 'shared'     — fielded_now > 1
   * 'bench_only' — fielded_now === 0 but max_possible > 0 (only on bench)
   * null         — not in any fantasy lineup in this lega
   */
  ownership_signal: 'excl_safe' | 'excl_risk' | 'shared' | 'bench_only' | null
  /** How many fantasy teams have this player as a current starter. */
  fielded_now: number
  /** Ceiling across all possible sub scenarios. */
  max_possible: number
}

export type LiveSnapshotGoalEvent = {
  key: string
  minute: number | null
  extra_minute: number | null
  scorer: string
  code: string
  assist: string | null
  own: boolean
}

export type LiveSnapshotMatch = {
  match_id: string
  home_team_id: string
  away_team_id: string
  home_team: LiveTeamRef
  away_team: LiveTeamRef
  home_score: number | null
  away_score: number | null
  /** Elapsed match minute from SportMonks, null if not started. */
  minute: number | null
  /** Stoppage minutes on top of `minute` (e.g. 4 for 90+4); 0/null in regular play. */
  minute_added: number | null
  status: 'scheduled' | 'in_progress' | 'finished' | 'cancelled'
  kickoff_at: string
  /** Chronological scoring events from SportMonks when cached. */
  goal_events: LiveSnapshotGoalEvent[]
  /** Players from fm_player pool who appeared in this match (minutes_played > 0). */
  players: LiveSnapshotRealPlayer[]
}

export type LiveSnapshotTeamStandings = {
  /** fantasy points total (players + coach) */
  live_total: number
  /** number of BR goals scored (thresholds met) */
  goals_scored: number
  /** live giornata points from BR head-to-head comparisons */
  giornata_points: number
}

/**
 * Cumulative season classifica INCLUDING the current live giornata.
 * = sum of finalized past rounds + this round's live projection.
 */
export type LiveSnapshotTeamClassifica = {
  /** BR points from finalized past rounds (excludes the live round) */
  br_points_prior: number
  /** br_points_prior + current live giornata_points */
  br_points_total: number
  /** raw fantasy score from finalized past rounds (excludes the live round) */
  raw_score_prior: number
  /** raw_score_prior + current live live_total */
  raw_score_total: number
  /** 1-based rank in the live classifica (br_points desc, raw desc tiebreak) */
  rank: number
}

export type LiveRoundSnapshot = {
  computed_at: string
  round: { id: string; name: string; phase_id: string }
  teams: LiveSnapshotTeam[]
  ownership: Record<string, LiveOwnershipEntry>
  matches: LiveSnapshotMatch[]
  /** Per-giornata live standings, keyed by fantasy_team_id */
  standings: Record<string, LiveSnapshotTeamStandings>
  /** Cumulative season classifica (past finalized rounds + live), keyed by fantasy_team_id */
  classifica: Record<string, LiveSnapshotTeamClassifica>
}

// ---------------------------------------------------------------------------

/**
 * Compute the live board for one lega + round. Pure read; writes nothing.
 * Returns null when the round has no submitted lineups yet (nothing to show).
 */
export async function computeLiveRoundSnapshot(
  roundId: string,
  legaCompId: string,
  supabase: Supabase,
): Promise<LiveRoundSnapshot | null> {
  // ---- 1. Round + config ------------------------------------------------
  const { data: round } = await supabase
    .from('fm_scoring_round')
    .select('id, name, phase_id, competition_id')
    .eq('id', roundId)
    .maybeSingle()
  if (!round) return null

  // This snapshot is for one Lega — use its own fantasy config so the live
  // popularity/MVP overlay matches what the final engine will compute.
  const composed = await loadFMUnifiedConfigForLega(supabase, legaCompId)
  const config = fmCompetitionConfigSchema.parse(composed)
  const sub = config.substitution

  // Phase kind decides coach scoring mode: knockout → opponent-relative.
  const { data: phase } = await supabase
    .from('fm_phase')
    .select('kind')
    .eq('id', round.phase_id)
    .maybeSingle()
  const isKnockout = !!phase && phase.kind !== 'group_stage'

  // ---- 2. Matches for the round (live-tolerant: scores may be null) ------
  const { data: matches } = await supabase
    .from('fm_real_match')
    .select('id, home_team_id, away_team_id, home_score, away_score, result, status, minute, minute_added, kickoff_at, sportmonks_fixture_id')
    .eq('scoring_round_id', roundId)
  const matchByTeamId = new Map<string, NonNullable<typeof matches>[number]>()
  for (const m of matches ?? []) {
    matchByTeamId.set(m.home_team_id, m)
    matchByTeamId.set(m.away_team_id, m)
  }

  // ---- 3. This lega's teams + their submitted lineups -------------------
  const { data: teams } = await supabase
    .from('fm_fantasy_team')
    .select('id, name, manager_id')
    .eq('league_competition_id', legaCompId)
    .order('name', { ascending: true })
  const teamIds = (teams ?? []).map((t) => t.id)

  // Resolve manager display names from profiles
  const managerIds = [...new Set((teams ?? []).map((t) => t.manager_id).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', managerIds.length > 0 ? managerIds : ['00000000-0000-0000-0000-000000000000'])
  const managerNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? null]))
  if (teamIds.length === 0) return null

  const { data: lineups } = await supabase
    .from('fm_matchday_lineup')
    .select('fantasy_team_id, formation, fm_matchday_lineup_player(player_id, is_starter, bench_order)')
    .eq('scoring_round_id', roundId)
    .in('fantasy_team_id', teamIds)
    .not('submitted_at', 'is', null)
  if (!lineups || lineups.length === 0) return null
  const lineupByTeam = new Map(lineups.map((l) => [l.fantasy_team_id, l]))

  // ---- 4. Players + provisional stats -----------------------------------
  const allPlayerIds = [
    ...new Set(lineups.flatMap((l) => l.fm_matchday_lineup_player.map((p) => p.player_id))),
  ]
  const { data: players } = await supabase
    .from('fm_player')
    .select('id, name, role, national_team_id, fm_national_team(name, fifa_code, logo_url, flag_url)')
    .in('id', allPlayerIds.length > 0 ? allPlayerIds : ['00000000-0000-0000-0000-000000000000'])
  const playerById = new Map((players ?? []).map((p) => [p.id, p]))

  // Also fetch ALL fm_player rows for national teams in this round's matches
  // so the match detail panel can show the full real lineup, not just drafted players.
  const matchTeamIds = [...new Set((matches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]))]
  const { data: allMatchPlayers } = await supabase
    .from('fm_player')
    .select('id, name, role, national_team_id')
    .in('national_team_id', matchTeamIds.length > 0 ? matchTeamIds : ['00000000-0000-0000-0000-000000000000'])
  // Merge into playerById so scoring lookups still work
  for (const p of allMatchPlayers ?? []) {
    if (!playerById.has(p.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playerById.set(p.id, { ...p, fm_national_team: null } as any)
    }
  }

  // National team info for matches (needed for LiveSnapshotMatch)
  const { data: nationalTeams } = await supabase
    .from('fm_national_team')
    .select('id, name, fifa_code, logo_url, flag_url')
    .in('id', matchTeamIds.length > 0 ? matchTeamIds : ['00000000-0000-0000-0000-000000000000'])
  const nationalTeamById = new Map((nationalTeams ?? []).map((t) => [t.id, t]))

  const matchIds = (matches ?? []).map((m) => m.id)
  const sportmonksFixtureIds = (matches ?? [])
    .map((m) => m.sportmonks_fixture_id)
    .filter((id): id is number => typeof id === 'number')
  const { data: cachedFixtures } = await supabase
    .from('sportmonks_fixtures')
    .select('sportmonks_fixture_id, raw_payload')
    .in('sportmonks_fixture_id', sportmonksFixtureIds.length > 0 ? sportmonksFixtureIds : [-1])
  const cachedFixtureById = new Map((cachedFixtures ?? []).map((f) => [f.sportmonks_fixture_id, f.raw_payload]))

  const { data: allStats } = await supabase
    .from('fm_player_match_stats')
    .select(
      'real_match_id, player_id, minutes_played, rating, goals, penalties_scored, assists, yellow_cards, red_cards, penalties_saved, penalties_missed, own_goals, goals_conceded, is_mvp, is_starter, jersey_number, subbed_on_minute, subbed_off_minute, replaced_player_id, replacement_player_id',
    )
    .in('real_match_id', matchIds.length > 0 ? matchIds : ['00000000-0000-0000-0000-000000000000'])
  const statsByKey = new Map((allStats ?? []).map((s) => [`${s.player_id}:${s.real_match_id}`, s]))
  const missingStatPlayerIds = [
    ...new Set((allStats ?? []).map((s) => s.player_id).filter((id) => !playerById.has(id))),
  ]
  if (missingStatPlayerIds.length > 0) {
    const { data: statPlayers } = await supabase
      .from('fm_player')
      .select('id, name, role, national_team_id')
      .in('id', missingStatPlayerIds)
    for (const p of statPlayers ?? []) {
      if (!playerById.has(p.id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        playerById.set(p.id, { ...p, fm_national_team: null } as any)
      }
    }
  }

  // ---- 5. Coaches (live-scored via the match result) --------------------
  const { data: phaseSquads } = await supabase
    .from('fm_phase_squad')
    .select('fantasy_team_id, coach_id')
    .eq('phase_id', round.phase_id)
    .in('fantasy_team_id', teamIds)
    .not('coach_id', 'is', null)
  const coachIdByTeam = new Map(
    (phaseSquads ?? [])
      .filter((s): s is typeof s & { coach_id: string } => !!s.coach_id)
      .map((s) => [s.fantasy_team_id, s.coach_id]),
  )
  const coachIds = [...new Set(coachIdByTeam.values())]

  type CoachInfo = {
    name: string
    tier: CoachTier | null
    team: LiveTeamRef | null
    national_team_id: string | null
  }
  const coachInfoById = new Map<string, CoachInfo>()
  // Nation → tier across the WHOLE competition: knockout coach scoring needs
  // the opponent's tier, and the opponent may be an undrafted coach.
  const tierByNationalTeamId = new Map<string, CoachTier>()

  if (coachIds.length > 0) {
    const [coachRows, allTierRows] = await Promise.all([
      supabase
        .from('fm_coach')
        .select('id, name, national_team_id, fm_national_team(name, fifa_code, logo_url, flag_url)')
        .in('id', coachIds),
      supabase
        .from('fm_competition_coach_tier')
        .select('coach_id, tier, fm_coach(national_team_id)')
        .eq('competition_id', round.competition_id),
    ])
    const tierByCoach = new Map<string, CoachTier>()
    for (const r of allTierRows.data ?? []) {
      tierByCoach.set(r.coach_id, r.tier as CoachTier)
      const ntId = (r.fm_coach as { national_team_id: string } | null)?.national_team_id
      if (ntId) tierByNationalTeamId.set(ntId, r.tier as CoachTier)
    }
    for (const c of coachRows.data ?? []) {
      coachInfoById.set(c.id, {
        name: c.name,
        tier: tierByCoach.get(c.id) ?? null,
        team: (c.fm_national_team as LiveTeamRef | null) ?? null,
        national_team_id: c.national_team_id ?? null,
      })
    }
  }

  // Provisional coach score for one team's coach, from the live match result.
  // Returns null score (pending) until the coach's match has kicked off.
  function liveCoach(coachId: string | undefined): LiveSnapshotCoach | null {
    if (!coachId) return null
    const info = coachInfoById.get(coachId)
    if (!info) return null
    const base: LiveSnapshotCoach = {
      name: info.name,
      tier: info.tier,
      team: info.team,
      live_score: null,
      live_result: null,
    }
    if (!info.national_team_id || !info.tier) return base
    const match = matchByTeamId.get(info.national_team_id)
    // Only score once the match is underway — a 0-0 "draw" pre-kickoff is noise.
    if (!match || (match.status !== 'in_progress' && match.status !== 'finished')) return base

    const opponentTeamId =
      match.home_team_id === info.national_team_id ? match.away_team_id : match.home_team_id
    const scored = scoreCoach(
      {
        coachId,
        nationalTeamId: info.national_team_id,
        tier: info.tier,
        opponentTier: tierByNationalTeamId.get(opponentTeamId) ?? null,
        isKnockout,
        matchContext: {
          real_match_id: match.id,
          scoring_round_id: roundId,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_score: match.home_score ?? 0,
          away_score: match.away_score ?? 0,
          result: match.result,
        },
      },
      config,
    )
    if (!scored) return base

    const isHome = info.national_team_id === match.home_team_id
    const coachWon =
      (scored.match_result === 'home_win' && isHome) ||
      (scored.match_result === 'away_win' && !isHome)
    const live_result: 'W' | 'D' | 'L' =
      scored.match_result === 'draw' ? 'D' : coachWon ? 'W' : 'L'
    return { ...base, live_score: scored.final_score, live_result }
  }

  // ============================================================
  // Per-(player, match) raw scores + three-state play status.
  // ============================================================
  const rawByPlayer = new Map<string, ReturnType<typeof scorePlayerRaw>>()
  const stateByPlayer = new Map<string, PlayState>()

  // Score every player who appears in a round match — not just the drafted
  // ones — so the real-match lineup can show a fantasy voto + play state for
  // all 22+ players, owned or not.
  const scorablePlayerIds = [
    ...new Set([
      ...allPlayerIds,
      ...(allMatchPlayers ?? []).map((p) => p.id),
      ...(allStats ?? []).map((s) => s.player_id),
    ]),
  ]
  for (const pid of scorablePlayerIds) {
    const player = playerById.get(pid)
    if (!player) continue
    const match = matchByTeamId.get(player.national_team_id)
    if (!match) {
      // No real match wired for his nation in this round → treat as pending.
      stateByPlayer.set(pid, 'pending')
      continue
    }
    const stats = statsByKey.get(`${pid}:${match.id}`)
    const matchFinal = match.status === 'finished' || match.status === 'cancelled'

    if (!stats) {
      stateByPlayer.set(pid, matchFinal ? 'not_played' : 'pending')
      continue
    }

    const raw = scorePlayerRaw(
      {
        playerId: pid,
        role: player.role as FMRole,
        nationalTeamId: player.national_team_id,
        stats: {
          minutes_played: stats.minutes_played,
          rating: stats.rating != null ? Number(stats.rating) : null,
          goals: stats.goals,
          penalties_scored: stats.penalties_scored ?? 0,
          assists: stats.assists,
          yellow_cards: stats.yellow_cards,
          red_cards: stats.red_cards,
          penalties_saved: stats.penalties_saved,
          penalties_missed: stats.penalties_missed,
          own_goals: stats.own_goals,
          goals_conceded: stats.goals_conceded,
          is_mvp: stats.is_mvp,
        },
        matchContext: {
          real_match_id: match.id,
          scoring_round_id: roundId,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_score: match.home_score ?? 0,
          away_score: match.away_score ?? 0,
        },
      },
      config,
    )
    rawByPlayer.set(pid, raw)

    // "played" bar — same logic as finalization's didPlay.
    const hasUsableScore = raw.voto_base !== null
    let played: boolean
    if (sub.trigger === 'no_rating') {
      played = hasUsableScore
    } else {
      played =
        hasUsableScore &&
        (stats.minutes_played >= sub.min_minutes ||
          hasDecisiveEvent({
            minutes_played: stats.minutes_played,
            rating: stats.rating != null ? Number(stats.rating) : null,
            goals: stats.goals,
            penalties_scored: stats.penalties_scored ?? 0,
            assists: stats.assists,
            yellow_cards: stats.yellow_cards,
            red_cards: stats.red_cards,
            penalties_saved: stats.penalties_saved,
            penalties_missed: stats.penalties_missed,
            own_goals: stats.own_goals,
            goals_conceded: stats.goals_conceded,
            is_mvp: stats.is_mvp,
          }))
    }

    stateByPlayer.set(pid, played ? 'played' : matchFinal ? 'not_played' : 'pending')
  }

  // ── MVP per fixture = highest SportMonks rating ────────────────────────
  // SportMonks is the single source for MVP. Pick the highest raw rating in
  // the fixture, regardless of fantasy ownership/bench status or minutes-rule
  // voto shaping. Ties break on lower player_id so live ticks stay stable.
  const mvpByMatch = new Map<string, string>()
  const bestByMatch = new Map<string, number>()
  for (const [pid, raw] of rawByPlayer) {
    const player = playerById.get(pid)
    if (!player) continue
    const match = matchByTeamId.get(player.national_team_id)
    if (!match) continue
    const stats = statsByKey.get(`${pid}:${match.id}`)
    const rating = stats?.rating != null ? Number(stats.rating) : null
    if (rating == null) continue
    const mid = raw.real_match_id
    const best = bestByMatch.get(mid)
    const cur = mvpByMatch.get(mid)
    if (
      best == null ||
      rating > best ||
      (rating === best && cur != null && pid < cur)
    ) {
      bestByMatch.set(mid, rating)
      mvpByMatch.set(mid, pid)
    }
  }
  for (const [pid, raw] of rawByPlayer) {
    raw.is_mvp = mvpByMatch.get(raw.real_match_id) === pid
  }
  const isMvpOf = (pid: string): boolean => rawByPlayer.get(pid)?.is_mvp ?? false

  const stateOf = (pid: string): PlayState => stateByPlayer.get(pid) ?? 'pending'

  // ============================================================
  // Ownership now vs potential.
  // ============================================================
  // now  — a single concrete fielded XI per team via applySubstitutions, with
  //        starters optimistic (pending counts as will-play) and bench counted
  //        only if CONFIRMED played. Drives current points + current penalty.
  //
  // potential — the per-PLAYER ceiling. It is NOT one lineup: the scenario that
  //        maximizes player P's ownership keeps P optimistic while assuming P's
  //        same-role RIVAL starters all fail. So we compute, per team & role:
  //          riskR  = same-role starters that could still fail (state != played)
  //          a starter counts if state != not_played (he might still play)
  //          a could-play bench at rank k counts if k < riskR (a slot vacates)
  //        The resulting per-team "potential" set can exceed 11 — that's fine,
  //        it is only ever read per-player to count ceilings, never as an XI.
  const totalTeams = teamIds.length
  const nowCount = new Map<string, number>()
  const maxCount = new Map<string, number>()

  for (const lineup of lineups) {
    // ---- now: one concrete XI ----
    const startersNow: SubStarter[] = []
    const benchNow: SubBench[] = []
    // ---- potential: per-role buckets ----
    const startersByRole = new Map<FMRole, string[]>() // starters that might play (state != not_played)
    const riskByRole = new Map<FMRole, number>() // same-role starter slots that could vacate
    const benchByRole = new Map<FMRole, { id: string; order: number }[]>() // could-play benches

    for (const lp of lineup.fm_matchday_lineup_player) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const role = player.role as FMRole
      const st = stateOf(lp.player_id)

      if (lp.is_starter) {
        startersNow.push({ player_id: lp.player_id, role, played: st !== 'not_played' })
        if (st !== 'not_played') {
          const arr = startersByRole.get(role) ?? []
          arr.push(lp.player_id)
          startersByRole.set(role, arr)
        }
        if (st !== 'played') riskByRole.set(role, (riskByRole.get(role) ?? 0) + 1)
      } else {
        const bo = lp.bench_order ?? 999
        benchNow.push({ player_id: lp.player_id, role, bench_order: bo, played: st === 'played' })
        if (st !== 'not_played') {
          const arr = benchByRole.get(role) ?? []
          arr.push({ id: lp.player_id, order: bo })
          benchByRole.set(role, arr)
        }
      }
    }

    for (const pid of applySubstitutions(startersNow, benchNow).fielded.map((f) => f.player_id)) {
      nowCount.set(pid, (nowCount.get(pid) ?? 0) + 1)
    }

    // potential per team: starters that might play + first `riskR` could-play benches.
    const potential = new Set<string>()
    for (const [, ids] of startersByRole) for (const id of ids) potential.add(id)
    for (const [role, benches] of benchByRole) {
      const risk = riskByRole.get(role) ?? 0
      benches.sort((a, b) => a.order - b.order)
      for (let k = 0; k < benches.length && k < risk; k++) potential.add(benches[k]!.id)
    }
    for (const pid of potential) maxCount.set(pid, (maxCount.get(pid) ?? 0) + 1)
  }

  const ownership: Record<string, LiveOwnershipEntry> = {}
  for (const pid of allPlayerIds) {
    const fn = nowCount.get(pid) ?? 0
    const fm = Math.max(maxCount.get(pid) ?? 0, fn) // never below current
    ownership[pid] = {
      fielded_now: fn,
      max_possible: fm,
      pct_now: totalTeams > 0 ? (fn / totalTeams) * 100 : 0,
      pct_potential: totalTeams > 0 ? (fm / totalTeams) * 100 : 0,
    }
  }

  // Which fantasy teams rostered each player, and how (titolare vs panchina).
  // Drives the cross-team ownership detail on both the team and match views.
  const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]))
  const ownersByPlayer = new Map<string, LiveOwnerRef[]>()
  for (const lineup of lineups) {
    const teamName = teamNameById.get(lineup.fantasy_team_id) ?? '—'
    for (const lp of lineup.fm_matchday_lineup_player) {
      const arr = ownersByPlayer.get(lp.player_id) ?? []
      arr.push({
        fantasy_team_id: lineup.fantasy_team_id,
        team_name: teamName,
        status: lp.is_starter ? 'titolare' : 'panchina',
      })
      ownersByPlayer.set(lp.player_id, arr)
    }
  }

  // ============================================================
  // Build the per-team board (sorted by live_total desc).
  // ============================================================
  const fieldedNowVia = new Map<string, Map<string, 'starter' | 'sub'>>()
  // subForByTeam:    sub player_id     → the non-playing titolare he replaced.
  // replacedByByTeam: titolare player_id → the bench sub now filling his slot.
  // Both drive the campetto's "who replaced whom" badges. A titolare who played
  // short (no eligible same-role sub) appears in neither map.
  const subForByTeam = new Map<string, Map<string, string>>()
  const replacedByByTeam = new Map<string, Map<string, string>>()
  // Played-short starter ids whose slot may still be filled by a pending sub.
  const pendingShortByTeam = new Map<string, Set<string>>()
  // Played-short starter id -> the first same-role bench candidate still pending.
  const replacementCandidateByTeam = new Map<string, Map<string, string>>()
  // Recompute the "now" fielded with via info for display.
  for (const lineup of lineups) {
    const startersNow: SubStarter[] = []
    const benchNow: SubBench[] = []
    for (const lp of lineup.fm_matchday_lineup_player) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const role = player.role as FMRole
      const st = stateOf(lp.player_id)
      if (lp.is_starter) {
        startersNow.push({ player_id: lp.player_id, role, played: st !== 'not_played' })
      } else {
        benchNow.push({
          player_id: lp.player_id,
          role,
          bench_order: lp.bench_order ?? 999,
          played: st === 'played',
        })
      }
    }
    const now = applySubstitutions(startersNow, benchNow)
    fieldedNowVia.set(
      lineup.fantasy_team_id,
      new Map(now.fielded.map((f) => [f.player_id, f.via])),
    )
    const subFor = new Map<string, string>()
    const replacedBy = new Map<string, string>()
    for (const f of now.fielded) {
      if (f.via === 'sub' && f.replaced_player_id) {
        subFor.set(f.player_id, f.replaced_player_id)
        replacedBy.set(f.replaced_player_id, f.player_id)
      }
    }
    subForByTeam.set(lineup.fantasy_team_id, subFor)
    replacedByByTeam.set(lineup.fantasy_team_id, replacedBy)

    // For each unfilled slot, is a same-role bench candidate still to play? If
    // so the substitution is merely PENDING (he'll come on once his match runs);
    // if every same-role bench player's match is over, the team plays short.
    const usedSet = new Set(now.benchUsed)
    const pending = new Set<string>()
    const candidates = new Map<string, string>()
    const benchByOrder = [...benchNow].sort((a, b) => a.bench_order - b.bench_order)
    for (const slot of now.emptySlots) {
      const candidate = benchByOrder.find(
        (b) => b.role === slot.role && !usedSet.has(b.player_id) && stateOf(b.player_id) === 'pending',
      )
      if (candidate) {
        pending.add(slot.starter_player_id)
        candidates.set(slot.starter_player_id, candidate.player_id)
      }
    }
    pendingShortByTeam.set(lineup.fantasy_team_id, pending)
    replacementCandidateByTeam.set(lineup.fantasy_team_id, candidates)
  }

  const teamsOut: LiveSnapshotTeam[] = (teams ?? []).map((team) => {
    const lineup = lineupByTeam.get(team.id)
    const fieldedVia = fieldedNowVia.get(team.id) ?? new Map()
    const subFor = subForByTeam.get(team.id) ?? new Map<string, string>()
    const replacedBy = replacedByByTeam.get(team.id) ?? new Map<string, string>()
    const pendingShort = pendingShortByTeam.get(team.id) ?? new Set<string>()
    const replacementCandidate = replacementCandidateByTeam.get(team.id) ?? new Map<string, string>()
    const playerRef = (pid: string | undefined): { player_id: string; name: string } | null => {
      if (!pid) return null
      const pl = playerById.get(pid)
      return pl ? { player_id: pid, name: pl.name } : null
    }
    const coach = liveCoach(coachIdByTeam.get(team.id))

    const players: LiveSnapshotPlayer[] = []
    let players_total = 0

    for (const lp of lineup?.fm_matchday_lineup_player ?? []) {
      const player = playerById.get(lp.player_id)
      if (!player) continue
      const own = ownership[lp.player_id]
      const raw = rawByPlayer.get(lp.player_id)
      const counts = fieldedVia.has(lp.player_id)
      const via = fieldedVia.get(lp.player_id) ?? (lp.is_starter ? 'starter' : 'bench')

      const matchForPlayer = matchByTeamId.get(player.national_team_id)
      const stats = matchForPlayer ? statsByKey.get(`${lp.player_id}:${matchForPlayer.id}`) : undefined

      // Immunità (live): a player fielded by exactly ONE team in this lega has
      // his card malus waived — same rule as the final engine, kept in sync.
      let adjustedRaw = raw
      let immunitaActive = false
      if (
        raw &&
        config.immunita_enabled &&
        (nowCount.get(lp.player_id) ?? 0) === 1 &&
        stats &&
        matchForPlayer &&
        (stats.yellow_cards > 0 || stats.red_cards > 0)
      ) {
        adjustedRaw = scorePlayerRaw(
          {
            playerId: lp.player_id,
            role: player.role as FMRole,
            nationalTeamId: player.national_team_id,
            stats: {
              minutes_played: stats.minutes_played,
              rating: stats.rating != null ? Number(stats.rating) : null,
              goals: stats.goals,
              penalties_scored: stats.penalties_scored ?? 0,
              assists: stats.assists,
              yellow_cards: stats.yellow_cards,
              red_cards: stats.red_cards,
              penalties_saved: stats.penalties_saved,
              penalties_missed: stats.penalties_missed,
              own_goals: stats.own_goals,
              goals_conceded: stats.goals_conceded,
              is_mvp: stats.is_mvp,
            },
            matchContext: {
              real_match_id: matchForPlayer.id,
              scoring_round_id: roundId,
              home_team_id: matchForPlayer.home_team_id,
              away_team_id: matchForPlayer.away_team_id,
              home_score: matchForPlayer.home_score ?? 0,
              away_score: matchForPlayer.away_score ?? 0,
            },
          },
          config,
          { immunitaGranted: true },
        )
        immunitaActive = true
      }
      const rawSubtotal = adjustedRaw?.raw_subtotal ?? 0

      let popularity_penalty_now = 0
      let popularity_penalty_potential = 0
      let popularity_penalty_potential_without_immunity: number | null = null
      let final_score_potential_without_immunity: number | null = null
      const immunity_removed_malus = immunitaActive && stats
        ? Math.abs((stats.yellow_cards ?? 0) * config.football.yellow_card) +
          Math.abs((stats.red_cards ?? 0) * config.football.red_card)
        : 0
      let mvp_bonus = 0
      let final_score_now = 0
      const matchHomeScore = matchForPlayer?.home_score ?? 0
      const matchAwayScore = matchForPlayer?.away_score ?? 0
      const isHome = matchForPlayer ? player.national_team_id === matchForPlayer.home_team_id : false
      const goalsConceded = isHome ? matchAwayScore : matchHomeScore
      const cleanSheetBonus =
        raw?.voto_base != null && goalsConceded === 0 && player.role === 'P'
          ? config.football.clean_sheet.P
          : raw?.voto_base != null &&
              goalsConceded === 0 &&
              player.role === 'D' &&
              (stats?.minutes_played ?? 0) >= config.football.clean_sheet.min_minutes
            ? config.football.clean_sheet.D
            : 0
      // Display split: BASE = voto_base (rating-derived, NO bonuses), TOTAL =
      // raw_subtotal (base + all football bonus/malus). The clean sheet, goals,
      // etc. live only in the total and are surfaced as icons — never folded
      // into the base. So a 0-0 keeper reads e.g. 6.1 base · 7.1 total.
      const displayVotoBase = adjustedRaw?.voto_base ?? null
      const displayVotoTotal = displayVotoBase != null ? rawSubtotal : null

      if (adjustedRaw) {
        const finNow = finalizePlayerForLega(
          { raw_subtotal: rawSubtotal, is_mvp: isMvpOf(lp.player_id) },
          own?.pct_now ?? 0,
          config,
        )
        const finMax = finalizePlayerForLega(
          { raw_subtotal: rawSubtotal, is_mvp: isMvpOf(lp.player_id) },
          own?.pct_potential ?? 0,
          config,
        )
        popularity_penalty_now = finNow.popularity_penalty_amount
        popularity_penalty_potential = finMax.popularity_penalty_amount
        if (immunitaActive && immunity_removed_malus > 0) {
          const finMaxWithoutImmunity = finalizePlayerForLega(
            { raw_subtotal: rawSubtotal - immunity_removed_malus, is_mvp: isMvpOf(lp.player_id) },
            own?.pct_potential ?? 0,
            config,
          )
          popularity_penalty_potential_without_immunity = finMaxWithoutImmunity.popularity_penalty_amount
          final_score_potential_without_immunity = finMaxWithoutImmunity.final_score
        }
        mvp_bonus = finNow.mvp_bonus_amount
        final_score_now = finNow.final_score
        if (counts) players_total += finNow.final_score
      }

      // Bracket penalty % depends only on ownership, so it's known even before
      // the player has a rating (raw_subtotal is irrelevant to the bracket).
      const popularity_penalty_pct_now = finalizePlayerForLega(
        { raw_subtotal: 0, is_mvp: false },
        own?.pct_now ?? 0,
        config,
      ).popularity_penalty_pct
      const popularity_penalty_pct_potential = finalizePlayerForLega(
        { raw_subtotal: 0, is_mvp: false },
        own?.pct_potential ?? 0,
        config,
      ).popularity_penalty_pct

      players.push({
        player_id: lp.player_id,
        name: player.name,
        role: player.role as FMRole,
        via,
        bench_order: lp.is_starter ? null : (lp.bench_order ?? 999),
        national_team: (player.fm_national_team as LiveTeamRef | null) ?? null,
        status: stateOf(lp.player_id),
        counts,
        sub_for: playerRef(subFor.get(lp.player_id)),
        replaced_by: playerRef(replacedBy.get(lp.player_id)),
        replacement_pending:
          lp.is_starter && !counts && !replacedBy.has(lp.player_id)
            ? pendingShort.has(lp.player_id)
            : null,
        replacement_candidate:
          lp.is_starter && !counts && !replacedBy.has(lp.player_id)
            ? playerRef(replacementCandidate.get(lp.player_id))
            : null,
        rating: stats?.rating != null ? Number(stats.rating) : null,
        voto_base: raw?.voto_base ?? null,
        display_voto_base: displayVotoBase,
        display_voto_total: displayVotoTotal,
        raw_subtotal: rawSubtotal,
        football_bonus: adjustedRaw?.football_bonus ?? 0,
        football_malus: adjustedRaw?.football_malus ?? 0,
        clean_sheet_bonus: cleanSheetBonus,
        yellow_cards: stats?.yellow_cards ?? 0,
        red_cards: stats?.red_cards ?? 0,
        own_goals: stats?.own_goals ?? 0,
        penalties_scored: stats?.penalties_scored ?? 0,
        penalties_saved: stats?.penalties_saved ?? 0,
        penalties_missed: stats?.penalties_missed ?? 0,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        immunita_active: immunitaActive,
        popularity_penalty_now,
        popularity_penalty_potential,
        popularity_penalty_potential_without_immunity,
        final_score_potential_without_immunity,
        immunity_removed_malus,
        popularity_penalty_pct_now,
        popularity_penalty_pct_potential,
        mvp_bonus,
        final_score_now,
        owners: (ownersByPlayer.get(lp.player_id) ?? []).filter(
          (o) => o.fantasy_team_id !== team.id,
        ),
      })
    }

    const live_total = players_total + (coach?.live_score ?? 0)
    return {
      fantasy_team_id: team.id,
      name: team.name,
      manager_name: managerNameById.get(team.manager_id) ?? null,
      formation: lineup?.formation ?? null,
      coach,
      players_total: Math.round(players_total * 100) / 100,
      live_total: Math.round(live_total * 100) / 100,
      players,
    }
  })

  teamsOut.sort((a, b) => b.live_total - a.live_total)

  // ============================================================
  // Build matches[] for the live dashboard match panel.
  // For each real match, include all fm_player rows for those
  // national teams that have stats (minutes_played > 0), annotated
  // with ownership signals derived from the already-computed ownership map.
  // ============================================================
  const matchesOut: LiveSnapshotMatch[] = (matches ?? []).map((m) => {
    const homeTeamData = nationalTeamById.get(m.home_team_id)
    const awayTeamData = nationalTeamById.get(m.away_team_id)
    const homeTeam: LiveTeamRef = homeTeamData
      ? { name: homeTeamData.name, fifa_code: homeTeamData.fifa_code ?? '', logo_url: homeTeamData.logo_url ?? null, flag_url: homeTeamData.flag_url ?? null }
      : { name: m.home_team_id, fifa_code: '', logo_url: null, flag_url: null }
    const awayTeam: LiveTeamRef = awayTeamData
      ? { name: awayTeamData.name, fifa_code: awayTeamData.fifa_code ?? '', logo_url: awayTeamData.logo_url ?? null, flag_url: awayTeamData.flag_url ?? null }
      : { name: m.away_team_id, fifa_code: '', logo_url: null, flag_url: null }

    // All pool players for this match's two teams who have played (minutes > 0)
    // or are listed in the pool (to show even before the match starts).
    const matchPlayerIds = [
      ...new Set([
        ...(allMatchPlayers ?? [])
          .filter((p) => p.national_team_id === m.home_team_id || p.national_team_id === m.away_team_id)
          .map((p) => p.id),
        ...(allStats ?? []).filter((s) => s.real_match_id === m.id).map((s) => s.player_id),
      ]),
    ]

    const roleRank: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 }
    const realPlayers: LiveSnapshotRealPlayer[] = matchPlayerIds
      .map((pid): LiveSnapshotRealPlayer | null => {
        const player = playerById.get(pid)
        if (!player) return null
        const stats = statsByKey.get(`${pid}:${m.id}`)
        // Only players who were in the real match-day squad (have a stats row).
        if (!stats) return null
        const own = ownership[pid]
        const fn = own?.fielded_now ?? 0
        const mp = own?.max_possible ?? 0
        let signal: LiveSnapshotRealPlayer['ownership_signal'] = null
        if (fn > 0 || mp > 0) {
          if (fn === 0) signal = 'bench_only'
          else if (fn === 1 && mp === 1) signal = 'excl_safe'
          else if (fn === 1 && mp > 1) signal = 'excl_risk'
          else signal = 'shared'
        }
        const raw = rawByPlayer.get(pid)
        const ratingNum = stats.rating != null ? Number(stats.rating) : null
        const votoBase = raw?.voto_base ?? null
        const voto = raw && votoBase != null ? raw.raw_subtotal : null
        const matchHomeScore = m.home_score ?? 0
        const matchAwayScore = m.away_score ?? 0
        const isHome = player.national_team_id === m.home_team_id
        const goalsConceded = isHome ? matchAwayScore : matchHomeScore
        const cleanSheetBonus =
          votoBase != null && goalsConceded === 0 && player.role === 'P'
            ? config.football.clean_sheet.P
            : votoBase != null &&
                goalsConceded === 0 &&
                player.role === 'D' &&
                (stats.minutes_played ?? 0) >= config.football.clean_sheet.min_minutes
              ? config.football.clean_sheet.D
              : 0
        const footballBonus = raw?.football_bonus ?? 0
        const footballMalus = raw?.football_malus ?? 0
        // BASE = voto_base (rating-derived, NO bonuses); TOTAL = raw_subtotal
        // (base + football bonus/malus). Clean sheet / goals live only in the
        // total and show as icons — never folded into the base.
        const displayVotoBase = votoBase
        const displayVotoTotal = voto
        const finalized = voto != null
          ? finalizePlayerForLega(
              { raw_subtotal: voto, is_mvp: isMvpOf(pid) },
              own?.pct_now ?? 0,
              config,
            )
          : null
        return {
          player_id: pid,
          name: player.name,
          role: player.role as FMRole,
          national_team_id: player.national_team_id,
          jersey_number: stats.jersey_number ?? null,
          is_starter: stats.is_starter ?? false,
          rating: ratingNum,
          voto_base: votoBase,
          voto,
          display_voto_base: displayVotoBase,
          display_voto_total: displayVotoTotal,
          football_bonus: footballBonus,
          football_malus: footballMalus,
          clean_sheet_bonus: cleanSheetBonus,
          is_mvp: isMvpOf(pid),
          popularity_penalty_now: finalized?.popularity_penalty_amount ?? 0,
          popularity_penalty_pct_now: finalized?.popularity_penalty_pct ?? 0,
          mvp_bonus: finalized?.mvp_bonus_amount ?? 0,
          final_score_now: finalized?.final_score ?? null,
          minutes_played: stats.minutes_played ?? null,
          play_state: stateOf(pid),
          goals: stats.goals ?? 0,
          assists: stats.assists ?? 0,
          yellow_cards: stats.yellow_cards ?? 0,
          red_cards: stats.red_cards ?? 0,
          own_goals: stats.own_goals ?? 0,
          penalties_scored: stats.penalties_scored ?? 0,
          penalties_saved: stats.penalties_saved ?? 0,
          penalties_missed: stats.penalties_missed ?? 0,
          subbed_on_minute: stats.subbed_on_minute ?? null,
          subbed_off_minute: stats.subbed_off_minute ?? null,
          replaced_player_name: stats.replaced_player_id
            ? (playerById.get(stats.replaced_player_id)?.name ?? null)
            : null,
          replacement_player_name: stats.replacement_player_id
            ? (playerById.get(stats.replacement_player_id)?.name ?? null)
            : null,
          owners: ownersByPlayer.get(pid) ?? [],
          ownership_signal: signal,
          fielded_now: fn,
          max_possible: mp,
        }
      })
      .filter((p): p is LiveSnapshotRealPlayer => p !== null)
      // Starters first (by role P→D→C→A), then bench/subs, name as tiebreak.
      .sort(
        (a, b) =>
          Number(b.is_starter) - Number(a.is_starter) ||
          (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) ||
          a.name.localeCompare(b.name),
      )

    return {
      match_id: m.id,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team: homeTeam,
      away_team: awayTeam,
      home_score: m.home_score,
      away_score: m.away_score,
      minute: (m as typeof m & { minute?: number | null }).minute ?? null,
      minute_added: (m as typeof m & { minute_added?: number | null }).minute_added ?? null,
      status: m.status as LiveSnapshotMatch['status'],
      kickoff_at: (m as typeof m & { kickoff_at: string }).kickoff_at,
      goal_events: extractGoalEventsFromFixture(
        m.sportmonks_fixture_id != null ? cachedFixtureById.get(m.sportmonks_fixture_id) : null,
        { home_team: homeTeam, away_team: awayTeam },
      ),
      players: realPlayers,
    }
  })

  matchesOut.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))

  // ============================================================
  // Battle Royale standings — goals scored + giornata points.
  // ============================================================
  const br = config.battle_royale
  const thresholds = br.goal_thresholds.slice().sort((a, b) => a - b)

  function goalsFromTotal(total: number): number {
    return thresholds.filter((t) => total >= t).length
  }

  // Compute goals per team
  const goalsByTeam = new Map<string, number>()
  for (const t of teamsOut) {
    goalsByTeam.set(t.fantasy_team_id, goalsFromTotal(t.live_total))
  }

  // BR giornata points: each team plays against every other (round-robin)
  const standings: Record<string, LiveSnapshotTeamStandings> = {}
  for (const t of teamsOut) {
    const myGoals = goalsByTeam.get(t.fantasy_team_id) ?? 0
    let pts = 0
    for (const other of teamsOut) {
      if (other.fantasy_team_id === t.fantasy_team_id) continue
      const theirGoals = goalsByTeam.get(other.fantasy_team_id) ?? 0
      if (myGoals > theirGoals) pts += br.win_points
      else if (myGoals === theirGoals) pts += br.draw_points
      else pts += br.loss_points
    }
    standings[t.fantasy_team_id] = {
      live_total: t.live_total,
      goals_scored: myGoals,
      giornata_points: pts,
    }
  }

  // ============================================================
  // Cumulative season Classifica (live) — finalized past rounds
  // + this giornata's live projection layered on top.
  // ============================================================
  // Past finalized BR points + raw score, EXCLUDING the current (live) round.
  const { data: priorScores } = await supabase
    .from('fm_fantasy_team_round_score')
    .select('fantasy_team_id, br_points, raw_total')
    .in('fantasy_team_id', teamIds)
    .neq('scoring_round_id', roundId)
  const priorBrByTeam = new Map<string, number>()
  const priorRawByTeam = new Map<string, number>()
  for (const r of priorScores ?? []) {
    priorBrByTeam.set(r.fantasy_team_id, (priorBrByTeam.get(r.fantasy_team_id) ?? 0) + (r.br_points ?? 0))
    priorRawByTeam.set(
      r.fantasy_team_id,
      (priorRawByTeam.get(r.fantasy_team_id) ?? 0) + Number(r.raw_total ?? 0),
    )
  }

  type ClassificaRow = LiveSnapshotTeamClassifica & { fantasy_team_id: string }
  const classificaRows: ClassificaRow[] = teamsOut.map((t) => {
    const priorBr = priorBrByTeam.get(t.fantasy_team_id) ?? 0
    const priorRaw = priorRawByTeam.get(t.fantasy_team_id) ?? 0
    const live = standings[t.fantasy_team_id]
    return {
      fantasy_team_id: t.fantasy_team_id,
      br_points_prior: priorBr,
      br_points_total: priorBr + (live?.giornata_points ?? 0),
      raw_score_prior: Math.round(priorRaw * 100) / 100,
      raw_score_total: Math.round((priorRaw + (live?.live_total ?? 0)) * 100) / 100,
      rank: 0,
    }
  })
  // Rank: BR points desc, raw total desc as tiebreak.
  classificaRows.sort(
    (a, b) => b.br_points_total - a.br_points_total || b.raw_score_total - a.raw_score_total,
  )
  classificaRows.forEach((r, i) => {
    r.rank = i + 1
  })
  const classifica: Record<string, LiveSnapshotTeamClassifica> = {}
  for (const { fantasy_team_id, ...rest } of classificaRows) {
    classifica[fantasy_team_id] = rest
  }

  return {
    computed_at: new Date().toISOString(),
    round: { id: round.id, name: round.name, phase_id: round.phase_id },
    teams: teamsOut,
    ownership,
    matches: matchesOut,
    standings,
    classifica,
  }
}
