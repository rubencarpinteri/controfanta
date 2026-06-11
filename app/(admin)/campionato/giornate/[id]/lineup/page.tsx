import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { LineupBuilder } from './LineupBuilder'

export const metadata = { title: 'Inserisci Formazione' }

export default async function LineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ team?: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params
  const { team: requestedTeamId } = await searchParams
  const supabase = await createClient()

  // Validate matchday
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, locks_at, league_id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Admins can inspect lineups; managers can only edit when open
  if (ctx.role === 'manager' && matchday.status !== 'open') {
    redirect(`/campionato/giornate/${matchdayId}`)
  }

  // Resolve team
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .order('name')

  const team = requestedTeamId
    ? (teams ?? []).find(t => t.id === requestedTeamId) ?? teams?.[0] ?? null
    : teams?.[0] ?? null

  // For admins: allow picking any team
  // For now, always use the user's own team
  if (!team && ctx.role === 'manager') {
    return (
      <div className="py-12 text-center text-sm text-ink-4">
        Nessuna squadra trovata per il tuo account. Contatta l&apos;admin.
      </div>
    )
  }

  // Fetch active formations for this league
  const { data: formations } = await supabase
    .from('formations')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('name')

  if (!formations || formations.length === 0) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-amber-400">
          Nessuna formazione attiva configurata. L&apos;admin deve prima configurare le formazioni.
        </p>
      </div>
    )
  }

  // Fetch the team's current submission (if any) for pre-filling
  let currentSubmission: {
    formation_id: string
    submission_number: number
    status: string
    players: Array<{
      player_id: string
      slot_id: string
      is_bench: boolean
      bench_order: number | null
    }>
  } | null = null

  if (team) {
    const { data: pointer } = await supabase
      .from('lineup_current_pointers')
      .select('submission_id')
      .eq('team_id', team.id)
      .eq('matchday_id', matchdayId)
      .single()

    if (pointer) {
      const { data: sub } = await supabase
        .from('lineup_submissions')
        .select('id, formation_id, submission_number, status')
        .eq('id', pointer.submission_id)
        .single()

      if (sub) {
        const { data: subPlayers } = await supabase
          .from('lineup_submission_players')
          .select('player_id, slot_id, is_bench, bench_order')
          .eq('submission_id', sub.id)

        currentSubmission = {
          formation_id: sub.formation_id,
          submission_number: sub.submission_number,
          status: sub.status,
          players: subPlayers ?? [],
        }
      }
    }
  }

  // Phase 2 — the full active league pool is the picker source. The team
  // no longer "owns" a permanent squad; every matchday the user drafts
  // fresh from the entire active pool, constrained by the budget.
  const { data: allPlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, mantra_roles, primary_mantra_role, rating_class')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('full_name')

  const poolPlayers = allPlayers ?? []

  // Fetch prices for this matchday + the league's weekly budget.
  const { data: priceRows } = await supabase
    .from('matchday_player_prices')
    .select('player_id, price')
    .eq('matchday_id', matchdayId)

  const priceByPlayerId: Record<string, number> = {}
  for (const r of priceRows ?? []) priceByPlayerId[r.player_id] = r.price

  const weeklyBudget = ctx.league.weekly_budget
  const pricedCount = priceRows?.length ?? 0
  const poolSize = poolPlayers.length
  const pricesReady = poolSize > 0 && pricedCount >= poolSize * 0.95 // 95% coverage = usable

  return (
    <div className="space-y-4">
      <div>
        <a href={`/campionato/giornate/${matchdayId}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {matchday.name}
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          {ctx.role === 'manager' ? (
            <>
              <span className="font-semibold">Formazione</span>
              <span className="serif font-normal text-ink-3">— la tua</span>
            </>
          ) : (
            <>
              <span className="font-semibold">Formazione</span>
              <span className="serif font-normal text-ink-3">— {team?.name ?? ''}</span>
            </>
          )}
        </h1>
        {/* Team switcher — shown when user manages multiple teams */}
        {(teams ?? []).length > 1 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {(teams ?? []).map(t => (
              <a
                key={t.id}
                href={`/campionato/giornate/${matchdayId}/lineup?team=${t.id}`}
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
                  team?.id === t.id
                    ? 'border-indigo-400/40 bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[0_4px_14px_-4px_rgba(99,102,241,0.5)]'
                    : 'border-hairline bg-glass-soft text-ink-4 hover:border-indigo-400/40 hover:text-ink-1',
                ].join(' ')}
              >
                {t.name}
              </a>
            ))}
          </div>
        )}
        {matchday.locks_at && (
          <p className="text-sm text-amber-400">
            Scadenza:{' '}
            {new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(matchday.locks_at)
            )}
          </p>
        )}
      </div>

      {!pricesReady && matchday.status === 'open' && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          ⚠ I prezzi per questa giornata non sono stati ancora caricati ({pricedCount} / {poolSize}).
          Contatta l&apos;admin di lega.
        </div>
      )}

      <LineupBuilder
        matchdayId={matchdayId}
        teamId={team?.id ?? ''}
        formations={formations}
        poolPlayers={poolPlayers}
        priceByPlayerId={priceByPlayerId}
        weeklyBudget={weeklyBudget}
        pricesReady={pricesReady}
        currentSubmission={currentSubmission}
        isReadOnly={matchday.status !== 'open' || !pricesReady}
      />
    </div>
  )
}
