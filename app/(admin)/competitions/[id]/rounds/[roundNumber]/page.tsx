import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { isUuid } from '@/lib/slug'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RoundManager } from './RoundManager'
import type { CompetitionRound, CompetitionFixture } from '@/types/database.types'

export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string; roundNumber: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: ref, roundNumber } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status, scoring_config')
    .eq(isUuid(ref) ? 'id' : 'slug', ref)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  if (!comp) notFound()
  const id = comp.id

  const { data: round } = await supabase
    .from('competition_rounds')
    .select('*')
    .eq('competition_id', id)
    .eq('round_number', Number(roundNumber))
    .single()

  if (!round) notFound()

  const { data: fixtures } = await supabase
    .from('competition_fixtures')
    .select('*')
    .eq('round_id', round.id)
    .order('id')

  const fixtureList = (fixtures ?? []) as CompetitionFixture[]

  // Team name resolution
  const teamIds = [
    ...new Set(fixtureList.flatMap((f) => [f.home_team_id, f.away_team_id])),
  ]
  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Linked matchday info
  const { data: matchday } = round.matchday_id
    ? await supabase.from('matchdays').select('id, name, status').eq('id', round.matchday_id).single()
    : { data: null }

  const sc = comp.scoring_config as { method?: string } | null
  const hasGoals = sc?.method !== 'direct_comparison'

  return (
    <div className="space-y-6">
      <div>
        <a href={`/competitions/${id}/rounds`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← Turni
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          <span className="font-semibold">{(round as CompetitionRound).name}</span>
          <span className="serif font-normal text-ink-3">— {comp.name}{matchday ? ` · ${matchday.name}` : ''}</span>
        </h1>
      </div>

      <RoundManager
        round={round as CompetitionRound}
        competitionId={id}
        matchday={matchday}
        hasGoals={hasGoals}
      />

      {/* Fixtures table */}
      {fixtureList.length > 0 && (
        <Card>
          <CardHeader title={`Incontri (${fixtureList.length})`} />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Casa</th>
                  {hasGoals && <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Reti</th>}
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Fantavoto</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Risultato</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Fantavoto</th>
                  {hasGoals && <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-4">Reti</th>}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-4">Ospite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {fixtureList.map((f) => {
                  const homeName = teamNameMap.get(f.home_team_id) ?? '—'
                  const awayName = teamNameMap.get(f.away_team_id) ?? '—'
                  const resultColorMap = {
                    home_win:  { home: 'text-emerald-400 font-bold', away: 'text-ink-4' },
                    away_win:  { home: 'text-ink-4', away: 'text-emerald-400 font-bold' },
                    draw:      { home: 'text-amber-400', away: 'text-amber-400' },
                  } as const
                  const resultColor = (f.result ? resultColorMap[f.result] : undefined) ?? { home: 'text-ink-1', away: 'text-ink-1' }

                  return (
                    <tr key={f.id} className="hover:bg-glass-1">
                      <td className={`px-4 py-2.5 ${resultColor.home}`}>{homeName}</td>
                      {hasGoals && (
                        <td className="px-4 py-2.5 text-center text-ink-4">{f.home_score ?? '—'}</td>
                      )}
                      <td className="px-4 py-2.5 text-center text-ink-4">
                        {f.home_fantavoto != null ? f.home_fantavoto.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {f.result ? (
                          <span className={`text-xs font-medium ${
                            f.result === 'draw' ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {f.result === 'home_win' ? `${f.home_points}–${f.away_points}` :
                             f.result === 'away_win' ? `${f.home_points}–${f.away_points}` :
                             `${f.home_points}–${f.away_points}`}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-4">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-ink-4">
                        {f.away_fantavoto != null ? f.away_fantavoto.toFixed(1) : '—'}
                      </td>
                      {hasGoals && (
                        <td className="px-4 py-2.5 text-center text-ink-4">{f.away_score ?? '—'}</td>
                      )}
                      <td className={`px-4 py-2.5 text-right ${resultColor.away}`}>{awayName}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {fixtureList.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-ink-4">
              Nessun incontro disponibile per questo turno.
              {comp.type === 'campionato' && ' Genera prima il calendario.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
