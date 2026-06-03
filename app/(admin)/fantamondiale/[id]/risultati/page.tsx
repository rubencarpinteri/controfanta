import Link from 'next/link'
import type { Route } from 'next'
import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { finalizePlayerForLega } from '@/domain/fantamondiale/engine/playerScore'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import { loadFMUnifiedConfig } from '@/lib/fantamondiale/loadUnifiedConfig'
import { TeamCrest } from '@/components/fm/TeamCrest'

const ROLE_LABEL: Record<string, string> = { P: 'POR', D: 'DIF', C: 'CEN', A: 'ATT' }
const ROLE_COLOR: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}

function n(v: number | string | null | undefined, decimals = 2) {
  if (v == null) return '—'
  return Number(v).toFixed(decimals)
}

function resultBadge(result: string, isHome: boolean) {
  if (result === 'home_win') return isHome ? 'V' : 'P'
  if (result === 'away_win') return isHome ? 'P' : 'V'
  return 'N'
}

function resultColor(result: string, isHome: boolean) {
  const r = resultBadge(result, isHome)
  if (r === 'V') return 'text-emerald-400 bg-emerald-400/10'
  if (r === 'P') return 'text-rose-400 bg-rose-400/10'
  return 'text-amber-400 bg-amber-400/10'
}

