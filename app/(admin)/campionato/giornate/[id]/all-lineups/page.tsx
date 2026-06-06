import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { AllLineupsClient } from './AllLineupsClient'
import type { TeamLineupData, MatchupPair } from './AllLineupsClient'
import { LiveAutoRefresh } from '@/components/live/LiveAutoRefresh'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Formazioni — ${data?.name ?? 'Giornata'}` }
}

export default async function AllLineupsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, round_number')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // All fantasy teams for this league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  if (!teams || teams.length === 0) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">← {matchday.name}</a>
        <p className="text-sm text-ink-4">Nessuna squadra trovata.</p>
      </div>
    )
  }

  const teamIds = teams.map((t) => t.id)

  // Current submission pointers for all teams
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('team_id, submission_id')
    .eq('matchday_id', matchdayId)
    .in('team_id', teamIds)

  const submissionIds = (pointers ?? []).map((p) => p.submission_id)
  const pointerMap = new Map((pointers ?? []).map((p) => [p.team_id, p.submission_id]))

  // Fetch submissions
  const { data: submissions } = submissionIds.length > 0
    ? await supabase
        .from('lineup_submissions')
        .select('id, team_id, formation_id, submission_number, status')
        .in('id', submissionIds)
    : { data: [] }

  const submissionMap = new Map((submissions ?? []).map((s) => [s.id, s]))

  // Fetch all player assignments for these submissions
  const { data: allPlayers } = submissionIds.length > 0
    ? await supabase
        .from('lineup_submission_players')
        .select('submission_id, player_id, slot_id, is_bench, bench_order, assigned_mantra_role')
        .in('submission_id', submissionIds)
    : { data: [] }

  // Collect all formation IDs
  const formationIds = [...new Set((submissions ?? []).map((s) => s.formation_id))]

  // Fetch formations + their slots
  const { data: formations } = formationIds.length > 0
    ? await supabase
        .from('formations')
        .select('id, name')
        .in('id', formationIds)
    : { data: [] }

  const formationNameMap = new Map((formations ?? []).map((f) => [f.id, f.name]))

  const { data: allSlots } = formationIds.length > 0
    ? await supabase
        .from('formation_slots')
        .select('id, formation_id, slot_name, slot_order, is_bench, bench_order, allowed_mantra_roles')
        .in('formation_id', formationIds)
        .order('slot_order', { ascending: true })
    : { data: [] }

  const slotsByFormation = new Map<string, typeof allSlots>()
  for (const slot of allSlots ?? []) {
    const list = slotsByFormation.get(slot.formation_id) ?? []
    list.push(slot)
    slotsByFormation.set(slot.formation_id, list)
  }

  // Collect all player IDs
  const allPlayerIds = [...new Set((allPlayers ?? []).map((p) => p.player_id))]

  const { data: leaguePlayers } = allPlayerIds.length > 0
    ? await supabase
        .from('league_players')
        .select('id, full_name, club, mantra_roles, rating_class')
        .in('id', allPlayerIds)
    : { data: [] }

  const playerInfoMap = new Map((leaguePlayers ?? []).map((p) => [p.id, p]))

  // Fetch latest calculation run for player ratings
  const { data: currentPtr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  // If no published run, use the latest run
  let runId = currentPtr?.run_id ?? null
  if (!runId) {
    const { data: latestRun } = await supabase
      .from('calculation_runs')
      .select('id')
      .eq('matchday_id', matchdayId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    runId = latestRun?.id ?? null
  }

  type BonusMalusItem = { label: string; total: number }
  const calcMap = new Map<string, {
    fantavoto: number | null
    voto_base: number | null
    bonusMalus: BonusMalusItem[] | null
    z_rating: number | null
    minutes_factor: number | null
    role_multiplier: number | null
  }>()
  if (runId) {
    const { data: calcs } = await supabase
      .from('player_calculations')
      .select('player_id, fantavoto, voto_base, bonus_malus_breakdown, z_rating, minutes_factor, role_multiplier')
      .eq('run_id', runId)

    for (const c of calcs ?? []) {
      const raw = c.bonus_malus_breakdown as Array<{ label: string; total: number; quantity: number; points_each: number }> | null
      const bonusMalus = raw ? raw.filter(b => b.total !== 0) : null
      calcMap.set(c.player_id, {
        fantavoto: c.fantavoto,
        voto_base: c.voto_base,
        bonusMalus: bonusMalus?.length ? bonusMalus : null,
        z_rating: c.z_rating,
        minutes_factor: c.minutes_factor,
        role_multiplier: c.role_multiplier,
      })
    }
  }

  // ── Raw source ratings + stats from player_match_stats ───────────────────
  type StatsRow = {
    rating: number | null
    minutesPlayed: number
    goalsScored: number
    assists: number
    yellowCards: number
    redCards: number
    saves: number
    goalsConceded: number
    cleanSheet: boolean
    shots: number
    shotsOnTarget: number
    bigChanceCreated: number
    bigChanceMissed: number
    blockedScoringAttempt: number
    xg: number | null
    xa: number | null
    keyPasses: number | null
    totalPasses: number
    accuratePasses: number
    totalLongBalls: number
    accurateLongBalls: number
    totalCrosses: number
    successfulDribbles: number | null
    dribbleAttempts: number
    touches: number
    ballCarries: number
    progressiveCarries: number
    dispossessed: number
    possessionLostCtrl: number
    tackles: number
    totalTackles: number
    interceptions: number
    clearances: number
    blockedShots: number
    duelWon: number
    duelLost: number
    aerialWon: number
    aerialLost: number
    ballRecoveries: number
    foulsCommitted: number
    wasFouled: number
    marketValue: number | null
    height: number | null
  }
  const statsMap = new Map<string, StatsRow>()
  {
    const { data: statsRows } = await supabase
      .from('player_match_stats')
      .select('player_id, rating, minutes_played, goals_scored, assists, yellow_cards, red_cards, saves, goals_conceded, clean_sheet, shots, shots_on_target, big_chance_created, big_chance_missed, blocked_scoring_attempt, xg, xa, key_passes, total_passes, accurate_passes, total_long_balls, accurate_long_balls, total_crosses, successful_dribbles, dribble_attempts, touches, ball_carries, progressive_carries, dispossessed, possession_lost_ctrl, tackles_won, total_tackles, interceptions, clearances, blocks, duel_won, duel_lost, aerial_won, aerial_lost, ball_recoveries, fouls_committed, was_fouled, market_value, height')
      .eq('matchday_id', matchdayId)
    for (const s of statsRows ?? []) {
      statsMap.set(s.player_id, {
        rating:          s.rating         !== null ? Number(s.rating)    : null,
        minutesPlayed:         s.minutes_played         ?? 0,
        goalsScored:           s.goals_scored           ?? 0,
        assists:               s.assists                ?? 0,
        yellowCards:           s.yellow_cards           ?? 0,
        redCards:              s.red_cards              ?? 0,
        saves:                 s.saves                  ?? 0,
        goalsConceded:         s.goals_conceded         ?? 0,
        cleanSheet:            s.clean_sheet            ?? false,
        shots:                 s.shots                  ?? 0,
        shotsOnTarget:         s.shots_on_target        ?? 0,
        bigChanceCreated:      s.big_chance_created     ?? 0,
        bigChanceMissed:       s.big_chance_missed      ?? 0,
        blockedScoringAttempt: s.blocked_scoring_attempt ?? 0,
        xg:                    s.xg                     !== null ? Number(s.xg) : null,
        xa:                    s.xa                     !== null ? Number(s.xa) : null,
        keyPasses:             s.key_passes             ?? null,
        totalPasses:           s.total_passes           ?? 0,
        accuratePasses:        s.accurate_passes        ?? 0,
        totalLongBalls:        s.total_long_balls       ?? 0,
        accurateLongBalls:     s.accurate_long_balls    ?? 0,
        totalCrosses:          s.total_crosses          ?? 0,
        successfulDribbles:    s.successful_dribbles    ?? null,
        dribbleAttempts:       s.dribble_attempts       ?? 0,
        touches:               s.touches                ?? 0,
        ballCarries:           s.ball_carries           ?? 0,
        progressiveCarries:    s.progressive_carries    ?? 0,
        dispossessed:          s.dispossessed           ?? 0,
        possessionLostCtrl:    s.possession_lost_ctrl   ?? 0,
        tackles:               s.tackles_won            ?? 0,
        totalTackles:          s.total_tackles          ?? 0,
        interceptions:         s.interceptions          ?? 0,
        clearances:            s.clearances             ?? 0,
        blockedShots:          s.blocks                 ?? 0,
        duelWon:               s.duel_won               ?? 0,
        duelLost:              s.duel_lost              ?? 0,
        aerialWon:             s.aerial_won             ?? 0,
        aerialLost:            s.aerial_lost            ?? 0,
        ballRecoveries:        s.ball_recoveries        ?? 0,
        foulsCommitted:        s.fouls_committed        ?? 0,
        wasFouled:             s.was_fouled             ?? 0,
        marketValue:           s.market_value           !== null ? Number(s.market_value) : null,
        height:                s.height                 !== null ? Number(s.height) : null,
      })
    }
  }

  // ── Live signal ────────────────────────────────────────────────────────────
  // SportMonks ratings-tick writes provisional rows to player_match_stats while
  // matches are in play. Surface (a) the freshest write time for the staleness
  // pill, (b) the set of players with a provisional row so the "playing now"
  // dot can render.
  let liveRefreshedAt: string | null = null
  let liveMatchPlayerIds: string[] = []
  if (matchday.status === 'open') {
    const { data: provisional } = await supabase
      .from('player_match_stats')
      .select('player_id, updated_at')
      .eq('matchday_id', matchdayId)
      .eq('is_provisional', true)
    for (const row of provisional ?? []) {
      liveMatchPlayerIds.push(row.player_id)
      if (row.updated_at && (!liveRefreshedAt || row.updated_at > liveRefreshedAt)) {
        liveRefreshedAt = row.updated_at
      }
    }
  }

  // ── Fetch competition matchups for this round ──────────────────────────────
  // Used to pair teams in head-to-head layout instead of a plain grid.
  // Also pull goal-converted scores from the linked Campionato round (when
  // already computed) so the matchup header can show the final result.
  let matchupPairs: Array<{
    homeTeamId: string
    awayTeamId: string
    homeGoals: number | null
    awayGoals: number | null
  }> = []
  if (matchday.round_number !== null) {
    const { data: comps } = await supabase
      .from('competitions')
      .select('id, type')
      .eq('league_id', ctx.league.id)

    const compIds = (comps ?? []).map((c) => c.id)
    const campionatoCompIds = (comps ?? []).filter((c) => c.type === 'campionato').map((c) => c.id)

    if (compIds.length > 0) {
      const [rawMatchupsRes, fixturesRes] = await Promise.all([
        supabase
          .from('competition_matchups')
          .select('home_team_id, away_team_id')
          .in('competition_id', compIds)
          .eq('round_number', matchday.round_number),
        campionatoCompIds.length > 0
          ? supabase
              .from('competition_fixtures')
              .select('home_team_id, away_team_id, home_score, away_score, competition_rounds!inner(matchday_id)')
              .in('competition_id', campionatoCompIds)
              .eq('competition_rounds.matchday_id', matchdayId)
          : Promise.resolve({ data: [] as Array<{ home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }> }),
      ])

      // Build pair-key → per-team goals map (orientation-tolerant)
      const goalsByPairKey = new Map<string, Map<string, number>>()
      for (const f of fixturesRes.data ?? []) {
        if (f.home_score == null || f.away_score == null) continue
        const key = [f.home_team_id, f.away_team_id].sort().join('|')
        goalsByPairKey.set(key, new Map([
          [f.home_team_id, f.home_score],
          [f.away_team_id, f.away_score],
        ]))
      }

      // Deduplicate: same pair may appear in multiple competitions
      const seen = new Set<string>()
      for (const m of rawMatchupsRes.data ?? []) {
        const key = [m.home_team_id, m.away_team_id].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          const goals = goalsByPairKey.get(key)
          matchupPairs.push({
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            homeGoals: goals?.get(m.home_team_id) ?? null,
            awayGoals: goals?.get(m.away_team_id) ?? null,
          })
        }
      }
    }
  }

  // Build TeamLineupData for each team
  const teamLineups: TeamLineupData[] = teams.map((team) => {
    const submissionId = pointerMap.get(team.id) ?? null
    const submission = submissionId ? submissionMap.get(submissionId) ?? null : null
    const formationId = submission?.formation_id ?? null
    const formationName = formationId ? formationNameMap.get(formationId) ?? '—' : '—'
    const slots = formationId ? (slotsByFormation.get(formationId) ?? []) : []

    const teamPlayerAssignments = (allPlayers ?? []).filter(
      (p) => p.submission_id === submissionId
    )
    const assignmentBySlot = new Map(teamPlayerAssignments.map((a) => [a.slot_id, a]))

    const slotData = slots.map((slot) => {
      const assignment = assignmentBySlot.get(slot.id) ?? null
      const player = assignment ? (playerInfoMap.get(assignment.player_id) ?? null) : null
      const calc = assignment ? (calcMap.get(assignment.player_id) ?? null) : null
      const rawStats = assignment ? (statsMap.get(assignment.player_id) ?? null) : null
      return {
        slotId: slot.id,
        positionName: slot.slot_name,
        slotOrder: slot.slot_order,
        isBench: slot.is_bench,
        benchOrder: slot.bench_order,
        allowedRoles: slot.allowed_mantra_roles ?? [],
        playerId: assignment?.player_id ?? null,
        playerName: player?.full_name ?? null,
        playerClub: player?.club ?? null,
        playerRoles: player?.mantra_roles ?? [],
        playerRatingClass: player?.rating_class ?? null,
        fantavoto: calc?.fantavoto ?? null,
        votoBase: calc?.voto_base ?? null,
        bonusMalus: calc?.bonusMalus ?? null,
        zRating: calc?.z_rating ?? null,
        minutesFactor: calc?.minutes_factor ?? null,
        roleMultiplier: calc?.role_multiplier ?? null,
        rawRating:    rawStats?.rating    ?? null,
        minutesPlayed:      rawStats?.minutesPlayed   ?? null,
        goalsScored:        rawStats?.goalsScored     ?? null,
        assists:            rawStats?.assists         ?? null,
        yellowCards:        rawStats?.yellowCards     ?? null,
        redCards:           rawStats?.redCards        ?? null,
        saves:              rawStats?.saves           ?? null,
        goalsConceded:      rawStats?.goalsConceded   ?? null,
        cleanSheet:         rawStats?.cleanSheet      ?? null,
        shots:                 rawStats?.shots                 ?? null,
        shotsOnTarget:         rawStats?.shotsOnTarget         ?? null,
        bigChanceCreated:      rawStats?.bigChanceCreated      ?? null,
        bigChanceMissed:       rawStats?.bigChanceMissed       ?? null,
        blockedScoringAttempt: rawStats?.blockedScoringAttempt ?? null,
        xg:                    rawStats?.xg                    ?? null,
        xa:                    rawStats?.xa                    ?? null,
        keyPasses:             rawStats?.keyPasses             ?? null,
        totalPasses:           rawStats?.totalPasses           ?? null,
        accuratePasses:        rawStats?.accuratePasses        ?? null,
        totalLongBalls:        rawStats?.totalLongBalls        ?? null,
        accurateLongBalls:     rawStats?.accurateLongBalls     ?? null,
        totalCrosses:          rawStats?.totalCrosses          ?? null,
        successfulDribbles:    rawStats?.successfulDribbles    ?? null,
        dribbleAttempts:       rawStats?.dribbleAttempts       ?? null,
        touches:               rawStats?.touches               ?? null,
        ballCarries:           rawStats?.ballCarries           ?? null,
        progressiveCarries:    rawStats?.progressiveCarries    ?? null,
        dispossessed:          rawStats?.dispossessed          ?? null,
        possessionLostCtrl:    rawStats?.possessionLostCtrl    ?? null,
        tackles:               rawStats?.tackles               ?? null,
        totalTackles:          rawStats?.totalTackles          ?? null,
        interceptions:         rawStats?.interceptions         ?? null,
        clearances:            rawStats?.clearances            ?? null,
        blockedShots:          rawStats?.blockedShots          ?? null,
        duelWon:               rawStats?.duelWon               ?? null,
        duelLost:              rawStats?.duelLost              ?? null,
        aerialWon:             rawStats?.aerialWon             ?? null,
        aerialLost:            rawStats?.aerialLost            ?? null,
        ballRecoveries:        rawStats?.ballRecoveries        ?? null,
        foulsCommitted:        rawStats?.foulsCommitted        ?? null,
        wasFouled:             rawStats?.wasFouled             ?? null,
        marketValue:           rawStats?.marketValue           ?? null,
        height:                rawStats?.height                ?? null,
        assignedMantraRole: assignment?.assigned_mantra_role ?? null,
        isBenchAssignment: assignment?.is_bench ?? false,
        benchOrderAssignment: assignment?.bench_order ?? null,
      }
    })

    return {
      teamId: team.id,
      teamName: team.name,
      formationId: formationId ?? '',
      formationName,
      submissionId,
      submissionNumber: submission?.submission_number ?? null,
      slots: slotData,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <a href={`/campionato/giornate/${matchdayId}`} className="text-[12.5px] text-ink-3 hover:text-indigo-400">
            ← {matchday.name}
          </a>
          <h1
            className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-light text-ink-1"
            style={{
              fontSize: 'clamp(26px, 3.4vw, 38px)',
              lineHeight: 1.12,
              letterSpacing: '-0.035em',
            }}
          >
            <span className="font-semibold">{matchday.name}</span>
            <span className="serif text-ink-3">
              — formazioni
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-[1.55] text-ink-3">
            Trascina i giocatori per correggere titolari e panchina, salva ogni squadra individualmente.
          </p>
          {matchday.status === 'open' && (
            <LiveAutoRefresh
              matchdayId={matchdayId}
              refreshedAt={liveRefreshedAt}
            />
          )}
        </div>
      </div>

      <AllLineupsClient
        matchdayId={matchdayId}
        matchdayStatus={matchday.status}
        teamLineups={teamLineups}
        matchups={matchupPairs}
        liveMatchPlayerIds={liveMatchPlayerIds}
      />
    </div>
  )
}
