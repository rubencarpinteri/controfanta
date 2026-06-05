import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'

const ROLE_COLORS: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const

type PlayerMeta = {
  id: string
  name: string
  role: string
  fm_national_team: { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null } | null
}

export default async function SchieramentiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const rounds = await getFMRounds(ctx.competition.id)
  // The round currently in play (or most recently scored).
  const activeRound =
    rounds.find((r) => r.status === 'locked') ??
    rounds.find((r) => r.status === 'scoring') ??
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'published') ??
    null

  const header = (
    <div>
      <h2 className="text-[16px] font-semibold text-ink-1">Schieramenti</h2>
      <p className="mt-0.5 text-[11px] text-ink-4">
        Titolari e panchine di tutte le squadre — pubblici dal primo calcio d&apos;inizio.
      </p>
    </div>
  )

  if (!activeRound) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
          <p className="text-[14px] text-ink-3">Nessun turno attivo al momento.</p>
        </div>
      </div>
    )
  }

  // ── Reveal gate: only after the first official match has kicked off ──
  const { data: matches } = await supabase
    .from('fm_real_match')
    .select('kickoff_at')
    .eq('scoring_round_id', activeRound.id)

  const kickoffs = (matches ?? [])
    .map((m) => new Date(m.kickoff_at).getTime())
    .filter((n) => !Number.isNaN(n))
  const firstKickoff = kickoffs.length > 0 ? Math.min(...kickoffs) : null
  const revealed = firstKickoff !== null && Date.now() >= firstKickoff

  if (!revealed) {
    const when =
      firstKickoff !== null
        ? new Date(firstKickoff).toLocaleString('it-IT', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <p className="text-[14px] font-semibold text-amber-300">Schieramenti nascosti</p>
          <p className="mt-1 text-[12px] text-ink-3">
            Diventano pubblici al calcio d&apos;inizio della prima partita ufficiale di {activeRound.name}.
          </p>
          {when && <p className="mt-2 text-[12px] text-ink-2 tabular-nums">Primo fischio: {when}</p>}
        </div>
      </div>
    )
  }

  // ── Revealed: load every team's submitted lineup in this Lega ──
  const { data: teams } = await supabase
    .from('fm_fantasy_team')
    .select('id, name')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .order('name', { ascending: true })

  const teamIds = (teams ?? []).map((t) => t.id)

  const { data: lineups } = await supabase
    .from('fm_matchday_lineup')
    .select('fantasy_team_id, formation, fm_matchday_lineup_player(player_id, is_starter, bench_order)')
    .eq('scoring_round_id', activeRound.id)
    .in('fantasy_team_id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])
    .not('submitted_at', 'is', null)

  const allPlayerIds = [
    ...new Set((lineups ?? []).flatMap((l) => l.fm_matchday_lineup_player.map((p) => p.player_id))),
  ]

  const { data: playersData } = await supabase
    .from('fm_player')
    .select('id, name, role, fm_national_team(name, fifa_code, logo_url, flag_url)')
    .in('id', allPlayerIds.length > 0 ? allPlayerIds : ['00000000-0000-0000-0000-000000000000'])

  const playerById = new Map<string, PlayerMeta>(
    (playersData ?? []).map((p) => [p.id, p as PlayerMeta])
  )
  const lineupByTeam = new Map((lineups ?? []).map((l) => [l.fantasy_team_id, l]))

  // Each team's coach for this phase (fixed at squad time) + its frozen tier.
  type CoachMeta = {
    name: string
    team: { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null } | null
    tier: string | null
  }
  const coachByTeam = new Map<string, CoachMeta>()
  const { data: squads } = await supabase
    .from('fm_phase_squad')
    .select('fantasy_team_id, coach_id')
    .eq('phase_id', activeRound.phase_id)
    .in('fantasy_team_id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])
    .not('coach_id', 'is', null)

  const coachIds = [...new Set((squads ?? []).map((s) => s.coach_id).filter((c): c is string => !!c))]
  if (coachIds.length > 0) {
    const [coachRows, tierRows] = await Promise.all([
      supabase
        .from('fm_coach')
        .select('id, name, fm_national_team(name, fifa_code, logo_url, flag_url)')
        .in('id', coachIds),
      supabase
        .from('fm_competition_coach_tier')
        .select('coach_id, tier')
        .eq('competition_id', ctx.competition.id)
        .in('coach_id', coachIds),
    ])
    const tierByCoach = new Map((tierRows.data ?? []).map((r) => [r.coach_id, r.tier]))
    const coachInfo = new Map(
      (coachRows.data ?? []).map((c) => [
        c.id,
        {
          name: c.name,
          team: (c.fm_national_team as CoachMeta['team']) ?? null,
          tier: tierByCoach.get(c.id) ?? null,
        } as CoachMeta,
      ])
    )
    for (const s of squads ?? []) {
      if (s.coach_id && coachInfo.has(s.coach_id)) {
        coachByTeam.set(s.fantasy_team_id, coachInfo.get(s.coach_id)!)
      }
    }
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(teams ?? []).map((team) => {
          const lineup = lineupByTeam.get(team.id)
          const coach = coachByTeam.get(team.id)
          const isMine = team.id === ctx.fantasyTeamId

          const starters = (lineup?.fm_matchday_lineup_player ?? []).filter((p) => p.is_starter)
          const benchRows = (lineup?.fm_matchday_lineup_player ?? [])
            .filter((p) => !p.is_starter)
            .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))

          const startersByRole = ROLE_ORDER.map((role) => ({
            role,
            players: starters
              .map((s) => playerById.get(s.player_id))
              .filter((p): p is PlayerMeta => !!p && p.role === role),
          }))

          return (
            <div
              key={team.id}
              className={`rounded-xl border bg-glass-1 overflow-hidden ${
                isMine ? 'border-indigo-500/40' : 'border-hairline'
              }`}
            >
              <div className="flex items-center gap-2 px-4 py-2.5 bg-glass-2 border-b border-hairline">
                <span className="flex-1 text-[13px] font-semibold text-ink-1 truncate">{team.name}</span>
                {isMine && (
                  <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
                    Tu
                  </span>
                )}
                <span className="text-[11px] font-mono text-ink-4">{lineup?.formation ?? '—'}</span>
              </div>

              {!lineup ? (
                <div className="px-4 py-4 text-[12px] text-ink-5">Formazione non inviata.</div>
              ) : (
                <div className="p-3 space-y-3">
                  {/* Allenatore */}
                  {coach && (
                    <div className="flex items-center gap-2 rounded-md border border-hairline bg-glass-2 px-2 py-1.5">
                      <span className="w-4 text-[10px] font-bold text-ink-4">CT</span>
                      <TeamCrest
                        name={coach.team?.name ?? ''}
                        logoUrl={coach.team?.logo_url ?? null}
                        flagUrl={coach.team?.flag_url ?? null}
                        fifaCode={coach.team?.fifa_code ?? ''}
                        size={14}
                        className="w-4"
                      />
                      <span className="flex-1 text-[11px] font-medium text-ink-1 truncate">{coach.name}</span>
                      <CoachTierBadge tier={coach.tier} />
                    </div>
                  )}
                  {/* Titolari */}
                  <div className="space-y-1.5">
                    {startersByRole.map(({ role, players }) =>
                      players.length === 0 ? null : (
                        <div key={role} className="flex items-start gap-2">
                          <span className={`mt-1 w-4 text-[10px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                          <div className="flex flex-1 flex-wrap gap-1.5">
                            {players.map((p) => (
                              <PlayerChip key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Panchina */}
                  <div className="border-t border-hairline pt-2.5">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-5">Panchina</p>
                    <div className="flex flex-wrap gap-1.5">
                      {benchRows.length === 0 && (
                        <span className="text-[11px] text-ink-5">—</span>
                      )}
                      {benchRows.map((b, i) => {
                        const p = playerById.get(b.player_id)
                        if (!p) return null
                        return <PlayerChip key={p.id} p={p} order={i + 1} />
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlayerChip({ p, order }: { p: PlayerMeta; order?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-glass-2 px-2 py-1 text-[11px] text-ink-2">
      {order != null && <span className="tabular-nums text-ink-5">{order}.</span>}
      <span className={`text-[9px] font-bold ${ROLE_COLORS[p.role]}`}>{p.role}</span>
      <TeamCrest
        name={p.fm_national_team?.name ?? ''}
        logoUrl={p.fm_national_team?.logo_url ?? null}
        flagUrl={p.fm_national_team?.flag_url ?? null}
        fifaCode={p.fm_national_team?.fifa_code ?? ''}
        size={14}
        className="w-4"
      />
      <span className="font-medium text-ink-1">{p.name}</span>
    </span>
  )
}