export default async function RisultatiPage({
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

  const rounds = await getFMRounds(ctx.competition.id)
  const publishedRounds = rounds.filter((r) => r.status === 'published' || r.status === 'scoring')

  const selectedRound =
    publishedRounds.find((r) => r.id === roundParam) ??
    publishedRounds[publishedRounds.length - 1] ??
    null

  // ---- no rounds yet --------------------------------------------------
  if (!selectedRound) {
    return (
      <div className="space-y-4">
        <h2 className="text-[16px] font-semibold text-ink-1">Risultati</h2>
        <div className="rounded-xl border border-hairline bg-glass-1 p-10 text-center">
          <p className="text-[14px] text-ink-3">Nessuna giornata pubblicata ancora.</p>
          <p className="mt-1 text-[11px] text-ink-5">I risultati appariranno qui dopo la prima giornata.</p>
        </div>
      </div>
    )
  }

  const roundId = selectedRound.id

  // ---- load all team round scores + team names (parallel) --------------
  const [teamScoresRes, fantasyTeamsRes, brMatchupsRes] = await Promise.all([
    supabase
      .from('fm_fantasy_team_round_score')
      .select('fantasy_team_id, player_total, coach_total, raw_total, goals_scored, br_wins, br_draws, br_losses, br_points')
      .eq('scoring_round_id', roundId)
      .order('raw_total', { ascending: false }),
    supabase
      .from('fm_fantasy_team')
      .select('id, name')
      .eq('competition_id', id),
    ctx.fantasyTeamId
      ? supabase
          .from('fm_battle_royale_matchup')
          .select('team_a_id, team_b_id, team_a_goals, team_b_goals, team_a_score, team_b_score, team_a_points, team_b_points, result')
          .eq('scoring_round_id', roundId)
          .or(`team_a_id.eq.${ctx.fantasyTeamId},team_b_id.eq.${ctx.fantasyTeamId}`)
      : Promise.resolve({ data: [] }),
  ])

  const teamScores = teamScoresRes.data ?? []
  const teamMap = new Map((fantasyTeamsRes.data ?? []).map((t) => [t.id, t.name]))
  const myMatchups = brMatchupsRes.data ?? []

  // ---- user-specific breakdown ----------------------------------------
  const fantasyTeamId = ctx.fantasyTeamId
  let myPlayerRows: {
    player_id: string
    name: string
    role: string
    logoUrl: string | null
    flagUrl: string | null
    fifaCode: string
    country: string
    voto_base: number | null
    football_bonus: number
    football_malus: number
    mvp_bonus_amount: number
    popularity_penalty_amount: number
    ownership_pct: number
    final_score: number
  }[] = []

  let myCoachRow: {
    name: string
    country: string
    logoUrl: string | null
    flagUrl: string | null
    fifaCode: string
    tier: string
    match_result: string
    bonus_or_malus: number
    final_score: number
  } | null = null

  if (fantasyTeamId) {
    // Lineup starters for this round
    const { data: lineup } = await supabase
      .from('fm_matchday_lineup')
      .select('id')
      .eq('scoring_round_id', roundId)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    if (lineup) {
      const { data: lineupPlayers } = await supabase
        .from('fm_matchday_lineup_player')
        .select('player_id')
        .eq('lineup_id', lineup.id)
        .eq('is_starter', true)

      const starterIds = (lineupPlayers ?? []).map((lp) => lp.player_id)

      if (starterIds.length > 0) {
        // Score columns split: fm_player_match_score holds Lega-agnostic raw
        // values (voto_base, football_bonus/malus, raw_subtotal, is_mvp);
        // per-Lega popularity penalty + MVP bonus are derived on the fly
        // using fm_round_player_ownership for THIS Lega instance.
        const composed = await loadFMUnifiedConfig(supabase, ctx.competition.id)
        const config = fmCompetitionConfigSchema.parse(composed)

        const [playersRes, scoresRes, ownershipRes] = await Promise.all([
          supabase
            .from('fm_player')
            .select('id, name, role, national_team_id, fm_national_team(name, fifa_code, flag_emoji, logo_url, flag_url)')
            .in('id', starterIds),
          supabase
            .from('fm_player_match_score')
            .select('player_id, voto_base, football_bonus, football_malus, raw_subtotal, is_mvp')
            .eq('scoring_round_id', roundId)
            .in('player_id', starterIds),
          supabase
            .from('fm_round_player_ownership')
            .select('player_id, ownership_pct')
            .eq('league_competition_id', ctx.legaCompetition.id)
            .eq('scoring_round_id', roundId)
            .in('player_id', starterIds),
        ])

        const playerMeta = new Map(
          (playersRes.data ?? []).map((p) => [p.id, p])
        )
        const ownershipByPlayer = new Map(
          (ownershipRes.data ?? []).map((o) => [o.player_id, Number(o.ownership_pct)])
        )

        // Aggregate per player across matches, finalizing each match-row
        // using THIS Lega's ownership.
        const scoreAgg = new Map<string, {
          voto_base: number | null
          football_bonus: number
          football_malus: number
          mvp_bonus_amount: number
          popularity_penalty_amount: number
          ownership_pct: number
          final_score: number
          count: number
        }>()

        for (const s of scoresRes.data ?? []) {
          const own = ownershipByPlayer.get(s.player_id) ?? 0
          const finals = finalizePlayerForLega(
            { raw_subtotal: Number(s.raw_subtotal), is_mvp: s.is_mvp },
            own,
            config,
          )
          const existing = scoreAgg.get(s.player_id)
          if (existing) {
            existing.football_bonus += Number(s.football_bonus)
            existing.football_malus += Number(s.football_malus)
            existing.mvp_bonus_amount += finals.mvp_bonus_amount
            existing.popularity_penalty_amount += finals.popularity_penalty_amount
            existing.final_score += finals.final_score
            existing.count++
          } else {
            scoreAgg.set(s.player_id, {
              voto_base: s.voto_base != null ? Number(s.voto_base) : null,
              football_bonus: Number(s.football_bonus),
              football_malus: Number(s.football_malus),
              mvp_bonus_amount: finals.mvp_bonus_amount,
              popularity_penalty_amount: finals.popularity_penalty_amount,
              ownership_pct: own,
              final_score: finals.final_score,
              count: 1,
            })
          }
        }

        myPlayerRows = starterIds
          .map((pid) => {
            const meta = playerMeta.get(pid)
            const score = scoreAgg.get(pid)
            const team = meta?.fm_national_team as { name: string; fifa_code: string; flag_emoji: string | null; logo_url: string | null; flag_url: string | null } | null
            return {
              player_id: pid,
              name: meta?.name ?? '—',
              role: meta?.role ?? '?',
              logoUrl: team?.logo_url ?? null,
              flagUrl: team?.flag_url ?? null,
              fifaCode: team?.fifa_code ?? '—',
              country: team?.name ?? '—',
              voto_base: score?.voto_base ?? null,
              football_bonus: score?.football_bonus ?? 0,
              football_malus: score?.football_malus ?? 0,
              mvp_bonus_amount: score?.mvp_bonus_amount ?? 0,
              popularity_penalty_amount: score?.popularity_penalty_amount ?? 0,
              ownership_pct: score?.ownership_pct ?? 0,
              final_score: score?.final_score ?? 0,
            }
          })
          .sort((a, b) => {
            const order = ['P', 'D', 'C', 'A']
            return (order.indexOf(a.role) - order.indexOf(b.role)) || b.final_score - a.final_score
          })
      }
    }

    // Coach
    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('coach_id')
      .eq('phase_id', selectedRound.phase_id)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    const coachId = squad?.coach_id
    if (coachId) {
      const [coachRes, coachScoreRes] = await Promise.all([
        supabase
          .from('fm_coach')
          .select('name, fm_national_team(name, fifa_code, flag_emoji, logo_url, flag_url)')
          .eq('id', coachId)
          .single(),
        supabase
          .from('fm_coach_match_score')
          .select('match_result, team_tier, bonus_or_malus, final_score')
          .eq('scoring_round_id', roundId)
          .eq('coach_id', coachId),
      ])

      const coach = coachRes.data
      const coachScores = coachScoreRes.data ?? []
      const coachTeam = coach?.fm_national_team as { name: string; fifa_code: string; flag_emoji: string | null; logo_url: string | null; flag_url: string | null } | null

      if (coach && coachScores.length > 0) {
        const totalScore = coachScores.reduce((s, r) => s + Number(r.final_score), 0)
        const lastResult = coachScores[coachScores.length - 1]!
        myCoachRow = {
          name: coach.name,
          country: coachTeam?.name ?? '—',
          logoUrl: coachTeam?.logo_url ?? null,
          flagUrl: coachTeam?.flag_url ?? null,
          fifaCode: coachTeam?.fifa_code ?? '—',
          tier: lastResult.team_tier,
          match_result: lastResult.match_result,
          bonus_or_malus: Number(lastResult.bonus_or_malus),
          final_score: totalScore,
        }
      }
    }
  }

  // ---- summary stats ---------------------------------------------------
  const myScore = teamScores.find((t) => t.fantasy_team_id === fantasyTeamId)
  const myRank = myScore
    ? teamScores.findIndex((t) => t.fantasy_team_id === fantasyTeamId) + 1
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Risultati</h2>
        {publishedRounds.length > 1 && (
          <p className="text-[11px] text-ink-5">{publishedRounds.length} giornate</p>
        )}
      </div>

      {/* Round selector */}
      {publishedRounds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {publishedRounds.map((r) => (
            <Link
              key={r.id}
              href={`/fantamondiale/${id}/risultati?round=${r.id}` as Route}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                r.id === selectedRound.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-glass-2 text-ink-3 hover:text-ink-1 border border-hairline'
              }`}
            >
              {r.name}
            </Link>
          ))}
        </div>
      )}

      {/* My summary card (non-admin only) */}
      {fantasyTeamId && myScore && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-indigo-400 font-semibold uppercase tracking-wider mb-0.5">
                La mia giornata · {selectedRound.name}
              </p>
              <p className="text-[11px] text-ink-4">
                {myPlayerRows.length} titolari
                {myCoachRow ? ` · Allenatore: ${myCoachRow.name}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[28px] font-bold tabular-nums text-ink-1 leading-none">
                {n(myScore.raw_total, 1)}
              </p>
              <p className="text-[10px] text-ink-5 mt-0.5">
                {myScore.goals_scored} gol BR · {myRank}° posto
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Player breakdown */}
      {myPlayerRows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">Formazione</p>
          <div className="rounded-xl border border-hairline overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-hairline bg-glass-2">
                  <th className="py-2 pl-4 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4 w-6">R</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4">Giocatore</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Voto</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Bonus</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">MVP</th>
                  <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">Pen%</th>
                  <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {myPlayerRows.map((p) => {
                  const netBonus = p.football_bonus - p.football_malus
                  const hasMvp = p.mvp_bonus_amount > 0
                  const hasPenalty = p.popularity_penalty_amount > 0
                  return (
                    <tr key={p.player_id} className="hover:bg-glass-1 transition-colors">
                      <td className="py-2.5 pl-4">
                        <span className={`text-[10px] font-bold ${ROLE_COLOR[p.role] ?? 'text-ink-4'}`}>
                          {ROLE_LABEL[p.role] ?? p.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="text-[13px] font-medium text-ink-1">{p.name}</p>
                        <p className="flex items-center gap-1 text-[10px] text-ink-5">
                          <TeamCrest name={p.country} logoUrl={p.logoUrl} flagUrl={p.flagUrl} fifaCode={p.fifaCode} size={12} />
                          {p.country} · {p.ownership_pct.toFixed(0)}%
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[12px] text-ink-2">
                        {p.voto_base != null ? n(p.voto_base) : <span className="text-ink-5">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[12px]">
                        <span className={netBonus > 0 ? 'text-emerald-400' : netBonus < 0 ? 'text-rose-400' : 'text-ink-4'}>
                          {netBonus > 0 ? '+' : ''}{n(netBonus)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[12px] hidden sm:table-cell">
                        {hasMvp ? (
                          <span className="text-amber-400">+{n(p.mvp_bonus_amount)}</span>
                        ) : (
                          <span className="text-ink-5">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[12px] hidden sm:table-cell">
                        {hasPenalty ? (
                          <span className="text-rose-400">−{n(p.popularity_penalty_amount)}</span>
                        ) : (
                          <span className="text-ink-5">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-[13px] font-semibold text-ink-1">
                        {n(p.final_score)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {myScore && (
                <tfoot>
                  <tr className="border-t border-hairline-strong bg-glass-2">
                    <td colSpan={2} className="py-2 pl-4 text-[11px] font-semibold text-ink-3">Giocatori</td>
                    <td colSpan={4} />
                    <td className="py-2 pr-4 text-right text-[13px] font-bold tabular-nums text-ink-1">
                      {n(myScore.player_total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Coach */}
      {myCoachRow && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">Allenatore</p>
          <div className="rounded-xl border border-hairline bg-glass-1 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TeamCrest name={myCoachRow.country} logoUrl={myCoachRow.logoUrl} flagUrl={myCoachRow.flagUrl} fifaCode={myCoachRow.fifaCode} size={28} />
                <div>
                  <p className="text-[13px] font-semibold text-ink-1">{myCoachRow.name}</p>
                  <p className="text-[10px] text-ink-5">{myCoachRow.country} · {myCoachRow.tier.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${resultColor(myCoachRow.match_result, true)}`}>
                  {myCoachRow.match_result === 'home_win' ? 'Vittoria' : myCoachRow.match_result === 'away_win' ? 'Sconfitta' : 'Pareggio'}
                </span>
                <p className="text-[18px] font-bold tabular-nums text-ink-1 w-12 text-right">
                  {myCoachRow.bonus_or_malus > 0 ? '+' : ''}{n(myCoachRow.final_score)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BR matchups */}
      {myMatchups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">Scontri Battle Royale</p>
          <div className="rounded-xl border border-hairline overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-glass-2">
                  <th className="py-2 pl-4 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4">Avversario</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4">Gol</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4">Ris.</th>
                  <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Punti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {myMatchups.map((m, i) => {
                  const isTeamA = m.team_a_id === fantasyTeamId
                  const opponentId = isTeamA ? m.team_b_id : m.team_a_id
                  const myGoals = isTeamA ? m.team_a_goals : m.team_b_goals
                  const theirGoals = isTeamA ? m.team_b_goals : m.team_a_goals
                  const myPoints = isTeamA ? m.team_a_points : m.team_b_points
                  const isHome = isTeamA ? m.result !== 'away_win' : m.result === 'away_win'
                  const res = isTeamA
                    ? m.result === 'home_win' ? 'V' : m.result === 'away_win' ? 'P' : 'N'
                    : m.result === 'away_win' ? 'V' : m.result === 'home_win' ? 'P' : 'N'
                  const resColor = res === 'V' ? 'text-emerald-400 bg-emerald-400/10' : res === 'P' ? 'text-rose-400 bg-rose-400/10' : 'text-amber-400 bg-amber-400/10'
                  return (
                    <tr key={i} className="hover:bg-glass-1 transition-colors">
                      <td className="py-2.5 pl-4 text-[13px] font-medium text-ink-1">
                        {teamMap.get(opponentId) ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-ink-2">
                        {myGoals} – {theirGoals}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${resColor}`}>{res}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[13px] font-semibold tabular-nums text-ink-1">{myPoints}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Round comparison grid (all teams) */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">
          Classifica giornata · {selectedRound.name}
        </p>
        {teamScores.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-glass-1 px-4 py-6 text-center text-[12px] text-ink-5">
            Nessun punteggio ancora calcolato.
          </div>
        ) : (
          <div className="rounded-xl border border-hairline overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-glass-2">
                  <th className="py-2 pl-4 text-left text-[10px] font-semibold uppercase tracking-widest text-ink-4">Squadra</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">Gol</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">V/N/P</th>
                  <th className="py-2 px-3 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-4 hidden sm:table-cell">BR</th>
                  <th className="py-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-ink-4">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {teamScores.map((row, i) => {
                  const isMe = row.fantasy_team_id === fantasyTeamId
                  return (
                    <tr
                      key={row.fantasy_team_id}
                      className={`transition-colors ${isMe ? 'bg-indigo-500/5' : 'hover:bg-glass-1'}`}
                    >
                      <td className="py-2.5 pl-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-ink-5 tabular-nums w-4">{i + 1}</span>
                          <span className={`text-[13px] font-medium ${isMe ? 'text-indigo-400' : 'text-ink-1'}`}>
                            {teamMap.get(row.fantasy_team_id) ?? '—'}
                          </span>
                          {isMe && <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">tu</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] tabular-nums text-ink-3 hidden sm:table-cell">
                        {row.goals_scored}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[11px] tabular-nums text-ink-4 hidden sm:table-cell">
                        <span className="text-emerald-400">{row.br_wins}</span>
                        <span className="text-ink-5">/</span>
                        <span className="text-amber-400">{row.br_draws}</span>
                        <span className="text-ink-5">/</span>
                        <span className="text-rose-400">{row.br_losses}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-[12px] font-semibold tabular-nums text-ink-2 hidden sm:table-cell">
                        {row.br_points}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[14px] font-semibold tabular-nums text-ink-1">
                        {n(row.raw_total, 1)}
                      </td>
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
