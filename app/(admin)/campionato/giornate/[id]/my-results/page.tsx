import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { BonusMalusItem } from '@/domain/engine/v1/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `I miei risultati — ${data?.name ?? 'Giornata'}` }
}

// ============================================================
// /my-results — the post-deadline reveal page (managers only).
// ============================================================
// Shows the trademark in action: voto base, bonus/malus, raw
// subtotal, ownership %, popularity penalty, MVP bonus, fantavoto.
// Plus a "league reveal" panel at the top with the matchday's
// biggest differential winners and herd disasters.
// ============================================================

type CalcRow = {
  player_id: string
  fantavoto: number | null
  voto_base: number | null
  bonus_malus_breakdown: unknown
  total_bonus_malus: number | null
  raw_subtotal: number | null
  ownership_pct: number | null
  mvp_bonus_pct: number | null
  mvp_bonus_amount: number | null
  popularity_penalty_pct: number | null
  popularity_penalty_amount: number | null
  is_override: boolean
  is_provisional: boolean
  league_players: { full_name: string; club: string; rating_class: string } | null
}

export default async function MyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params

  // Admins have full results; send them there
  if (ctx.role === 'league_admin') {
    redirect(`/campionato/giornate/${matchdayId}/results`)
  }

  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Manager's own team
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .single()

  if (!myTeam) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">Non sei associato a nessuna squadra in questa lega.</p>
      </div>
    )
  }

  if (!['published', 'archived'].includes(matchday.status)) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">
          I risultati non sono ancora disponibili — la giornata non è ancora pubblicata.
        </p>
      </div>
    )
  }

  const { data: ptr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  if (!ptr?.run_id) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">Nessun calcolo pubblicato per questa giornata.</p>
      </div>
    )
  }

  // Parallel fetch: team score, run meta, lineup pointer, all calcs (for reveal panel).
  const [
    { data: myScore },
    { data: run },
    { data: lineupPointer },
    { data: allCalcsRaw },
  ] = await Promise.all([
    supabase
      .from('published_team_scores')
      .select('total_fantavoto, player_count, nv_count')
      .eq('matchday_id', matchdayId)
      .eq('team_id', myTeam.id)
      .maybeSingle(),
    supabase
      .from('calculation_runs')
      .select('run_number, published_at, engine_version')
      .eq('id', ptr.run_id)
      .single(),
    supabase
      .from('lineup_current_pointers')
      .select('submission_id')
      .eq('matchday_id', matchdayId)
      .eq('team_id', myTeam.id)
      .maybeSingle(),
    supabase
      .from('player_calculations')
      .select(`
        player_id, fantavoto, voto_base, bonus_malus_breakdown, total_bonus_malus,
        raw_subtotal, ownership_pct, mvp_bonus_pct, mvp_bonus_amount,
        popularity_penalty_pct, popularity_penalty_amount,
        is_override, is_provisional,
        league_players ( full_name, club, rating_class )
      `)
      .eq('run_id', ptr.run_id),
  ])

  if (!myScore) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">
          Nessun punteggio pubblicato per la tua squadra in questa giornata.
        </p>
      </div>
    )
  }

  const allCalcs = (allCalcsRaw ?? []) as unknown as CalcRow[]
  const calcByPlayer = new Map<string, CalcRow>()
  for (const c of allCalcs) calcByPlayer.set(c.player_id, c)

  // My lineup
  type LineupSlot = { player_id: string; is_bench: boolean; bench_order: number | null }
  let lineupPlayers: LineupSlot[] = []
  if (lineupPointer?.submission_id) {
    const { data } = await supabase
      .from('lineup_submission_players')
      .select('player_id, is_bench, bench_order')
      .eq('submission_id', lineupPointer.submission_id)
    lineupPlayers = (data ?? []) as LineupSlot[]
  }
  const myPlayerIds = new Set(lineupPlayers.filter((p) => !p.is_bench).map((p) => p.player_id))

  // ─── League reveal panels ────────────────────────────────
  // Players who actually scored (have ownership recorded and fantavoto != null)
  const scored = allCalcs.filter(
    (c) => c.fantavoto !== null && c.ownership_pct !== null
  )

  // Biggest differential winners: low ownership (<25%), high fantavoto
  const differentialWinners = [...scored]
    .filter((c) => (c.ownership_pct ?? 100) <= 25 && (c.fantavoto ?? 0) >= 7)
    .sort((a, b) => (b.fantavoto ?? 0) - (a.fantavoto ?? 0))
    .slice(0, 3)

  // Biggest herd disasters: high ownership (>50%), low or negative fantavoto
  const herdDisasters = [...scored]
    .filter((c) => (c.ownership_pct ?? 0) >= 50 && (c.fantavoto ?? 0) <= 4)
    .sort((a, b) => (a.fantavoto ?? 0) - (b.fantavoto ?? 0))
    .slice(0, 3)

  // MVPs hit (mvp_bonus_pct > 0 means engine flagged this as an MVP in their match)
  const mvpsHit = [...scored]
    .filter((c) => (c.mvp_bonus_pct ?? 0) > 0)
    .sort((a, b) => (b.mvp_bonus_amount ?? 0) - (a.mvp_bonus_amount ?? 0))
    .slice(0, 4)

  const starters = lineupPlayers.filter((p) => !p.is_bench)
  const bench = lineupPlayers
    .filter((p) => p.is_bench)
    .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))

  const rcColors: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
  }

  const fmtDate = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dt))
      : null

  function PlayerRow({ player_id, isBench }: { player_id: string; isBench: boolean }) {
    const c = calcByPlayer.get(player_id)
    const player = c?.league_players
    const isNV = !c || c.fantavoto == null
    const bmItems = Array.isArray(c?.bonus_malus_breakdown) ? (c.bonus_malus_breakdown as BonusMalusItem[]) : []

    return (
      <tr className={isBench ? 'opacity-60' : ''}>
        <td colSpan={5} className="p-0">
          <details className="group">
            <summary className="grid cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-glass-1 list-none [&::-webkit-details-marker]:hidden sm:grid-cols-[1fr_auto_auto_auto_auto]">
              {/* Player name + club */}
              <div className="min-w-0">
                <div className={`font-medium truncate ${isBench ? 'text-ink-3' : 'text-ink-1'}`}>
                  {player?.full_name ?? '—'}
                </div>
                <div className="text-[11px] text-ink-4 truncate">{player?.club ?? ''}</div>
              </div>
              {/* Role */}
              <div className="hidden sm:block w-10 text-right">
                <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-ink-3'}`}>
                  {player?.rating_class ?? '—'}
                </span>
              </div>
              {/* Ownership chip */}
              <div className="w-12 text-right">
                {c?.ownership_pct !== null && c?.ownership_pct !== undefined ? (
                  <span className={`font-mono text-[11px] ${
                    c.ownership_pct <= 10 ? 'text-emerald-400' :
                    c.ownership_pct >= 76 ? 'text-rose-400' :
                    'text-ink-3'
                  }`}>
                    {c.ownership_pct.toFixed(0)}%
                  </span>
                ) : <span className="text-ink-5">—</span>}
              </div>
              {/* Raw subtotal */}
              <div className="w-14 text-right font-mono text-xs text-ink-4">
                {c?.raw_subtotal != null ? c.raw_subtotal.toFixed(1) : '—'}
              </div>
              {/* Fantavoto */}
              <div className="w-16 text-right">
                <span className={`font-mono font-bold text-sm ${
                  isBench ? 'text-ink-4' :
                  isNV ? 'text-ink-4' :
                  (c?.fantavoto ?? 0) < 0 ? 'text-rose-400' :
                  (c?.fantavoto ?? 0) >= 10 ? 'text-emerald-400' :
                  'text-ink-1'
                }`}>
                  {c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'}
                </span>
                {(c?.mvp_bonus_pct ?? 0) > 0 && <span className="ml-1 text-[10px] text-amber-400" title="MVP del match">★</span>}
                {c?.is_provisional && <span className="ml-1 text-[10px] text-amber-400" title="Provvisorio">~</span>}
                {c?.is_override && <span className="ml-1 text-[10px] text-orange-400" title="Override manuale">⚙</span>}
                <span className="ml-1 text-[10px] text-ink-5 group-open:text-indigo-400">▾</span>
              </div>
            </summary>

            {/* Breakdown panel */}
            <div className="border-b border-hairline bg-surface-0 px-4 py-3 sm:px-6">
              {isNV ? (
                <p className="text-xs text-ink-4">Giocatore NV — non ha partecipato o nessun voto disponibile.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <BreakdownRow label="Voto base" value={c?.voto_base != null ? c.voto_base.toFixed(2) : '—'} />
                    <BreakdownRow label="Σ B/M"     value={c?.total_bonus_malus != null ? (c.total_bonus_malus >= 0 ? '+' : '') + c.total_bonus_malus.toFixed(2) : '—'} color={c?.total_bonus_malus != null && c.total_bonus_malus >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                    <BreakdownRow label="Raw subtotal" value={c?.raw_subtotal != null ? c.raw_subtotal.toFixed(2) : '—'} highlight />
                    <BreakdownRow label="Ownership" value={c?.ownership_pct != null ? `${c.ownership_pct.toFixed(1)}%` : '—'} />
                    {c?.popularity_penalty_amount != null && c.popularity_penalty_amount > 0 && (
                      <BreakdownRow
                        label={`Pen. popolarità (${c.popularity_penalty_pct?.toFixed(0)}%)`}
                        value={`−${c.popularity_penalty_amount.toFixed(2)}`}
                        color="text-rose-400"
                      />
                    )}
                    {(c?.mvp_bonus_pct ?? 0) > 0 && c?.mvp_bonus_amount != null && (
                      <BreakdownRow
                        label={`Bonus MVP (${c.mvp_bonus_pct?.toFixed(0)}%)`}
                        value={`${c.mvp_bonus_amount >= 0 ? '+' : ''}${c.mvp_bonus_amount.toFixed(2)}`}
                        color="text-amber-400"
                      />
                    )}
                    <BreakdownRow label="Fantavoto" value={c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'} highlight />
                  </div>

                  {bmItems.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-hairline">
                      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-4">Bonus/Malus dettaglio</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {bmItems.map((b, i) => (
                          <span key={i} className="text-xs">
                            <span className="text-ink-3">{b.label}</span>{' '}
                            {b.quantity > 1 && <span className="font-mono text-ink-4">{b.quantity}× </span>}
                            <span className={`font-mono font-bold ${b.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {b.total >= 0 ? '+' : ''}{b.total.toFixed(1)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <a href={`/campionato/giornate/${matchdayId}`} className="text-[12.5px] text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-ink-1">I miei risultati</h1>
        {run && (
          <p className="mt-0.5 text-[11px] text-ink-4">
            Run #{run.run_number} · <span className="font-mono text-indigo-300">{run.engine_version}</span>
            {fmtDate(run.published_at) ? ` · Pubblicato il ${fmtDate(run.published_at)}` : ''}
          </p>
        )}
      </div>

      {/* ── LEAGUE REVEAL — the trademark moment ──────────────── */}
      {(differentialWinners.length > 0 || herdDisasters.length > 0 || mvpsHit.length > 0) && (
        <Card>
          <CardHeader title="La rivelazione" description="Cosa è successo in lega questa giornata" />
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">

              {differentialWinners.length > 0 && (
                <RevealColumn
                  title="Differenziali vincenti"
                  hint="Pochi li hanno scelti, e hanno svoltato"
                  accent="emerald"
                  items={differentialWinners.map((c) => ({
                    full_name: c.league_players?.full_name ?? '—',
                    club:      c.league_players?.club ?? '',
                    ownership: c.ownership_pct ?? 0,
                    final:     c.fantavoto ?? 0,
                    mine:      myPlayerIds.has(c.player_id),
                  }))}
                />
              )}

              {herdDisasters.length > 0 && (
                <RevealColumn
                  title="Disastri della folla"
                  hint="Picks ovvi che hanno deluso"
                  accent="rose"
                  items={herdDisasters.map((c) => ({
                    full_name: c.league_players?.full_name ?? '—',
                    club:      c.league_players?.club ?? '',
                    ownership: c.ownership_pct ?? 0,
                    final:     c.fantavoto ?? 0,
                    mine:      myPlayerIds.has(c.player_id),
                  }))}
                />
              )}

              {mvpsHit.length > 0 && (
                <RevealColumn
                  title="MVP del giorno"
                  hint="Miglior rating del loro match"
                  accent="amber"
                  items={mvpsHit.map((c) => ({
                    full_name: c.league_players?.full_name ?? '—',
                    club:      c.league_players?.club ?? '',
                    ownership: c.ownership_pct ?? 0,
                    final:     c.fantavoto ?? 0,
                    mine:      myPlayerIds.has(c.player_id),
                  }))}
                />
              )}

            </div>
          </CardContent>
        </Card>
      )}

      {/* My team score */}
      <Card>
        <CardHeader
          title={myTeam.name}
          description={`${myScore.player_count} titolari · ${myScore.nv_count > 0 ? `${myScore.nv_count} NV` : 'nessun NV'}`}
          action={
            <span className={`font-mono text-2xl font-bold ${
              Number(myScore.total_fantavoto) >= 80 ? 'text-emerald-400' :
              Number(myScore.total_fantavoto) < 50 ? 'text-rose-400' :
              'text-ink-1'
            }`}>
              {Number(myScore.total_fantavoto).toFixed(2)}
            </span>
          }
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wider text-ink-4">
                  <th className="px-4 py-2 sm:px-6">Giocatore</th>
                  <th className="hidden sm:table-cell px-2 py-2 text-right w-10">Ruolo</th>
                  <th className="px-2 py-2 text-right w-12">Own%</th>
                  <th className="px-2 py-2 text-right w-14">Raw</th>
                  <th className="px-2 py-2 text-right w-16 pr-4 sm:pr-6">Fanta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {starters.map(({ player_id }) => (
                  <PlayerRow key={player_id} player_id={player_id} isBench={false} />
                ))}

                {bench.length > 0 && (
                  <tr>
                    <td colSpan={5} className="bg-glass-soft px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-4 sm:px-6">
                      Panchina
                    </td>
                  </tr>
                )}

                {bench.map(({ player_id }) => (
                  <PlayerRow key={player_id} player_id={player_id} isBench={true} />
                ))}

                {lineupPlayers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-sm text-ink-4 sm:px-6">
                      Nessuna formazione registrata per questa giornata.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-hairline px-4 py-2.5 sm:px-6">
            <p className="text-[11px] text-ink-4">
              Tap su un giocatore per vedere voto base, bonus/malus, penalità popolarità e bonus MVP.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function BreakdownRow({
  label, value, color, highlight,
}: {
  label: string
  value: string
  color?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 font-mono">
      <span className="text-ink-4">{label}</span>
      <span className={color ?? (highlight ? 'text-ink-1 font-semibold' : 'text-ink-2')}>
        {value}
      </span>
    </div>
  )
}

interface RevealItem {
  full_name: string
  club: string
  ownership: number
  final: number
  mine: boolean
}

function RevealColumn({
  title, hint, accent, items,
}: {
  title: string
  hint: string
  accent: 'emerald' | 'rose' | 'amber'
  items: RevealItem[]
}) {
  const accentClasses = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    rose:    'border-rose-500/30 bg-rose-500/5',
    amber:   'border-amber-500/30 bg-amber-500/5',
  }[accent]
  const accentText = {
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
    amber:   'text-amber-700 dark:text-amber-300',
  }[accent]
  const accentValueColor = {
    emerald: 'text-emerald-400',
    rose:    'text-rose-400',
    amber:   'text-amber-400',
  }[accent]

  return (
    <div className={`rounded-xl border p-3 ${accentClasses}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accentText}`}>{title}</p>
      <p className="text-[10px] text-ink-4 mb-2">{hint}</p>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 ${
              it.mine ? 'bg-indigo-500/15 border border-indigo-400/40' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink-1 truncate">
                {it.full_name}
                {it.mine && <span className="ml-1 text-[10px] text-indigo-300">· tu</span>}
              </p>
              <p className="text-[10px] text-ink-4 truncate">
                {it.club} · {it.ownership.toFixed(0)}%
              </p>
            </div>
            <span className={`font-mono text-sm font-bold ${accentValueColor}`}>
              {it.final.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
