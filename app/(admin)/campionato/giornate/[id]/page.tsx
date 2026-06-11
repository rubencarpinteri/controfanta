import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import type { MatchdayFixture } from '@/types/database.types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MatchdayStatusControls } from './MatchdayStatusControls'
import { FreezeButton } from './FreezeButton'
import { FixturesInlineCard } from './FixturesInlineCard'
import { QuickFetchAndCalculateButton } from '@/app/(admin)/campionato/giornate/[id]/calculate/QuickFetchAndCalculateButton'
import { getMatchesForRound } from '@/lib/calendar/serieaCalendar'
import type { JoinedCompetitionNameType } from '@/lib/supabase/relations'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Giornata' }
}

export default async function MatchdayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id } = await params
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('*')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  const { data: statusLog } = await supabase
    .from('matchday_status_log')
    .select('*, profiles(username)')
    .eq('matchday_id', id)
    .order('changed_at', { ascending: false })
    .limit(10)

  // Fixtures — always fetch for admin
  let fixtures: MatchdayFixture[] = []
  if (isAdmin) {
    const { data: fx } = await supabase
      .from('matchday_fixtures')
      .select('*')
      .eq('matchday_id', id)
      .order('created_at', { ascending: true })
    fixtures = (fx ?? []) as MatchdayFixture[]
  }

  // Round matches from CSV — used to show guide in step 1 and label buttons in step 2
  const roundMatches = isAdmin && matchday.matchday_number
    ? getMatchesForRound(matchday.matchday_number)
    : []

  // Published results — only fetch when needed
  type PublishedScore = {
    team_id: string; total_fantavoto: number; player_count: number; nv_count: number; published_at: string
  }
  let publishedScores: PublishedScore[] = []
  let teamNameMap = new Map<string, string>()
  let publishedRunNumber: number | null = null
  let publishedAt: string | null = null
  type LinkedRound = { id: string; name: string; round_number: number; status: string; competition_id: string; competition_name: string; competition_type: string }
  let linkedRounds: LinkedRound[] = []
  type H2HFixture = {
    home_team_id: string
    away_team_id: string
    home_team_name: string
    away_team_name: string
    home_score: number | null
    away_score: number | null
    home_fantavoto: number | null
    away_fantavoto: number | null
    competition_name: string
  }
  let headToHead: H2HFixture[] = []

  if (isAdmin && ['closed', 'archived'].includes(matchday.status)) {
    const { data: scores } = await supabase
      .from('published_team_scores')
      .select('team_id, total_fantavoto, player_count, nv_count, published_at')
      .eq('matchday_id', id)
      .order('total_fantavoto', { ascending: false })

    publishedScores = (scores ?? []) as PublishedScore[]

    if (publishedScores.length > 0) {
      const teamIds = publishedScores.map((s) => s.team_id)
      const { data: teams } = await supabase
        .from('fantasy_teams')
        .select('id, name')
        .in('id', teamIds)
      teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))
      // Use published_at from first row (all rows same publish event via upsert)
      publishedAt = publishedScores[0]?.published_at ?? null
    }

    // Current run number
    const { data: ptr } = await supabase
      .from('matchday_current_calculation')
      .select('run_id')
      .eq('matchday_id', id)
      .maybeSingle()

    if (ptr?.run_id) {
      const { data: run } = await supabase
        .from('calculation_runs')
        .select('run_number')
        .eq('id', ptr.run_id)
        .single()
      publishedRunNumber = run?.run_number ?? null
    }

    // Linked competition rounds
    const { data: rounds } = await supabase
      .from('competition_rounds')
      .select('id, name, round_number, status, competition_id, competitions(id, name, type)')
      .eq('matchday_id', id)

    linkedRounds = (rounds ?? []).map((r) => {
      const comp = r.competitions as unknown as JoinedCompetitionNameType | null
      return {
        id: r.id,
        name: r.name,
        round_number: r.round_number,
        status: r.status,
        competition_id: r.competition_id,
        competition_name: comp?.name ?? '—',
        competition_type: comp?.type ?? '',
      }
    })

    // Head-to-head fixtures — prefer Campionato, fall back to first computed round
    const campionatoRound = linkedRounds.find((r) => r.competition_type === 'campionato' && r.status === 'computed')
    const h2hRound = campionatoRound ?? linkedRounds.find((r) => r.status === 'computed') ?? null

    if (h2hRound) {
      const { data: fixtures } = await supabase
        .from('competition_fixtures')
        .select('home_team_id, away_team_id, home_score, away_score, home_fantavoto, away_fantavoto')
        .eq('round_id', h2hRound.id)

      const fxRows = fixtures ?? []
      // Make sure team names exist for any team referenced by fixtures (might
      // include teams without published_team_scores rows in edge cases)
      const fxTeamIds = new Set<string>()
      for (const f of fxRows) { fxTeamIds.add(f.home_team_id); fxTeamIds.add(f.away_team_id) }
      const missingIds = [...fxTeamIds].filter((tid) => !teamNameMap.has(tid))
      if (missingIds.length > 0) {
        const { data: extraTeams } = await supabase
          .from('fantasy_teams')
          .select('id, name')
          .in('id', missingIds)
        for (const t of extraTeams ?? []) teamNameMap.set(t.id, t.name)
      }

      headToHead = fxRows.map((f) => ({
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        home_team_name: teamNameMap.get(f.home_team_id) ?? '—',
        away_team_name: teamNameMap.get(f.away_team_id) ?? '—',
        home_score: f.home_score,
        away_score: f.away_score,
        home_fantavoto: f.home_fantavoto,
        away_fantavoto: f.away_fantavoto,
        competition_name: h2hRound.competition_name,
      }))
    }
  }

  // ── Count existing lineup submissions (to show all-lineups hero card) ────
  const { count: lineupCount } = await supabase
    .from('lineup_current_pointers')
    .select('id', { count: 'exact', head: true })
    .eq('matchday_id', id)

  // ── Admin workflow step status ────────────────────────────────────────────
  let playerStatsCount = 0
  let v1RunId: string | null = null
  let v1RunNumber: number | null = null
  let publishedRunEngine: string | null = null

  if (isAdmin) {
    const [statsRes, v1Res] = await Promise.all([
      supabase.from('player_match_stats').select('id', { count: 'exact', head: true }).eq('matchday_id', id),
      supabase.from('calculation_runs').select('id, run_number').eq('matchday_id', id).eq('engine_version', 'v1').order('run_number', { ascending: false }).limit(1).maybeSingle(),
    ])
    playerStatsCount = statsRes.count ?? 0
    v1RunId = v1Res.data?.id ?? null
    v1RunNumber = v1Res.data?.run_number ?? null

    // Check if published_team_scores points to a v1 run
    if (matchday.status === 'closed' || matchday.status === 'archived') {
      const { data: pts } = await supabase
        .from('published_team_scores')
        .select('run_id')
        .eq('matchday_id', id)
        .limit(1)
        .maybeSingle()
      if (pts?.run_id) {
        const { data: run } = await supabase
          .from('calculation_runs')
          .select('engine_version')
          .eq('id', pts.run_id)
          .single()
        publishedRunEngine = run?.engine_version ?? null
      }
    }
  }

  // If manager: fetch their team's current submission status
  let mySubmission: { status: string; submission_number: number } | null = null
  if (!isAdmin) {
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', ctx.league.id)
      .eq('manager_id', ctx.userId)
      .single()

    if (team) {
      const { data: pointer } = await supabase
        .from('lineup_current_pointers')
        .select('submission_id, lineup_submissions(status, submission_number)')
        .eq('team_id', team.id)
        .eq('matchday_id', id)
        .single()

      if (pointer?.lineup_submissions) {
        const sub = pointer.lineup_submissions as unknown as {
          status: string
          submission_number: number
        }
        mySubmission = sub
      }
    }
  }

  const fmt = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <a href="/campionato/giornate" className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
            ← Giornate
          </a>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1
              className="flex items-baseline gap-2 font-light tracking-tight text-ink-1"
              style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
            >
              <span className="font-semibold">{matchday.name}</span>
              {matchday.matchday_number && (
                <span className="serif font-normal text-ink-3">— giornata {matchday.matchday_number}</span>
              )}
            </h1>
            <div className="flex items-center gap-2">
              <MatchdayStatusBadge status={matchday.status} />
              {matchday.is_frozen && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Congelata
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">

        {/* ── ADMIN WORKFLOW ── */}
        {isAdmin && (() => {
          const step1Done = fixtures.length >= 10
          const step2Done = playerStatsCount > 0
          const step3Done = v1RunId !== null
          const step4Done = (matchday.status === 'closed' || matchday.status === 'archived') && publishedRunEngine === 'v1'

          const StepIcon = ({ done, active }: { done: boolean; active: boolean }) => (
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              done   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              active ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' :
                       'bg-glass-2 text-ink-4 border border-hairline'
            }`}>
              {done ? '✓' : active ? '→' : '○'}
            </div>
          )

          return (
            <div className="space-y-2">

              {/* Step 1 — Configura partite */}
              <div className="rounded-xl border border-hairline bg-glass-1 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <StepIcon done={step1Done} active={!step1Done} />
                  <p className={`text-sm font-semibold ${step1Done ? 'text-ink-1' : 'text-indigo-300'}`}>
                    1 — Configura partite
                  </p>
                </div>
                <FixturesInlineCard matchdayId={id} fixtures={fixtures} roundMatches={roundMatches} />
                <div className="mt-3 pt-3 border-t border-hairline">
                  <a
                    href={`/campionato/giornate/${id}/prezzi`}
                    className="inline-flex items-center gap-2 text-xs text-indigo-300 hover:text-indigo-200"
                  >
                    Carica prezzi giornata (CSV) →
                  </a>
                </div>
              </div>

              {/* Step 2 — Scarica voti, calcola e pubblica */}
              <div className={`rounded-xl border p-4 ${step1Done ? 'border-amber-500/20 bg-amber-500/5' : 'border-hairline bg-transparent opacity-50 pointer-events-none'}`}>
                <div className="mb-3 flex items-center gap-3">
                  <StepIcon done={step2Done} active={step1Done} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step2Done ? 'text-ink-1' : step1Done ? 'text-indigo-300' : 'text-ink-4'}`}>
                      2 — Scarica voti, calcola e pubblica
                    </p>
                    {step2Done && (
                      <p className="text-xs text-ink-4">
                        {playerStatsCount} giocatori · Run #{v1RunNumber}
                        {' · '}
                        <a href={`/campionato/giornate/${id}/stats`} className="hover:text-indigo-400">statistiche</a>
                        {['open', 'closed'].includes(matchday.status) && (
                          <> · <a href={`/campionato/giornate/${id}/overrides`} className="hover:text-orange-400">override</a></>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                {step1Done && (
                  <QuickFetchAndCalculateButton matchdayId={id} />
                )}
              </div>

              {/* Step 3 — Formazioni */}
              <div className={`rounded-xl border p-4 ${step4Done ? 'border-hairline bg-transparent' : step3Done ? 'border-indigo-500/30 bg-glass-1' : 'border-hairline bg-transparent opacity-50'}`}>
                <div className="flex items-start gap-3">
                  <StepIcon done={step4Done} active={step3Done && !step4Done} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${step4Done ? 'text-ink-1' : step3Done ? 'text-indigo-300' : 'text-ink-4'}`}>
                      3 — Formazioni e pubblicazione
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`/campionato/giornate/${id}/import-lineups`}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          ['open', 'closed'].includes(matchday.status)
                            ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                            : 'pointer-events-none bg-glass-2 text-ink-5'
                        }`}
                      >
                        Importa formazioni (testo)
                      </a>
                      <a
                        href={`/campionato/giornate/${id}/import-leghe`}
                        className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium text-ink-4 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
                      >
                        {step4Done ? 'Ripubblica (Leghe)' : 'Importa Leghe (xlsx)'}
                      </a>
                      {(lineupCount ?? 0) > 0 && (
                        <a
                          href={`/campionato/giornate/${id}/all-lineups`}
                          className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-1.5 text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/10"
                        >
                          Vedi {lineupCount} formazioni →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin controls strip */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-xs text-ink-4">
                <MatchdayStatusControls matchday={matchday} />
                {['open', 'closed'].includes(matchday.status) && (
                  <FreezeButton matchdayId={matchday.id} isFrozen={matchday.is_frozen} />
                )}
                {matchday.opens_at && <span>Apertura: {fmt(matchday.opens_at)}</span>}
                {matchday.locks_at && <span>Scadenza: {fmt(matchday.locks_at)}</span>}
              </div>
            </div>
          )
        })()}

        {/* ── MANAGER VIEW ── */}
        {!isAdmin && (
          <Card>
            <CardHeader title="La tua formazione" />
            <CardContent>
              <div className="space-y-3">
                {mySubmission ? (
                  <div className="space-y-3">
                    <p className="text-sm text-ink-4">
                      Ultima versione: <span className="text-ink-1">#{mySubmission.submission_number}</span>
                      {' '}— Stato:{' '}
                      <span className={mySubmission.status === 'submitted' ? 'text-green-400' : 'text-amber-400'}>
                        {mySubmission.status === 'submitted' ? 'Inviata' : 'Bozza'}
                      </span>
                    </p>
                    {matchday.status === 'open' && (
                      <a href={`/campionato/giornate/${id}/lineup`} className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">
                        Modifica formazione
                      </a>
                    )}
                    <a href={`/campionato/giornate/${id}/lineup/history`} className="block text-sm text-indigo-400 hover:underline">
                      Storico invii →
                    </a>
                  </div>
                ) : matchday.status === 'open' ? (
                  <a href={`/campionato/giornate/${id}/lineup`} className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">
                    Inserisci formazione
                  </a>
                ) : (
                  <p className="text-sm text-ink-4">La giornata non è aperta per le formazioni.</p>
                )}
                {['closed', 'archived'].includes(matchday.status) && (
                  <div className="flex flex-col gap-1">
                    <a href={`/campionato/giornate/${id}/my-results`} className="text-sm text-indigo-400 hover:underline">I tuoi risultati →</a>
                    <a href={`/campionato/giornate/${id}/results`} className="text-sm text-ink-4 hover:text-indigo-400">Tutti i risultati →</a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Head-to-head fixtures (goal-converted from Campionato round) */}
      {isAdmin && headToHead.length > 0 && (
        <section className="pt-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-4">
              Testa a testa
            </h2>
            <span className="text-[11px] text-ink-5">{headToHead[0]?.competition_name ?? ''}</span>
          </div>
          <div className="space-y-1">
            {headToHead.map((m, i) => {
              const homeWins = m.home_score !== null && m.away_score !== null && m.home_score > m.away_score
              const awayWins = m.home_score !== null && m.away_score !== null && m.away_score > m.home_score
              const homeTone = awayWins ? 'text-ink-5' : 'text-ink-1'
              const awayTone = homeWins ? 'text-ink-5' : 'text-ink-1'
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3 px-1"
                >
                  <p className={`truncate text-right text-[15px] font-medium tracking-tight ${homeTone}`}>
                    {m.home_team_name}
                  </p>
                  <div className="flex flex-col items-center min-w-[5rem]">
                    <div className="flex items-baseline tabular-nums">
                      <span className={`w-7 text-right text-2xl font-light leading-none ${homeTone}`}>{m.home_score ?? '—'}</span>
                      <span className="px-2 text-xl font-thin text-ink-5 leading-none select-none">–</span>
                      <span className={`w-7 text-left text-2xl font-light leading-none ${awayTone}`}>{m.away_score ?? '—'}</span>
                    </div>
                    {m.home_fantavoto !== null && m.away_fantavoto !== null && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-4 tabular-nums">
                        <span>{Number(m.home_fantavoto).toFixed(1)}</span>
                        <span className="text-ink-5">–</span>
                        <span>{Number(m.away_fantavoto).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <p className={`truncate text-left text-[15px] font-medium tracking-tight ${awayTone}`}>
                    {m.away_team_name}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Published results — shown for admin when matchday is published or archived */}
      {isAdmin && publishedScores.length > 0 && (
        <Card>
          <CardHeader
            title="Risultati pubblicati"
            description={[
              publishedRunNumber !== null ? `Run #${publishedRunNumber}` : null,
              publishedAt
                ? `Pubblicato il ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(publishedAt))}`
                : null,
            ].filter(Boolean).join(' · ')}
            action={
              <div className="flex items-center gap-3">
                <a href={`/campionato/giornate/${id}/results`} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Dettaglio →
                </a>
                <a href={`/campionato/giornate/${id}/calculate`} className="text-xs text-ink-4 hover:text-indigo-300">
                  Calcolo →
                </a>
              </div>
            }
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Pos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Squadra</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Titolari</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">NV</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-4">Fantavoto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {publishedScores.map((s, idx) => (
                  <tr key={s.team_id} className="hover:bg-glass-1">
                    <td className="px-4 py-2.5">
                      <span className={`text-sm font-semibold ${
                        idx === 0 ? 'text-amber-400' : idx <= 2 ? 'text-indigo-300' : 'text-ink-4'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-1">
                      {teamNameMap.get(s.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-ink-4">{s.player_count}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={s.nv_count > 0 ? 'text-amber-400' : 'text-ink-4'}>
                        {s.nv_count}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-ink-1">
                      {Number(s.total_fantavoto).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Linked competition round outcomes */}
            {linkedRounds.length > 0 && (
              <div className="border-t border-hairline px-4 py-3 space-y-1">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">Competizioni collegate</p>
                {linkedRounds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-ink-4">
                      {r.competition_name} — {r.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-0.5 font-medium ${
                        r.status === 'computed' ? 'text-emerald-400 bg-emerald-500/10' :
                        r.status === 'locked'   ? 'text-indigo-300 bg-indigo-500/10' :
                                                  'text-ink-4 bg-glass-2'
                      }`}>
                        {r.status === 'computed' ? 'calcolato' : r.status === 'locked' ? 'bloccato' : 'in attesa'}
                      </span>
                      <a
                        href={`/competitions/${r.competition_id}/rounds/${r.round_number}`}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Dettaglio →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status log */}
      {isAdmin && statusLog && statusLog.length > 0 && (
        <Card>
          <CardHeader title="Storico stati" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                {statusLog.map((entry) => {
                  const actor = entry.profiles as unknown as { username: string } | null
                  return (
                    <tr key={entry.id} className="px-6 py-3">
                      <td className="px-6 py-2.5 text-ink-4 w-44">
                        {new Intl.DateTimeFormat('it-IT', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(entry.changed_at))}
                      </td>
                      <td className="px-6 py-2.5 text-ink-4">
                        {entry.old_status ?? '—'} → <span className="text-ink-1">{entry.new_status}</span>
                      </td>
                      <td className="px-6 py-2.5 text-ink-4">{actor?.username ?? '—'}</td>
                      <td className="px-6 py-2.5 text-ink-4 italic">{entry.note ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-4">{label}</dt>
      <dd className="text-ink-1">{value}</dd>
    </div>
  )
}
