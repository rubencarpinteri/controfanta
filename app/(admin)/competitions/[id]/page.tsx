import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { isUuid } from '@/lib/slug'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge, MatchdayStatusBadge } from '@/components/ui/badge'
import type { Competition, CompetitionMatchup, FantasyTeam } from '@/types/database.types'
import { GenerateMatchdaysForm } from './GenerateMatchdaysForm'
import { CalendarioClient } from './CalendarioClient'
import type { RoundData, MatchupData } from './CalendarioClient'
import { QuickFetchAndCalculateButton } from '@/app/(admin)/campionato/giornate/[id]/calculate/QuickFetchAndCalculateButton'
import { BattleRoyaleDetailView } from './BattleRoyaleDetailView'

const TYPE_LABEL: Record<string, string> = {
  campionato: 'Campionato', battle_royale: 'Battle Royale', coppa: 'Coppa',
}
const STATUS_COLOR: Record<string, string> = {
  setup:     'text-ink-4 bg-glass-2',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup', active: 'Attiva', completed: 'Conclusa', cancelled: 'Annullata',
}

// Matchday status priority for "most active"
const MD_PRIORITY: Record<string, number> = {
  open: 0, locked: 1, scoring: 2, published: 3, draft: 4, archived: 5,
}

interface StandingRow {
  team_id: string
  team_name: string
  played: number
  wins: number
  draws: number
  losses: number
  gf: number
  gs: number
  diff: number
  pts: number
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('competitions')
    .select('name')
    .eq(isUuid(id) ? 'id' : 'slug', id)
    .maybeSingle()
  return { title: data?.name ?? 'Competizione' }
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const isAdmin = ctx.role === 'league_admin'
  const { id: ref } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('*')
    .eq(isUuid(ref) ? 'id' : 'slug', ref)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  if (!comp) notFound()
  const competition = comp as Competition
  // Downstream queries/links filter by the real UUID; the URL may carry a slug.
  const id = competition.id

