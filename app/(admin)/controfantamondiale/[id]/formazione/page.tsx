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

  // Per-league phase prices (crediti) for the squad — drives the picker's
  // high→low ordering and the value shown on each row. Falls back to the
  // player's base_price when this Lega hasn't priced the player for the phase.
  const priceById: Record<string, number> = {}
  if (activePhase && squadPlayerIds.length > 0) {
    const { data: priceRows } = await supabase
      .from('fm_league_phase_player_price')
      .select('player_id, price')
      .eq('league_competition_id', ctx.legaCompetition.id)
      .eq('phase_id', activePhase.id)
      .in('player_id', squadPlayerIds)
    for (const r of priceRows ?? []) priceById[r.player_id] = r.price
  }
  for (const p of squadPlayers ?? []) {
    if (priceById[p.id] == null) priceById[p.id] = (p as { base_price?: number }).base_price ?? 0
  }

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

  // A team can only field a lineup once its squad is complete: full pool + coach.
  const requiredPool = config.squad.pool_size
  const squadComplete = squadPlayerIds.length >= requiredPool && coachId != null
  const missingPlayers = Math.max(0, requiredPool - squadPlayerIds.length)

  // Real-world fixtures for this scoring round — gives each national team its
  // opponent, so the picker can show "🆚 Senegal" next to every player.
  type TeamLite = { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null }
  type RoundMatch = { home_team_id: string; away_team_id: string; kickoff_at: string; home_team: TeamLite | null; away_team: TeamLite | null }
  const { data: roundMatchesRaw } = await supabase
    .from('fm_real_match')
    .select(
      'home_team_id, away_team_id, kickoff_at, ' +
        'home_team:fm_national_team!fm_real_match_home_team_id_fkey(name, fifa_code, logo_url, flag_url), ' +
        'away_team:fm_national_team!fm_real_match_away_team_id_fkey(name, fifa_code, logo_url, flag_url)'
    )
    .eq('scoring_round_id', activeRound.id)

  const roundMatches = (roundMatchesRaw ?? []) as unknown as RoundMatch[]
  const nextMatchByTeam: Record<string, { opponent: string; fifaCode: string; logoUrl: string | null; flagUrl: string | null; home: boolean; kickoff: string }> = {}
  for (const m of roundMatches) {
    if (m.away_team) nextMatchByTeam[m.home_team_id] = { opponent: m.away_team.name, fifaCode: m.away_team.fifa_code, logoUrl: m.away_team.logo_url, flagUrl: m.away_team.flag_url, home: true, kickoff: m.kickoff_at }
    if (m.home_team) nextMatchByTeam[m.away_team_id] = { opponent: m.home_team.name, fifaCode: m.home_team.fifa_code, logoUrl: m.home_team.logo_url, flagUrl: m.home_team.flag_url, home: false, kickoff: m.kickoff_at }
  }

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
            {activeRound.name}{activePhase ? ` · ${activePhase.name}` : ''}
          </p>
          <span className={`cf-pill ${activeRound.status === 'open' ? 'cf-pill-open' : 'cf-pill-locked'}`}>
            {activeRound.status === 'open' && <span className="dot" />}
            {activeRound.status === 'open' ? 'Aperta' : 'Chiusa'}
          </span>
        </div>
        <h1
          className="font-semibold tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(26px, 7vw, 32px)', lineHeight: 1.12, letterSpacing: '-0.03em' }}
        >
          La tua <span className="serif text-ink-3">formazione</span>
        </h1>
      </header>

      {coach && (
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-glass-1 px-4 py-3 backdrop-blur-xl">
          <span className="flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-md border border-hairline text-[10px] font-bold uppercase text-ink-4">CT</span>
          <TeamCrest
            name={coach.team?.name ?? ''}
            logoUrl={coach.team?.logo_url ?? null}
            flagUrl={coach.team?.flag_url ?? null}
            fifaCode={coach.team?.fifa_code ?? ''}
            size={22}
          />
          <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-1">{coach.name}</span>
          <CoachTierBadge tier={coach.tier} full />
          <span className="shrink-0 text-[12px] text-ink-4">{coach.team?.name ?? '—'}</span>
        </div>
      )}

      {fantasyTeamId && !squadComplete ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-amber-600 dark:text-amber-300">
          <p className="text-[14px] font-semibold">Squadra incompleta</p>
          <p className="mt-1 text-[13px] leading-relaxed">
            Per schierare la formazione ti servono <span className="font-semibold">{requiredPool} giocatori</span> e{' '}
            <span className="font-semibold">1 allenatore</span>.
            {missingPlayers > 0 && <> Mancano ancora {missingPlayers} giocatori.</>}
            {missingPlayers === 0 && coachId == null && <> Devi scegliere un allenatore.</>}
          </p>
          <a
            href={`/controfantamondiale/${id}/rosa`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-amber-500/20"
          >
            Completa la rosa →
          </a>
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
          nextMatchByTeam={nextMatchByTeam}
          priceById={priceById}
        />
      )}
    </div>
  )
}
