import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { isUuid } from '@/lib/slug'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface TeamStandingRow {
  team_id: string
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  total_fantavoto: number
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('competitions')
    .select('name')
    .eq(isUuid(id) ? 'id' : 'slug', id)
    .maybeSingle()
  return { title: `Classifica — ${data?.name ?? 'Competizione'}` }
}

export default async function CompetitionStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: ref } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status, scoring_config')
    .eq(isUuid(ref) ? 'id' : 'slug', ref)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  if (!comp) notFound()
  const id = comp.id

  // Step 1: find the highest computed round for this competition
  const { data: latestComputedRound } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id')
    .eq('competition_id', id)
    .eq('status', 'computed')
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Step 2: fetch the latest snapshot version for that specific round
  const { data: latestSnapshot } = latestComputedRound
    ? await supabase
        .from('competition_standings_snapshots')
        .select('snapshot_json, after_round_id, version_number, created_at')
        .eq('competition_id', id)
        .eq('after_round_id', latestComputedRound.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // afterRound is already resolved from latestComputedRound — no extra query needed
  const afterRound = latestComputedRound ?? null

  // Stale check: if the matchday linked to the latest round is no longer published
  // or archived, the snapshot may be temporarily outdated (e.g. admin reverted the
  // matchday to 'scoring' to correct stats and has not yet re-published).
  // Silent when no snapshot, no round, or no linked matchday.
  let isStaleSnapshot = false
  if (afterRound?.matchday_id) {
    const { data: linkedMatchday } = await supabase
      .from('matchdays')
      .select('status')
      .eq('id', afterRound.matchday_id)
      .eq('league_id', ctx.league.id)
      .maybeSingle()
    isStaleSnapshot =
      linkedMatchday !== null &&
      !['published', 'archived'].includes(linkedMatchday.status)
  }

  const standingRows: TeamStandingRow[] = []
  if (latestSnapshot?.snapshot_json) {
    const json = latestSnapshot.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
    if (json.type === 'table' && Array.isArray(json.rows)) {
      standingRows.push(...json.rows)
    }
  }

  const teamIds = standingRows.map((r) => r.team_id)
  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  const sc = comp.scoring_config as { method?: string } | null
  const hasGoals = sc?.method !== 'direct_comparison'

  const TYPE_LABEL: Record<string, string> = {
    campionato: 'Campionato', battle_royale: 'Battle Royale', coppa: 'Coppa',
  }

  return (
    <div className="space-y-6">
      <div>
        <a
          href={ctx.role === 'league_admin' ? `/competitions/${id}` : '/standings'}
          className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300"
        >
          ← {ctx.role === 'league_admin' ? comp.name : 'Classifiche'}
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          <span className="font-semibold">Classifica</span>
          <span className="serif font-normal text-ink-3">— {TYPE_LABEL[comp.type] ?? comp.type}</span>
        </h1>
        {afterRound && (
          <p className="mt-1.5 text-[12.5px] text-ink-4">
            Aggiornata al turno {afterRound.round_number} ({afterRound.name})
          </p>
        )}
      </div>

      {isStaleSnapshot && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <span className="mr-1.5 font-semibold">⚠ Classifica provvisoria.</span>
          La classifica mostrata si basa sull&apos;ultimo snapshot disponibile, ma la giornata collegata al turno più recente non è ancora ripubblicata — i dati potrebbero essere temporaneamente non aggiornati.
        </div>
      )}

      {standingRows.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-ink-4">
              Nessun dato disponibile. Calcola almeno un turno per vedere la classifica.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`Classifica — ${standingRows.length} squadre`}
            description={latestSnapshot?.created_at
              ? `Aggiornata il ${new Date(latestSnapshot.created_at).toLocaleString('it-IT')}`
              : undefined}
            action={
              ctx.role === 'league_admin' ? (
                <a
                  href={`/competitions/${id}/rounds`}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Gestisci turni →
                </a>
              ) : undefined
            }
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  {[
                    'Pos', 'Squadra', 'G', 'V', 'N', 'P',
                    ...(hasGoals ? ['GF', 'GS', 'DR'] : []),
                    'Pt', 'FV',
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className={`px-4 py-2.5 text-xs font-medium text-ink-4 ${
                        i < 2 ? 'text-left' : 'text-center'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {standingRows.map((row, idx) => (
                  <tr key={row.team_id} className="hover:bg-glass-1">
                    <td className="w-12 px-4 py-3 text-left">
                      <span
                        className={`text-sm font-semibold ${
                          idx === 0
                            ? 'text-amber-400'
                            : idx <= 2
                              ? 'text-indigo-300'
                              : 'text-ink-4'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left font-medium text-ink-1">
                      {teamNameMap.get(row.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-4">{row.played}</td>
                    <td className="px-4 py-3 text-center text-ink-4">{row.wins}</td>
                    <td className="px-4 py-3 text-center text-ink-4">{row.draws}</td>
                    <td className="px-4 py-3 text-center text-ink-4">{row.losses}</td>
                    {hasGoals && (
                      <>
                        <td className="px-4 py-3 text-center text-ink-4">{row.goals_for}</td>
                        <td className="px-4 py-3 text-center text-ink-4">{row.goals_against}</td>
                        <td
                          className={`px-4 py-3 text-center ${
                            row.goal_difference > 0
                              ? 'text-emerald-400'
                              : row.goal_difference < 0
                                ? 'text-red-400'
                                : 'text-ink-4'
                          }`}
                        >
                          {row.goal_difference > 0 ? '+' : ''}
                          {row.goal_difference}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-center font-bold text-ink-1">{row.points}</td>
                    <td className="px-4 py-3 text-center text-ink-4">
                      {row.total_fantavoto.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="text-right">
        <a
          href={ctx.role === 'league_admin' ? `/competitions/${id}` : '/standings'}
          className="text-sm text-ink-4 hover:text-indigo-400"
        >
          {ctx.role === 'league_admin' ? '← Torna alla competizione' : '← Classifiche'}
        </a>
      </div>
    </div>
  )
}
