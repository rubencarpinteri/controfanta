import Link from 'next/link'
import type { Route } from 'next'
import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'

function n(v: number | string | null | undefined, decimals = 1) {
  if (v == null) return '—'
  return Number(v).toFixed(decimals)
}

export default async function ClassificaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const { id } = await params
  const { round: roundParam } = await searchParams
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const [rounds, standingsRes, teamsRes] = await Promise.all([
    getFMRounds(ctx.competition.id),
    supabase
      .from('fm_competition_standing')
      .select('fantasy_team_id, br_points_total, round_wins, raw_score_total, rank')
      .eq('league_competition_id', ctx.legaCompetition.id)
      .order('rank', { ascending: true }),
    supabase
      .from('fm_fantasy_team')
      .select('id, name')
      .eq('league_competition_id', ctx.legaCompetition.id),
  ])

  const scoredRounds = rounds.filter((r) => r.status === 'published' || r.status === 'scoring')
  const selectedRound =
    scoredRounds.find((r) => r.id === roundParam) ??
    scoredRounds[scoredRounds.length - 1] ??
    null

  const { data: roundScoresData } = selectedRound
    ? await supabase
        .from('fm_fantasy_team_round_score')
        .select('fantasy_team_id, raw_total, goals_scored, br_wins, br_draws, br_losses, br_points')
        .eq('scoring_round_id', selectedRound.id)
        .order('raw_total', { ascending: false })
    : { data: [] }
  const roundScoresRes = { data: roundScoresData }

  const teamMap = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]))
  const standings = standingsRes.data ?? []
  // fm_fantasy_team_round_score is round-wide across every Lega instance of
  // the tournament — scope it to THIS Lega's teams.
  const roundScores = (roundScoresRes.data ?? []).filter((s) => teamMap.has(s.fantasy_team_id))
  const me = ctx.fantasyTeamId

  return (
    <div className="space-y-6">
      {/* ── Classifica generale ────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-[16px] font-semibold text-ink-1">Classifica generale</h2>
        {standings.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
            <p className="text-[14px] text-ink-3">
              La classifica sarà disponibile dopo la prima giornata pubblicata.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-glass-2">
                  <th className="py-2 pl-4 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4 w-8">#</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4">Squadra</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4">V</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">Tot</th>
                  <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">BR Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {standings.map((row, i) => {
                  const isMe = row.fantasy_team_id === me
                  return (
                    <tr key={row.fantasy_team_id} className={`transition-colors ${isMe ? 'bg-indigo-500/5' : 'hover:bg-glass-1'}`}>
                      <td className="py-2.5 pl-4 text-[11px] tabular-nums text-ink-4 w-8">{row.rank ?? i + 1}</td>
                      <td className="py-2.5 px-3 text-[13px] font-medium">
                        <span className={isMe ? 'text-indigo-400' : 'text-ink-1'}>{teamMap.get(row.fantasy_team_id) ?? '—'}</span>
                        {isMe && <span className="ml-1.5 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">tu</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-emerald-400">{row.round_wins}</td>
                      <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-ink-3 hidden sm:table-cell">{row.raw_score_total.toFixed(1)}</td>
                      <td className="py-2.5 pr-4 text-right text-[14px] font-semibold tabular-nums text-ink-1">{row.br_points_total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Classifica di giornata ─────────────────────────────────────── */}
      <div className="space-y-2 border-t border-hairline pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink-1">Classifica di giornata</h2>
          {selectedRound && <p className="text-[11px] text-ink-4">{selectedRound.name}</p>}
        </div>

        {scoredRounds.length > 1 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {scoredRounds.map((r) => (
              <Link
                key={r.id}
                href={`/controfantamondiale/${id}/classifica?round=${r.id}` as Route}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  r.id === selectedRound?.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-glass-2 text-ink-3 hover:text-ink-1 border border-hairline'
                }`}
              >
                {r.name}
              </Link>
            ))}
          </div>
        )}

        {roundScores.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-glass-1 px-4 py-6 text-center text-[12px] text-ink-5">
            Nessun punteggio ancora calcolato per questa giornata.
          </div>
        ) : (
          <div className="rounded-xl border border-hairline overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-glass-2">
                  <th className="py-2 pl-4 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4 w-8">#</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4">Squadra</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">Gol</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">V/N/P</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4">BR</th>
                  <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {roundScores.map((row, i) => {
                  const isMe = row.fantasy_team_id === me
                  return (
                    <tr key={row.fantasy_team_id} className={`transition-colors ${isMe ? 'bg-indigo-500/5' : 'hover:bg-glass-1'}`}>
                      <td className="py-2.5 pl-4 text-[11px] tabular-nums text-ink-4 w-8">{i + 1}</td>
                      <td className="py-2.5 px-3 text-[13px] font-medium">
                        <span className={isMe ? 'text-indigo-400' : 'text-ink-1'}>{teamMap.get(row.fantasy_team_id) ?? '—'}</span>
                        {isMe && <span className="ml-1.5 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">tu</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-ink-3 hidden sm:table-cell">{row.goals_scored}</td>
                      <td className="py-2.5 px-3 text-center text-[11px] tabular-nums text-ink-4 hidden sm:table-cell">
                        <span className="text-emerald-400">{row.br_wins}</span>
                        <span className="text-ink-5">/</span>
                        <span className="text-amber-400">{row.br_draws}</span>
                        <span className="text-ink-5">/</span>
                        <span className="text-rose-400">{row.br_losses}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] font-semibold tabular-nums text-ink-2">{row.br_points}</td>
                      <td className="py-2.5 pr-4 text-right text-[14px] font-semibold tabular-nums text-ink-1">{n(row.raw_total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
