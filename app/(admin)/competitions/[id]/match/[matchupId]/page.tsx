import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { isUuid } from '@/lib/slug'

type BonusMalusItem = { label: string; total: number; quantity: number; points_each: number }

type StarterEntry = {
  name: string; player_id: string | null
  fantavoto: number | null; voto_base: number | null
  bonus_malus: BonusMalusItem[] | null
  is_nv: boolean; subbed_by: string | null
}
type BenchEntry = {
  name: string; player_id: string | null
  fantavoto: number | null; subbed_in_for: string | null
}

function BonusMalusCell({ bm }: { bm: BonusMalusItem[] | null }) {
  if (!bm || bm.length === 0) return <span className="text-ink-4">—</span>
  const items = bm.filter(item => item.total !== 0)
  if (items.length === 0) return <span className="text-ink-4">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={i}
          className={`rounded px-1 py-0.5 text-xs font-medium ${item.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
        >
          {item.label} {item.total > 0 ? '+' : ''}{item.total}
        </span>
      ))}
    </span>
  )
}

// ---- Team formation table ---------------------------------------------------

function TeamLineup({
  starters,
  bench,
}: {
  starters: StarterEntry[]
  bench: BenchEntry[]
}) {
  const benchByName = new Map(bench.map(b => [b.name.toLowerCase(), b]))

  return (
    <div className="space-y-3">
      {/* Starters table */}
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-transparent">
              <th className="px-3 py-2 text-left text-xs font-medium text-ink-4">Giocatore</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-ink-4">Base</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-ink-4">B/M</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-ink-4">FV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {starters.map((p, i) => {
              const sub = p.subbed_by ? benchByName.get(p.subbed_by.toLowerCase()) : null
              return (
                <tr key={i} className={p.is_nv ? 'opacity-50' : 'hover:bg-glass-1'}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.is_nv && <span className="rounded bg-red-500/20 px-1 text-xs text-red-400">NV</span>}
                      <span className={p.is_nv ? 'text-ink-4 line-through' : 'text-ink-1'}>{p.name}</span>
                      {p.subbed_by && (
                        <span className="text-xs text-emerald-400">
                          ↑ {p.subbed_by}
                          {sub?.fantavoto != null && (
                            <span className="ml-1 font-mono font-bold">({Number(sub.fantavoto).toFixed(2)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-4">
                    {p.voto_base != null ? Number(p.voto_base).toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <BonusMalusCell bm={p.bonus_malus} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    {p.fantavoto != null
                      ? <span className={p.fantavoto >= 7 ? 'text-green-400' : p.fantavoto >= 6 ? 'text-ink-1' : 'text-amber-400'}>
                          {Number(p.fantavoto).toFixed(2)}
                        </span>
                      : sub?.fantavoto != null
                      ? <span className="text-emerald-300">{Number(sub.fantavoto).toFixed(2)}</span>
                      : <span className="text-ink-4">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bench (non-subbed) */}
      {bench.filter(b => !b.subbed_in_for).length > 0 && (
        <div>
          <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wider text-ink-4">Panchina</p>
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-hairline">
                {bench.filter(b => !b.subbed_in_for).map((b, i) => (
                  <tr key={i} className="opacity-60 hover:opacity-100">
                    <td className="px-3 py-1.5 text-ink-4">{b.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-4">
                      {b.fantavoto != null ? b.fantavoto.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Page ------------------------------------------------------------------

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchupId: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: ref, matchupId } = await params
  const supabase = await createClient()

  // Competition name for breadcrumb + resolve the URL ref (slug or UUID) to id.
  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name')
    .eq(isUuid(ref) ? 'id' : 'slug', ref)
    .maybeSingle()

  if (!comp) notFound()
  const competitionId = comp.id

  const { data: matchup } = await supabase
    .from('competition_matchups')
    .select('*')
    .eq('id', matchupId)
    .eq('competition_id', competitionId)
    .single()

  if (!matchup) notFound()

  // Get matchday_id from competition_rounds via round_number
  const { data: round } = await supabase
    .from('competition_rounds')
    .select('matchday_id, name')
    .eq('competition_id', competitionId)
    .eq('round_number', matchup.round_number)
    .maybeSingle()

  // Get team names
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .in('id', [matchup.home_team_id, matchup.away_team_id])

  const homeTeam = teams?.find(t => t.id === matchup.home_team_id)
  const awayTeam = teams?.find(t => t.id === matchup.away_team_id)

  // Build lineup data ─────────────────────────────────────────────────────────
  let homeLineup: { starters: StarterEntry[]; bench: BenchEntry[] } | null = null
  let awayLineup: { starters: StarterEntry[]; bench: BenchEntry[] } | null = null

  if (round?.matchday_id) {
    // Try matchday_lineups (leghe xlsx import) first
    const { data: legheLineups } = await supabase
      .from('matchday_lineups')
      .select('team_id, starters, bench')
      .eq('matchday_id', round.matchday_id)
      .in('team_id', [matchup.home_team_id, matchup.away_team_id])

    for (const l of legheLineups ?? []) {
      const lineup = {
        starters: l.starters as unknown as StarterEntry[],
        bench: l.bench as unknown as BenchEntry[],
      }
      if (l.team_id === matchup.home_team_id) homeLineup = lineup
      else awayLineup = lineup
    }

    // Fall back to lineup_submissions for missing teams
    const missingTeams = [matchup.home_team_id, matchup.away_team_id].filter(
      (tid) => !(tid === matchup.home_team_id ? homeLineup : awayLineup)
    )

    if (missingTeams.length > 0) {
      const { data: pointers } = await supabase
        .from('lineup_current_pointers')
        .select('team_id, submission_id')
        .eq('matchday_id', round.matchday_id)
        .in('team_id', missingTeams)

      const subIds = (pointers ?? []).map((p) => p.submission_id)
      const ptrTeamMap = new Map((pointers ?? []).map((p) => [p.submission_id, p.team_id]))

      if (subIds.length > 0) {
        const { data: subPlayers } = await supabase
          .from('lineup_submission_players')
          .select('submission_id, player_id, is_bench, bench_order, assigned_mantra_role, slot_id')
          .in('submission_id', subIds)

        const allPlayerIds = [...new Set((subPlayers ?? []).map((p) => p.player_id))]
        const { data: playerNames } = allPlayerIds.length > 0
          ? await supabase.from('league_players').select('id, full_name').in('id', allPlayerIds)
          : { data: [] }
        const nameMap = new Map((playerNames ?? []).map((p) => [p.id, p.full_name]))

        // ── Score lookup: official pointer → latest draft run ─────────────
        let runId: string | null = null
        const { data: calcPtr } = await supabase
          .from('matchday_current_calculation')
          .select('run_id')
          .eq('matchday_id', round.matchday_id)
          .maybeSingle()
        runId = calcPtr?.run_id ?? null

        if (!runId) {
          const { data: latestRun } = await supabase
            .from('calculation_runs')
            .select('id')
            .eq('matchday_id', round.matchday_id)
            .order('run_number', { ascending: false })
            .limit(1)
            .maybeSingle()
          runId = latestRun?.id ?? null
        }

        const scoreMap = new Map<string, { fantavoto: number | null; voto_base: number | null; bm: BonusMalusItem[] | null }>()
        if (runId) {
          const { data: calcs } = await supabase
            .from('player_calculations')
            .select('player_id, fantavoto, voto_base, bonus_malus_breakdown')
            .eq('run_id', runId)
          for (const c of calcs ?? []) {
            scoreMap.set(c.player_id, {
              fantavoto: c.fantavoto,
              voto_base: c.voto_base,
              bm: c.bonus_malus_breakdown as BonusMalusItem[] | null,
            })
          }
        }

        type SubPlayer = NonNullable<typeof subPlayers>[number]
        const byTeam = new Map<string, SubPlayer[]>()
        for (const sp of subPlayers ?? []) {
          const teamId = ptrTeamMap.get(sp.submission_id)
          if (!teamId) continue
          const list = byTeam.get(teamId) ?? []
          list.push(sp)
          byTeam.set(teamId, list)
        }

        for (const [teamId, players] of byTeam) {
          const starters: StarterEntry[] = players
            .filter((p) => !p.is_bench)
            .map((p) => {
              const sc = scoreMap.get(p.player_id)
              return {
                name: nameMap.get(p.player_id) ?? p.player_id,
                player_id: p.player_id,
                fantavoto: sc?.fantavoto ?? null,
                voto_base: sc?.voto_base ?? null,
                bonus_malus: sc?.bm ?? null,
                is_nv: sc ? sc.fantavoto === null : false,
                subbed_by: null,
              }
            })

          const bench: BenchEntry[] = players
            .filter((p) => p.is_bench)
            .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))
            .map((p) => {
              const sc = scoreMap.get(p.player_id)
              return {
                name: nameMap.get(p.player_id) ?? p.player_id,
                player_id: p.player_id,
                fantavoto: sc?.fantavoto ?? null,
                subbed_in_for: null,
              }
            })

          const lineup = { starters, bench }
          if (teamId === matchup.home_team_id) homeLineup = lineup
          else awayLineup = lineup
        }
      }
    }
  }

  // ── Score and result display helpers ─────────────────────────────────────
  const homeFvStr = matchup.home_fantavoto != null ? Number(matchup.home_fantavoto).toFixed(2) : null
  const awayFvStr = matchup.away_fantavoto != null ? Number(matchup.away_fantavoto).toFixed(2) : null
  const hasScore  = homeFvStr !== null || awayFvStr !== null

  // Colour coding: winner green, loser dim
  const homeScoreColor =
    matchup.result === '1' ? 'text-green-400'
    : matchup.result === '2' ? 'text-red-400'
    : 'text-ink-1'
  const awayScoreColor =
    matchup.result === '2' ? 'text-green-400'
    : matchup.result === '1' ? 'text-red-400'
    : 'text-ink-1'
  const homeNameColor =
    matchup.result === '1' ? 'text-green-400'
    : matchup.result === '2' ? 'text-ink-4'
    : 'text-ink-1'
  const awayNameColor =
    matchup.result === '2' ? 'text-green-400'
    : matchup.result === '1' ? 'text-ink-4'
    : 'text-ink-1'

  const resultLabel =
    matchup.result === '1' ? `${homeTeam?.name ?? '?'} vince`
    : matchup.result === '2' ? `${awayTeam?.name ?? '?'} vince`
    : matchup.result === 'X' ? 'Pareggio'
    : null

  // Compute sum of individual player fantavotos for a "live" preview score
  // (used when matchup.home_fantavoto is not yet computed)
  function liveSum(lineup: { starters: StarterEntry[] } | null): number | null {
    if (!lineup) return null
    const vals = lineup.starters.map(s => s.fantavoto).filter((v): v is number => v !== null)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0)
  }

  const homeLiveFv = hasScore ? null : liveSum(homeLineup)
  const awayLiveFv = hasScore ? null : liveSum(awayLineup)
  const showLive   = !hasScore && (homeLiveFv !== null || awayLiveFv !== null)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <a href={`/competitions/${competitionId}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {comp?.name ?? 'Competizione'}
        </a>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-4">
          {round?.name ?? `Giornata ${matchup.round_number}`}
        </p>
      </div>

      {/* ── Matchup card ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl border border-hairline backdrop-blur-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(46,50,88,0.55), rgba(28,30,56,0.65))',
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.35), 0 8px 26px rgba(0,0,0,0.30), 0 24px 60px -20px rgba(0,0,0,0.5)',
        }}
      >
        {/* Soft halo */}
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 360,
            height: 80,
            background:
              'radial-gradient(60% 100% at 50% 50%, rgba(99,102,241,0.30), rgba(99,102,241,0))',
            filter: 'blur(20px)',
          }}
        />

        {/* Header: home | score | away */}
        <div
          className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline px-6 py-7 md:gap-6 md:px-8"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))',
          }}
        >
          {/* Home */}
          <div className="min-w-0 text-right">
            <p
              className={`truncate font-medium leading-tight tracking-tight ${homeNameColor}`}
              style={{ fontSize: 'clamp(15px, 1.6vw, 22px)' }}
            >
              {homeTeam?.name ?? '?'}
            </p>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            {hasScore ? (
              <>
                <div className="flex items-baseline gap-3 font-light tabular-nums" style={{ letterSpacing: '-0.04em' }}>
                  <span
                    className={homeScoreColor}
                    style={{ fontSize: 'clamp(34px, 4vw, 52px)', lineHeight: 1 }}
                  >
                    {homeFvStr ?? '—'}
                  </span>
                  <span className="font-thin text-ink-5 select-none" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>–</span>
                  <span
                    className={awayScoreColor}
                    style={{ fontSize: 'clamp(34px, 4vw, 52px)', lineHeight: 1 }}
                  >
                    {awayFvStr ?? '—'}
                  </span>
                </div>
                {resultLabel && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-4">{resultLabel}</p>
                )}
              </>
            ) : showLive ? (
              <>
                <div className="flex items-baseline gap-3 font-light tabular-nums text-ink-3" style={{ letterSpacing: '-0.04em' }}>
                  <span style={{ fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1 }}>{homeLiveFv?.toFixed(2) ?? '—'}</span>
                  <span className="font-thin text-ink-5" style={{ fontSize: 'clamp(22px, 2.4vw, 32px)' }}>–</span>
                  <span style={{ fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1 }}>{awayLiveFv?.toFixed(2) ?? '—'}</span>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">anteprima</p>
              </>
            ) : (
              <span className="rounded-full border border-hairline bg-glass-1 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">
                vs
              </span>
            )}
          </div>

          {/* Away */}
          <div className="min-w-0">
            <p
              className={`truncate font-medium leading-tight tracking-tight ${awayNameColor}`}
              style={{ fontSize: 'clamp(15px, 1.6vw, 22px)' }}
            >
              {awayTeam?.name ?? '?'}
            </p>
          </div>
        </div>

        {/* Formations */}
        {!homeLineup && !awayLineup ? (
          <div className="px-5 py-4 text-[13px] text-amber-300">
            Nessuna formazione inserita per questa giornata. Importa le formazioni dalla pagina della giornata.
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            {/* Home */}
            <div className="space-y-2 p-5">
              <p className="eyebrow">
                {homeTeam?.name ?? '?'}
                {homeLiveFv !== null && !hasScore && (
                  <span className="ml-2 font-mono normal-case tracking-normal text-ink-3">Σ {homeLiveFv.toFixed(2)}</span>
                )}
              </p>
              {homeLineup
                ? <TeamLineup starters={homeLineup.starters} bench={homeLineup.bench} />
                : <p className="py-10 text-center text-[13px] text-ink-4">Formazione non disponibile</p>
              }
            </div>

            {/* Away */}
            <div className="space-y-2 p-5">
              <p className="eyebrow">
                {awayTeam?.name ?? '?'}
                {awayLiveFv !== null && !hasScore && (
                  <span className="ml-2 font-mono normal-case tracking-normal text-ink-3">Σ {awayLiveFv.toFixed(2)}</span>
                )}
              </p>
              {awayLineup
                ? <TeamLineup starters={awayLineup.starters} bench={awayLineup.bench} />
                : <p className="py-10 text-center text-sm text-ink-4">Formazione non disponibile</p>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