  // All fantasy teams
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)

  const allTeams = (teams ?? []) as Pick<FantasyTeam, 'id' | 'name'>[]
  const teamNameMap = new Map(allTeams.map((t) => [t.id, t.name]))

  // ── Battle Royale: render dedicated hub view ──────────────────────────
  // BR uses competition_fixtures + standings_snapshots, not competition_matchups.
  // Render a focused view instead of falling through the Campionato logic.
  if (competition.type === 'battle_royale') {
    const { data: myTeamRow } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', ctx.league.id)
      .eq('manager_id', ctx.userId)
      .maybeSingle()

    return (
      <BattleRoyaleDetailView
        competition={competition}
        isAdmin={isAdmin}
        myTeamId={myTeamRow?.id ?? null}
        allTeams={allTeams}
      />
    )
  }

  // All matchups for this competition
  const { data: matchupsRaw } = await supabase
    .from('competition_matchups')
    .select('*')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const matchups = (matchupsRaw ?? []) as CompetitionMatchup[]

  // All competition rounds
  const { data: roundsRaw } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id, status')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const rounds = roundsRaw ?? []

  // Goal-converted scores per round/team-pair (from competition_fixtures)
  const { data: fixturesRaw } = await supabase
    .from('competition_fixtures')
    .select('round_id, home_team_id, away_team_id, home_score, away_score')
    .eq('competition_id', id)

  const roundIdToNumber = new Map(rounds.map((r) => [r.id as string, r.round_number as number]))
  // round_number → pair-key (sorted) → per-team-id goals
  const goalsByRound = new Map<number, Map<string, Map<string, number>>>()
  for (const f of fixturesRaw ?? []) {
    if (f.home_score == null || f.away_score == null) continue
    const rn = roundIdToNumber.get(f.round_id)
    if (rn == null) continue
    const pairKey = [f.home_team_id, f.away_team_id].sort().join('|')
    if (!goalsByRound.has(rn)) goalsByRound.set(rn, new Map())
    goalsByRound.get(rn)!.set(pairKey, new Map([
      [f.home_team_id, f.home_score],
      [f.away_team_id, f.away_score],
    ]))
  }
  const lookupGoals = (roundNumber: number, homeTeamId: string, awayTeamId: string) => {
    const pairKey = [homeTeamId, awayTeamId].sort().join('|')
    const byTeam = goalsByRound.get(roundNumber)?.get(pairKey)
    return {
      homeGoals: byTeam?.get(homeTeamId) ?? null,
      awayGoals: byTeam?.get(awayTeamId) ?? null,
    }
  }

  // Matchday statuses + round_number info for rounds with linked matchdays
  const matchdayIds = rounds
    .map((r) => r.matchday_id)
    .filter((mid): mid is string => mid !== null)

  const matchdayStatusMap = new Map<string, string>()
  const matchdayRoundNumberMap = new Map<string, number>()  // matchday_id → round_number
  if (matchdayIds.length > 0) {
    const { data: matchdaysData } = await supabase
      .from('matchdays')
      .select('id, status, round_number')
      .in('id', matchdayIds)
    for (const md of matchdaysData ?? []) {
      matchdayStatusMap.set(md.id, md.status)
    }
    for (const r of rounds) {
      if (r.matchday_id) matchdayRoundNumberMap.set(r.matchday_id, r.round_number as number)
    }
  }

  // Build round info map: round_number → { name, matchday_id, status }
  const roundInfoMap = new Map(
    rounds.map((r) => [
      r.round_number as number,
      {
        name: r.name as string,
        matchday_id: r.matchday_id as string | null,
        status: r.status as string,
      },
    ])
  )

  // ── Standings from published matchups ───────────────────────────────────────
  const standingMap = new Map<string, StandingRow>()
  for (const team of allTeams) {
    standingMap.set(team.id, {
      team_id: team.id, team_name: team.name,
      played: 0, wins: 0, draws: 0, losses: 0, gf: 0, gs: 0, diff: 0, pts: 0,
    })
  }
  for (const m of matchups) {
    if (m.result === null || m.home_fantavoto === null || m.away_fantavoto === null) continue
    const home = standingMap.get(m.home_team_id)
    const away = standingMap.get(m.away_team_id)
    const homeFv = Number(m.home_fantavoto)
    const awayFv = Number(m.away_fantavoto)
    if (home) { home.played++; home.gf += homeFv; home.gs += awayFv }
    if (away) { away.played++; away.gf += awayFv; away.gs += homeFv }
    if (m.result === '1') {
      if (home) { home.wins++; home.pts += 3 }
      if (away) away.losses++
    } else if (m.result === 'X') {
      if (home) { home.draws++; home.pts += 1 }
      if (away) { away.draws++; away.pts += 1 }
    } else if (m.result === '2') {
      if (home) home.losses++
      if (away) { away.wins++; away.pts += 3 }
    }
  }
  const standings: StandingRow[] = Array.from(standingMap.values())
    .map((r) => ({ ...r, diff: Math.round((r.gf - r.gs) * 100) / 100 }))
    .sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : b.diff - a.diff)

  // My team
  const { data: myTeamRow } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .maybeSingle()
  const myTeamId = myTeamRow?.id ?? null

  // Group matchups by round_number
  const matchupsByRound = new Map<number, CompetitionMatchup[]>()
  for (const m of matchups) {
    if (!matchupsByRound.has(m.round_number)) matchupsByRound.set(m.round_number, [])
    matchupsByRound.get(m.round_number)!.push(m)
  }

  const roundNumbers = Array.from(
    new Set([...rounds.map((r) => r.round_number as number), ...matchupsByRound.keys()])
  ).sort((a, b) => a - b)

  // ── Determine "current" round ────────────────────────────────────────────────
  // Priority: round linked to most-active matchday > last computed round > last published > first round
  let currentRound: number = roundNumbers[0] ?? 1

  // Find round linked to the most active matchday
  const activeMatchdayRound = [...rounds]
    .filter((r) => r.matchday_id && matchdayStatusMap.has(r.matchday_id as string))
    .sort((a, b) => {
      const sa = MD_PRIORITY[matchdayStatusMap.get(a.matchday_id as string) ?? ''] ?? 9
      const sb = MD_PRIORITY[matchdayStatusMap.get(b.matchday_id as string) ?? ''] ?? 9
      if (sa !== sb) return sa - sb
      return (b.round_number as number) - (a.round_number as number)
    })[0]

  if (activeMatchdayRound) {
    currentRound = activeMatchdayRound.round_number as number
  } else {
    // Fallback: last round with a computed result
    const lastComputedRound = Math.max(
      0, ...matchups.filter((m) => m.result !== null).map((m) => m.round_number)
    )
    if (lastComputedRound > 0) {
      currentRound = lastComputedRound
    }
  }

  // ── Fetch partial scores for the current round's matchday ────────────────────
  const currentRoundInfo = roundInfoMap.get(currentRound)
  const currentMatchdayId = currentRoundInfo?.matchday_id ?? null

  const partialTeamScores = new Map<string, number>()
  let hasPartialData = false
  let isDraftScore = false

  if (currentMatchdayId) {
    const { data: currentPtr } = await supabase
      .from('matchday_current_calculation')
      .select('run_id')
      .eq('matchday_id', currentMatchdayId)
      .maybeSingle()

    let runId = currentPtr?.run_id ?? null
    if (!runId) {
      const { data: latestRun } = await supabase
        .from('calculation_runs')
        .select('id')
        .eq('matchday_id', currentMatchdayId)
        .order('run_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      runId = latestRun?.id ?? null
      isDraftScore = !!runId
    }

    if (runId) {
      hasPartialData = true
      const { data: calcs } = await supabase
        .from('player_calculations')
        .select('player_id, fantavoto')
        .eq('run_id', runId)
      const calcMap = new Map(
        (calcs ?? [])
          .filter((c) => c.fantavoto !== null)
          .map((c) => [c.player_id, c.fantavoto as number])
      )

      // Which teams are in the current round?
      const currentMatchups = matchupsByRound.get(currentRound) ?? []
      const activeTeamIds = [...new Set(currentMatchups.flatMap((m) => [m.home_team_id, m.away_team_id]))]

      const { data: pointers } = await supabase
        .from('lineup_current_pointers')
        .select('team_id, submission_id')
        .eq('matchday_id', currentMatchdayId)
        .in('team_id', activeTeamIds)

      const submissionIds = (pointers ?? []).map((p) => p.submission_id)
      if (submissionIds.length > 0) {
        const { data: subPlayers } = await supabase
          .from('lineup_submission_players')
          .select('submission_id, player_id')
          .in('submission_id', submissionIds)
          .eq('is_bench', false)

        const subTeamMap = new Map((pointers ?? []).map((p) => [p.submission_id, p.team_id]))
        for (const sp of subPlayers ?? []) {
          const teamId = subTeamMap.get(sp.submission_id)
          if (!teamId) continue
          const fv = calcMap.get(sp.player_id)
          if (fv !== undefined) {
            partialTeamScores.set(teamId, (partialTeamScores.get(teamId) ?? 0) + fv)
          }
        }
      }
    }
  }

  // ── Build RoundData array for CalendarioClient ───────────────────────────────
  const roundDataList: RoundData[] = roundNumbers.map((roundNum) => {
    const rMatchups = matchupsByRound.get(roundNum) ?? []
    const rInfo = roundInfoMap.get(roundNum)
    const rMatchdayId = rInfo?.matchday_id ?? null
    const rMatchdayStatus = rMatchdayId ? (matchdayStatusMap.get(rMatchdayId) ?? null) : null
    const isCurrentRound = roundNum === currentRound

    const matchupDataList: MatchupData[] = rMatchups.map((m) => {
      const goals = lookupGoals(roundNum, m.home_team_id, m.away_team_id)
      return {
        id: m.id,
        homeTeamId: m.home_team_id,
        homeTeamName: teamNameMap.get(m.home_team_id) ?? '—',
        awayTeamId: m.away_team_id,
        awayTeamName: teamNameMap.get(m.away_team_id) ?? '—',
        result: m.result as '1' | 'X' | '2' | null,
        homeGoals: goals.homeGoals,
        awayGoals: goals.awayGoals,
        publishedHomeScore: m.home_fantavoto !== null ? Number(m.home_fantavoto) : null,
        publishedAwayScore: m.away_fantavoto !== null ? Number(m.away_fantavoto) : null,
        partialHomeScore: isCurrentRound && hasPartialData
          ? (partialTeamScores.has(m.home_team_id) ? +(partialTeamScores.get(m.home_team_id)!.toFixed(1)) : null)
          : null,
        partialAwayScore: isCurrentRound && hasPartialData
          ? (partialTeamScores.has(m.away_team_id) ? +(partialTeamScores.get(m.away_team_id)!.toFixed(1)) : null)
          : null,
        isDraftScore,
        matchdayId: rMatchdayId,
      }
    })

    return {
      roundNumber: roundNum,
      roundName: rInfo?.name ?? `Giornata ${roundNum}`,
      matchdayId: rMatchdayId,
      matchdayStatus: rMatchdayStatus,
      isCurrentRound,
      matchups: matchupDataList,
    }
  })

  // Current round data for the hero section at top
  const currentRoundData = roundDataList.find((r) => r.isCurrentRound) ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1
              className="flex items-baseline gap-2 font-light tracking-tight text-ink-1"
              style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
            >
              <span className="font-semibold">{competition.name}</span>
              <span className="serif font-normal text-ink-3">— {TYPE_LABEL[competition.type] ?? competition.type}</span>
            </h1>
            <div className="flex items-center gap-2">
              {competition.season && <Badge variant="muted">{competition.season}</Badge>}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLOR[competition.status] ?? ''}`}>
                {STATUS_LABEL[competition.status] ?? competition.status}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/competitions/${id}/rounds`}
              className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-4 hover:bg-glass-2 hover:text-ink-1 transition-colors"
            >
              Gestisci turni →
            </a>
            {competition.type === 'campionato' && competition.status === 'active' && (
              <GenerateMatchdaysForm
                competitionId={id}
                linkedCount={rounds.filter((r) => r.matchday_id !== null).length}
                totalRounds={rounds.length}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Quick links: sections that used to live in the top sidebar ───── */}
      {competition.type === 'campionato' && (
        <nav className="flex flex-wrap items-center gap-2 -mt-2">
          <a
            href="/campionato/giornate"
            className="rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
          >
            Giornate
          </a>
          {isAdmin && (
            <a
              href="/campionato/giocatori"
              className="rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
            >
              Giocatori
            </a>
          )}
          <a
            href={`/competitions/${id}/teams`}
            className="rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
          >
            Squadre
          </a>
          <a
            href={`/competitions/${id}/standings`}
            className="rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
          >
            Classifica
          </a>
          {isAdmin && (
            <a
              href="/competitions"
              className="ml-auto text-[11.5px] text-ink-4 transition-colors hover:text-ink-1"
            >
              Tutte le competizioni →
            </a>
          )}
        </nav>
      )}

      {/* ── Giornata corrente — hero matchup block ──────────────────────────── */}
      {currentRoundData && currentRoundData.matchups.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-baseline gap-3 flex-wrap min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-indigo-400/70">
                Giornata corrente
              </span>
              <span className="text-sm font-medium text-ink-1 truncate">{currentRoundData.roundName}</span>
              {currentRoundData.matchdayStatus && (
                <MatchdayStatusBadge status={currentRoundData.matchdayStatus} />
              )}
            </div>
            {currentRoundData.matchdayId && (
              <div className="flex items-center gap-2 shrink-0">
                <QuickFetchAndCalculateButton matchdayId={currentRoundData.matchdayId} compact />
                <a
                  href={`/campionato/giornate/${currentRoundData.matchdayId}/all-lineups`}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Formazioni →
                </a>
              </div>
            )}
          </div>

          <div className="h-px bg-glass-1" />

          {/* Matchup rows */}
          <div>
            {currentRoundData.matchups.map((m, idx) => {
              const isHomeMyTeam = m.homeTeamId === myTeamId
              const isAwayMyTeam = m.awayTeamId === myTeamId
              const hasPublished = m.result !== null
              const hasGoals = hasPublished && m.homeGoals !== null && m.awayGoals !== null
              const hasPartial = !hasPublished && (m.partialHomeScore !== null || m.partialAwayScore !== null)

              const homeWins = hasGoals
                ? (m.homeGoals as number) > (m.awayGoals as number)
                : hasPublished
                ? m.publishedHomeScore !== null && m.publishedAwayScore !== null && m.publishedHomeScore > m.publishedAwayScore
                : hasPartial
                ? m.partialHomeScore !== null && m.partialAwayScore !== null && m.partialHomeScore > m.partialAwayScore
                : false
              const awayWins = hasGoals
                ? (m.awayGoals as number) > (m.homeGoals as number)
                : hasPublished
                ? m.publishedHomeScore !== null && m.publishedAwayScore !== null && m.publishedAwayScore > m.publishedHomeScore
                : hasPartial
                ? m.partialHomeScore !== null && m.partialAwayScore !== null && m.partialAwayScore > m.partialHomeScore
                : false

              const homeTone =
                awayWins ? 'text-ink-5' : isHomeMyTeam ? 'text-indigo-200' : 'text-ink-1'
              const awayTone =
                homeWins ? 'text-ink-5' : isAwayMyTeam ? 'text-indigo-200' : 'text-ink-1'
              const homeNum = awayWins ? 'text-ink-5' : 'text-ink-1'
              const awayNum = homeWins ? 'text-ink-5' : 'text-ink-1'

              const href = m.matchdayId
                ? `/campionato/giornate/${m.matchdayId}/all-lineups`
                : `/competitions/${id}/match/${m.id}`

              return (
                <a
                  key={m.id}
                  href={href}
                  className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 hover:bg-glass-1 transition-colors ${
                    idx === currentRoundData.matchups.length - 1 ? '' : 'border-b border-hairline'
                  }`}
                >
                  <span className={`truncate text-right text-[14px] font-medium tracking-tight ${homeTone}`}>
                    {m.homeTeamName}
                  </span>

                  <div className="flex flex-col items-center min-w-[6rem] tabular-nums">
                    {hasGoals ? (
                      <>
                        <div className="flex items-baseline">
                          <span className={`w-7 text-right text-2xl font-light leading-none ${homeNum}`}>{m.homeGoals}</span>
                          <span className="px-2 text-xl font-thin text-ink-5 leading-none select-none">–</span>
                          <span className={`w-7 text-left text-2xl font-light leading-none ${awayNum}`}>{m.awayGoals}</span>
                        </div>
                        {m.publishedHomeScore !== null && m.publishedAwayScore !== null && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-4">
                            <span>{m.publishedHomeScore.toFixed(1)}</span>
                            <span className="text-ink-5">–</span>
                            <span>{m.publishedAwayScore.toFixed(1)}</span>
                          </div>
                        )}
                      </>
                    ) : hasPublished ? (
                      <div className="flex items-baseline">
                        <span className={`w-10 text-right text-[15px] font-medium ${homeNum}`}>
                          {m.publishedHomeScore !== null ? m.publishedHomeScore.toFixed(1) : '—'}
                        </span>
                        <span className="px-1.5 text-sm font-thin text-ink-5">–</span>
                        <span className={`w-10 text-left text-[15px] font-medium ${awayNum}`}>
                          {m.publishedAwayScore !== null ? m.publishedAwayScore.toFixed(1) : '—'}
                        </span>
                      </div>
                    ) : hasPartial ? (
                      <div className="flex items-baseline">
                        <span className={`w-10 text-right text-[15px] font-medium ${homeNum}`}>
                          {m.partialHomeScore !== null ? m.partialHomeScore.toFixed(1) : '—'}
                        </span>
                        <span className="px-1.5 text-sm font-thin text-ink-5">–</span>
                        <span className={`w-10 text-left text-[15px] font-medium ${awayNum}`}>
                          {m.partialAwayScore !== null ? m.partialAwayScore.toFixed(1) : '—'}
                        </span>
                        {m.isDraftScore && <span className="ml-1 text-[9px] text-amber-500/50">~</span>}
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-ink-5">vs</span>
                    )}
                  </div>

                  <span className={`truncate text-left text-[14px] font-medium tracking-tight ${awayTone}`}>
                    {m.awayTeamName}
                  </span>
                </a>
              )
            })}
          </div>

          {/* Draft footnote */}
          {isDraftScore && hasPartialData && currentRoundData.matchups.some((m) => m.result === null) && (
            <div className="border-t border-hairline px-5 py-2.5">
              <p className="text-[10px] text-amber-500/50">
                ~ punteggi parziali (calcolo non ancora pubblicato)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Classifica — WIP ────────────────────────────────────────────────── */}
      <div id="classifica" className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hairline">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Classifica</p>
          <p className="text-sm font-semibold text-ink-1 leading-tight mt-0.5">{comp.name}</p>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-medium text-ink-4">Work in progress</p>
          <p className="mt-1 text-[11px] text-ink-5">La classifica sarà disponibile prossimamente.</p>
        </div>
      </div>

      {/* ── Calendario — client-side dropdown ───────────────────────────────── */}
      <div id="calendario">
        <h2 className="eyebrow mb-3" style={{ fontSize: 11 }}>Calendario</h2>
        {roundDataList.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl px-6 py-12 text-center text-sm text-ink-4">
            Nessun turno generato per questa competizione.
          </div>
        ) : (
          <CalendarioClient
            rounds={roundDataList}
            defaultRound={currentRound}
            myTeamId={myTeamId}
            competitionId={id}
          />
        )}
      </div>
    </div>
  )
}

