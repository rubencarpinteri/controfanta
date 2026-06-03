import { requireFMContext, getFMPhases, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'

export default async function ClassificaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const [phases, rounds] = await Promise.all([
    getFMPhases(ctx.competition.id),
    getFMRounds(ctx.competition.id),
  ])

  const { data: standings } = await supabase
    .from('fm_competition_standing')
    .select('fantasy_team_id, br_points_total, round_wins, raw_score_total, rank')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .order('rank', { ascending: true })

  const teamIds = (standings ?? []).map((s) => s.fantasy_team_id)
  const { data: fantasyTeams } = await supabase
    .from('fm_fantasy_team')
    .select('id, name')
    .in('id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])

  const teamMap = new Map((fantasyTeams ?? []).map((t) => [t.id, t.name]))

  const publishedRounds = rounds.filter((r) => r.status === 'published')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Classifica</h2>
        <p className="text-[11px] text-ink-4">{publishedRounds.length} giornate pubblicata{publishedRounds.length !== 1 ? 'e' : ''}</p>
      </div>

      {(standings ?? []).length === 0 ? (
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
                <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">V</th>
                <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">Tot</th>
                <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">BR Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(standings ?? []).map((row, i) => (
                <tr key={row.fantasy_team_id} className="hover:bg-glass-1 transition-colors">
                  <td className="py-2.5 pl-4 text-[11px] tabular-nums text-ink-4 w-8">{row.rank ?? i + 1}</td>
                  <td className="py-2.5 px-3 text-[13px] font-medium text-ink-1">
                    {teamMap.get(row.fantasy_team_id) ?? '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-emerald-400 hidden sm:table-cell">{row.round_wins}</td>
                  <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-ink-3 hidden sm:table-cell">
                    {row.raw_score_total.toFixed(1)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-[14px] font-semibold tabular-nums text-ink-1">{row.br_points_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {publishedRounds.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-3">Giornate completate</p>
          <div className="space-y-1">
            {publishedRounds.map((r) => {
              const phase = phases.find((p) => p.id === r.phase_id)
              return (
                <div key={r.id} className="flex items-center gap-3 text-[12px]">
                  <span className="text-ink-4 w-32 truncate">{phase?.name ?? '—'}</span>
                  <span className="flex-1 text-ink-2">{r.name}</span>
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">Pubblicata</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
