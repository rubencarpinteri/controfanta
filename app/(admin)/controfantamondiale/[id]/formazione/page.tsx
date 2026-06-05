import { requireFMContext, getFMPhases, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'
import { DEFAULT_FM_CONFIG } from '@/domain/fantamondiale/config/defaults'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import { LineupPicker } from './LineupPicker'

export default async function FormazionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const [phases, rounds] = await Promise.all([
    getFMPhases(ctx.competition.id),
    getFMRounds(ctx.competition.id),
  ])

  // Find active round (open or locked)
  const activeRound =
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'locked') ??
    null

  if (!activeRound) {
    return (
      <div className="space-y-4">
        <h2 className="text-[16px] font-semibold text-ink-1">Formazione</h2>
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
          <p className="text-[14px] text-ink-3">Nessun turno attivo al momento.</p>
          <p className="mt-1 text-[11px] text-ink-5">La selezione della formazione si apre con il turno.</p>
        </div>
      </div>
    )
  }

  const activePhase = phases.find((p) => p.id === activeRound.phase_id) ?? null
  const config = (ctx.config?.config as FMCompetitionConfig | null) ?? DEFAULT_FM_CONFIG

  // Load user's squad for this phase
  const fantasyTeamId = ctx.fantasyTeamId
  let squadPlayerIds: string[] = []
  let currentLineupIds = new Set<string>()
  let currentBenchIds: string[] = []
  let currentFormation: string | null = null
  let lineupId: string | null = null

  let coachId: string | null = null

  if (fantasyTeamId && activePhase) {
    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('id, coach_id')
      .eq('phase_id', activePhase.id)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    if (squad) {
      coachId = squad.coach_id ?? null
      const { data: squadPlayers } = await supabase
        .from('fm_phase_squad_player')
        .select('player_id')
        .eq('phase_squad_id', squad.id)
      squadPlayerIds = (squadPlayers ?? []).map((sp) => sp.player_id)
    }

    const { data: lineup } = await supabase
      .from('fm_matchday_lineup')
      .select('id, formation')
      .eq('scoring_round_id', activeRound.id)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    if (lineup) {
      lineupId = lineup.id
      currentFormation = lineup.formation
      const { data: lineupPlayers } = await supabase
        .from('fm_matchday_lineup_player')
        .select('player_id, is_starter, bench_order')
        .eq('lineup_id', lineup.id)
      currentLineupIds = new Set(
        (lineupPlayers ?? []).filter((lp) => lp.is_starter).map((lp) => lp.player_id)
      )
      currentBenchIds = (lineupPlayers ?? [])
        .filter((lp) => !lp.is_starter)
        .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))
        .map((lp) => lp.player_id)
    }
  }

  // Load player data for squad members
  const { data: squadPlayers } = await supabase
    .from('fm_player')
    .select('*, fm_national_team(name, fifa_code, flag_emoji, logo_url, flag_url)')
    .in('id', squadPlayerIds.length > 0 ? squadPlayerIds : ['00000000-0000-0000-0000-000000000000'])
    .order('name', { ascending: true })

  // Load the squad's coach (fixed for the phase) + its frozen tier, so it's
  // always visible here — including when the round is locked/closed.
  let coach: { name: string; team: { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null } | null; tier: string | null } | null = null
  if (coachId) {
    const [coachRes, tierRes] = await Promise.all([
      supabase
        .from('fm_coach')
        .select('name, fm_national_team(name, fifa_code, logo_url, flag_url)')
        .eq('id', coachId)
        .maybeSingle(),
      supabase
        .from('fm_competition_coach_tier')
        .select('tier')
        .eq('competition_id', ctx.competition.id)
        .eq('coach_id', coachId)
        .maybeSingle(),
    ])
    if (coachRes.data) {
      coach = {
        name: coachRes.data.name,
        team: (coachRes.data.fm_national_team as { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null } | null) ?? null,
        tier: tierRes.data?.tier ?? null,
      }
    }
  }

  const isReadOnly = !ctx.fantasyTeamId || activeRound.status !== 'open'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-1">Formazione</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">
            {activeRound.name}
            {activePhase ? ` — ${activePhase.name}` : ''}
            {activeRound.status === 'open' ? ' — aperta' : activeRound.status === 'locked' ? ' — chiusa' : ''}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          activeRound.status === 'open'
            ? 'text-emerald-400 bg-emerald-400/10'
            : 'text-amber-400 bg-amber-400/10'
        }`}>
          {activeRound.status === 'open' ? 'Aperta' : 'Chiusa'}
        </span>
      </div>

      {coach && (
        <div className="flex items-center gap-3 rounded-xl border border-hairline bg-glass-1 px-4 py-3">
          <span className="w-7 shrink-0 text-center text-[10px] font-bold uppercase tracking-wider text-ink-4">CT</span>
          <TeamCrest
            name={coach.team?.name ?? ''}
            logoUrl={coach.team?.logo_url ?? null}
            flagUrl={coach.team?.flag_url ?? null}
            fifaCode={coach.team?.fifa_code ?? ''}
            size={22}
          />
          <span className="flex-1 text-[13px] font-semibold text-ink-1 truncate">{coach.name}</span>
          <CoachTierBadge tier={coach.tier} full />
          <span className="text-[11px] text-ink-4 shrink-0">{coach.team?.name ?? '—'}</span>
        </div>
      )}

      {squadPlayerIds.length === 0 && fantasyTeamId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-400">
          Devi prima selezionare la tua rosa per questa fase. Vai alla tab Mia Rosa.
        </div>
      ) : (
        <LineupPicker
          competitionId={id}
          roundId={activeRound.id}
          fantasyTeamId={fantasyTeamId}
          players={squadPlayers ?? []}
          selectedLineupIds={currentLineupIds}
          initialBenchIds={currentBenchIds}
          initialFormation={currentFormation}
          lineupId={lineupId}
          allowedFormations={config.formations}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  )
}
