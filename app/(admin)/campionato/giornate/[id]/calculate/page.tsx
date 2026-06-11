import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CalculationPreview } from './CalculationPreview'
import type { CalcPlayerRow, PlayerStatSnapshot } from './CalculationPreview'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Calcolo — ${data?.name ?? 'Giornata'}` }
}

export default async function CalculatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // All calculation runs, newest first
  const { data: runs } = await supabase
    .from('calculation_runs')
    .select('id, run_number, status, engine_version, triggered_at, published_at')
    .eq('matchday_id', matchdayId)
    .order('run_number', { ascending: false })

  // Official current pointer (only set on publish — this is the published run)
  const { data: currentPtr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  const publishedRunId = currentPtr?.run_id ?? null

  // Preview uses the LATEST run (draft or published), not the pointer.
  // This allows admins to see draft calculations before deciding to publish.
  const latestRun = runs?.[0] ?? null
  const previewRunId = latestRun?.id ?? null
  const previewRunStatus = latestRun?.status ?? null

  // Fetch player_calculations for the preview run
  let previewCalcs: CalcPlayerRow[] = []

  if (previewRunId) {
    const { data: calcs } = await supabase
      .from('player_calculations')
      .select(`
        id,
        player_id,
        is_provisional,
        voto_base,
        bonus_malus_breakdown,
        total_bonus_malus,
        raw_subtotal,
        ownership_pct,
        mvp_bonus_pct,
        mvp_bonus_amount,
        popularity_penalty_pct,
        popularity_penalty_amount,
        fantavoto,
        is_override,
        league_players ( full_name, club, rating_class )
      `)
      .eq('run_id', previewRunId)
      .order('fantavoto', { ascending: false, nullsFirst: false })

    // Augment each calc row with rating + minutes + is_mvp from player_match_stats.
    const playerIds = (calcs ?? []).map((c) => c.player_id)
    const { data: statsForCalcs } = playerIds.length > 0
      ? await supabase
          .from('player_match_stats')
          .select('player_id, rating, minutes_played, is_mvp')
          .eq('matchday_id', matchdayId)
          .in('player_id', playerIds)
      : { data: [] }

    const statsByPlayerId = new Map<string, { rating: number | null; minutes_played: number; is_mvp: boolean }>()
    for (const s of statsForCalcs ?? []) {
      statsByPlayerId.set(s.player_id, {
        rating: s.rating,
        minutes_played: s.minutes_played ?? 0,
        is_mvp: s.is_mvp ?? false,
      })
    }

    previewCalcs = (calcs ?? []).map((c) => {
      const st = statsByPlayerId.get(c.player_id)
      return {
        ...c,
        rating: st?.rating ?? null,
        minutes_played: st?.minutes_played ?? 0,
        is_mvp: st?.is_mvp ?? false,
      }
    }) as unknown as CalcPlayerRow[]
  }

  // Fetch existing player stats for the inline edit modal
  const { data: rawStats } = await supabase
    .from('player_match_stats')
    .select('player_id, minutes_played, goals_scored, assists, own_goals, yellow_cards, red_cards, goals_conceded, penalties_scored, penalties_missed, penalties_saved, clean_sheet, is_provisional')
    .eq('matchday_id', matchdayId)

  const playerStats: Record<string, PlayerStatSnapshot> = {}
  for (const s of rawStats ?? []) {
    playerStats[s.player_id] = {
      minutes_played: s.minutes_played ?? 0,
      goals_scored: s.goals_scored ?? 0,
      assists: s.assists ?? 0,
      own_goals: s.own_goals ?? 0,
      yellow_cards: s.yellow_cards ?? 0,
      red_cards: s.red_cards ?? 0,
      goals_conceded: s.goals_conceded ?? 0,
      penalties_scored: s.penalties_scored ?? 0,
      penalties_missed: s.penalties_missed ?? 0,
      penalties_saved: s.penalties_saved ?? 0,
      clean_sheet: s.clean_sheet ?? false,
      is_provisional: s.is_provisional ?? false,
    }
  }

  // Stats readiness indicators
  const { count: statsCount } = await supabase
    .from('player_match_stats')
    .select('id', { count: 'exact', head: true })
    .eq('matchday_id', matchdayId)

  const { count: provisionalCount } = await supabase
    .from('player_match_stats')
    .select('id', { count: 'exact', head: true })
    .eq('matchday_id', matchdayId)
    .eq('is_provisional', true)

  // Stale-output checks: detect changes made after the last published run.
  // Only evaluated when a published run exists and matchday is still 'published'
  // (archived is terminal; scoring has no stable reference point to compare against).
  // All timestamps compared are server-set and cannot be spoofed by application code.
  let hasStaleOverrides = false
  let hasStaleStats = false

  if (['closed', 'published'].includes(matchday.status) && publishedRunId) {
    const publishedRun = (runs ?? []).find((r) => r.id === publishedRunId)
    const publishedAt = publishedRun?.published_at ?? null

    if (publishedAt) {
      // Override staleness: any score_override created or removed after last publish.
      const { count: staleOverrideCount } = await supabase
        .from('score_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('matchday_id', matchdayId)
        .or(`created_at.gt.${publishedAt},removed_at.gt.${publishedAt}`)
      hasStaleOverrides = (staleOverrideCount ?? 0) > 0

      // Stats staleness: any player_match_stats row updated after last publish.
      // updated_at is maintained by a BEFORE UPDATE DB trigger — reliable server timestamp.
      const { count: staleStatsCount } = await supabase
        .from('player_match_stats')
        .select('id', { count: 'exact', head: true })
        .eq('matchday_id', matchdayId)
        .gt('updated_at', publishedAt)
      hasStaleStats = (staleStatsCount ?? 0) > 0
    }
  }

  // Trigger is allowed in any status except draft (no data yet) and archived (terminal).
  const canTrigger = !['draft', 'archived'].includes(matchday.status)
  // Publishing writes scores to DB — allowed whenever trigger is allowed and there is a draft run.
  // Does NOT change matchday status — that is managed separately via the status toggle.
  const canPublish = previewRunId !== null && previewRunStatus !== 'published' && !['draft', 'archived'].includes(matchday.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <a
            href={`/campionato/giornate/${matchdayId}`}
            className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300"
          >
            ← {matchday.name}
          </a>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1
              className="flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
              style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
            >
              <span className="font-semibold">Calcolo</span>
              <span className="serif font-normal text-ink-3">— punteggi</span>
            </h1>
            <Badge variant={['closed', 'published'].includes(matchday.status) ? 'success' : 'muted'}>
              {matchday.status}
            </Badge>
          </div>
        </div>

        {/* Stats readiness panel */}
        <div className="rounded-2xl border border-hairline bg-glass-1 p-4 text-sm min-w-[200px] backdrop-blur-xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">
            Statistiche
          </p>
          <div className="space-y-1">
            <div className="flex justify-between gap-6">
              <span className="text-ink-3">Inserite</span>
              <span className="font-mono text-ink-1">{statsCount ?? 0}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-ink-3">Provvisorie</span>
              <span className={`font-mono ${(provisionalCount ?? 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {provisionalCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {hasStaleOverrides && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <span className="mr-1.5 font-semibold">⚠ Punteggi non aggiornati.</span>
          Sono state apportate modifiche agli override dopo l&apos;ultima pubblicazione — esegui un nuovo calcolo e pubblica per aggiornare i punteggi e le classifiche di competizione.
        </div>
      )}

      {hasStaleStats && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <span className="mr-1.5 font-semibold">⚠ Statistiche modificate.</span>
          Una o più statistiche sono state aggiornate dopo l&apos;ultima pubblicazione — esegui un nuovo calcolo e pubblica per aggiornare i punteggi e le classifiche di competizione.
        </div>
      )}

      {!canTrigger && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          {matchday.status === 'draft'
            ? 'La giornata è in programma — passa ad "aperta" prima di calcolare i punteggi.'
            : 'Non è possibile calcolare una giornata archiviata.'}
        </div>
      )}

      {/* Run history */}
      {runs && runs.length > 0 && (
        <Card>
          <CardHeader title="Storico run" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-4">
                  <th className="px-6 py-2.5">Run</th>
                  <th className="px-6 py-2.5">Engine</th>
                  <th className="px-6 py-2.5">Stato</th>
                  <th className="px-6 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className={[
                      r.id === previewRunId ? 'bg-indigo-500/5' : '',
                    ].join('')}
                  >
                    <td className="px-6 py-2.5 font-mono text-ink-1">
                      #{r.run_number}
                      {r.id === previewRunId && (
                        <span className="ml-2 text-xs text-indigo-400">anteprima</span>
                      )}
                      {r.id === publishedRunId && r.id !== previewRunId && (
                        <span className="ml-2 text-xs text-green-400">pubblicato</span>
                      )}
                      {r.id === publishedRunId && r.id === previewRunId && (
                        <span className="ml-2 text-xs text-green-400">pubblicato · anteprima</span>
                      )}
                    </td>
                    <td className="px-6 py-2.5 text-ink-3">{r.engine_version}</td>
                    <td className="px-6 py-2.5">
                      <Badge
                        variant={
                          r.status === 'published' ? 'success'
                          : r.status === 'draft' ? 'muted'
                          : 'warning'
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-2.5 text-ink-4">
                      {new Intl.DateTimeFormat('it-IT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(r.triggered_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Preview / action panel */}
      <CalculationPreview
        matchdayId={matchdayId}
        matchdayStatus={matchday.status}
        currentRunId={previewRunId}
        currentRunStatus={previewRunStatus}
        calcs={previewCalcs}
        canTrigger={canTrigger}
        canPublish={canPublish}
        playerStats={playerStats}
      />
    </div>
  )
}
