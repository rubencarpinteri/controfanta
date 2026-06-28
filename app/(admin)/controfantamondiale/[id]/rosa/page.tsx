import { requireFMContext, getFMPhases, getFMTeams, getFMPlayers, getFMCoaches } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfigForLega } from '@/lib/fantamondiale/loadUnifiedConfig'
import { getLegaPhaseSettings } from '@/lib/fantamondiale/server'
import { resolvePhaseBudget } from '@/lib/fantamondiale/budget'
import { SquadBuilder } from './SquadBuilder'

export default async function RosaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const phases = await getFMPhases(ctx.competition.id)

  // Find the active phase (open) or most recent completed phase
  const activePhase =
    phases.find((p) => p.status === 'open') ??
    phases.filter((p) => p.status === 'completed').at(-1) ??
    phases[0] ?? null

  if (!activePhase) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-1">La Mia Rosa</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">
            La rosa si costruisce a inizio di ogni Fase, con il budget di quella fase.
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center space-y-2">
          <p className="text-[14px] text-ink-3">Nessuna fase disponibile.</p>
          <p className="text-[11px] text-ink-5">
            La rosa non può essere creata finché un&apos;amministratrice non apre una fase
            (status &ldquo;open&rdquo;) con i prezzi caricati.
          </p>
          {ctx.isSuperAdmin && (
            <div className="pt-2 flex items-center justify-center gap-2">
              <a
                href={`/controfantamondiale/${id}/phases`}
                className="rounded-lg border border-hairline bg-glass-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-glass-3 transition-colors"
              >
                Vai a Fasi fantasy →
              </a>
              <a
                href={`/controfantamondiale/${id}/prices`}
                className="rounded-lg border border-hairline bg-glass-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-glass-3 transition-colors"
              >
                Carica prezzi →
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  const config = await loadFMUnifiedConfigForLega(supabase, ctx.legaCompetition.id)
  // Budget is per-phase AND per-Lega: each league sets its own budget/redraft
  // cadence. It grows as the tournament narrows to keep the same squad-building
  // tension every round.
  const phaseSettings = await getLegaPhaseSettings(supabase, ctx.legaCompetition.id, activePhase.id)
  const budgetTotal = resolvePhaseBudget(
    phaseSettings?.budget_config ?? activePhase.budget_config,
    config.squad.budget_default,
  )

  // Load fantasy team for this user in the active phase
  const fantasyTeamId = ctx.fantasyTeamId
  let squadId: string | null = null
  let squadPlayerIds = new Set<string>()
  let coachId: string | null = null
  let budgetSpent = 0

  if (fantasyTeamId) {
    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('id, budget_spent, coach_id')
      .eq('phase_id', activePhase.id)
      .eq('fantasy_team_id', fantasyTeamId)
      .maybeSingle()

    if (squad) {
      squadId = squad.id
      budgetSpent = squad.budget_spent
      coachId = squad.coach_id ?? null

      const { data: squadPlayers } = await supabase
        .from('fm_phase_squad_player')
        .select('player_id')
        .eq('phase_squad_id', squad.id)
      squadPlayerIds = new Set((squadPlayers ?? []).map((sp) => sp.player_id))
    }
  }

  // Rosa freezes once the FIRST round of the phase has locked — from then on
  // only the formazione changes per round (MD2/MD3), never the squad. Mirrors
  // the server guard in toggleSquadPlayerAction.
  const { data: lockedRoundRows } = await supabase
    .from('fm_scoring_round')
    .select('id')
    .eq('phase_id', activePhase.id)
    .in('status', ['locked', 'scoring', 'published'])
    .limit(1)
  const stageStarted = (lockedRoundRows?.length ?? 0) > 0

  // For admins viewing without a team: show all players but read-only
  const isReadOnly = !ctx.fantasyTeamId || activePhase.status !== 'open' || stageStarted

  const isKnockout = activePhase.kind !== 'group_stage'
  const [teams, players, coaches] = await Promise.all([
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id, { activeOnly: true, activeTeamsOnly: isKnockout }),
    getFMCoaches(ctx.competition.id, { activeTeamsOnly: isKnockout }),
  ])

  // ── Knockout extras: group-stage scores + R32 opponent per player ─────────
  // Only fetched for knockout phases; group stage shows neither.
  let playerGroupScores: Map<string, (number | null)[]> | undefined
  let teamR32Opponent: Map<string, string> | undefined

  if (isKnockout) {
    // Group stage rounds (ordered) — source of the 3 past scores
    const { data: gsPhaseRow } = await supabase
      .from('fm_phase')
      .select('id')
      .eq('competition_id', ctx.competition.id)
      .eq('kind', 'group_stage')
      .maybeSingle()

    const [gsRoundsRes, r32MatchesRes] = await Promise.all([
      gsPhaseRow
        ? supabase
            .from('fm_scoring_round')
            .select('id, display_order')
            .eq('phase_id', gsPhaseRow.id)
            .order('display_order')
        : Promise.resolve({ data: [] }),
      // R32 scoring round — first (only) round in the active phase
      supabase
        .from('fm_scoring_round')
        .select('id')
        .eq('phase_id', activePhase.id)
        .order('display_order')
        .limit(1)
        .maybeSingle()
        .then(async (res) => {
          if (!res.data) return { data: [] }
          return supabase
            .from('fm_real_match')
            .select('home_team_id, away_team_id')
            .eq('scoring_round_id', res.data.id)
        }),
    ])

    const gsRoundIds = (gsRoundsRes.data ?? []).map((r: { id: string }) => r.id)

    // Fetch all player ratings for the 3 group stage rounds.
    // Use fm_player_match_stats (one row per player per real match, all players)
    // rather than fm_player_match_score (only owned players). Join through
    // fm_real_match to resolve scoring_round_id.
    if (gsRoundIds.length > 0) {
      const { data: matchRows } = await supabase
        .from('fm_real_match')
        .select('id, scoring_round_id')
        .in('scoring_round_id', gsRoundIds)
      const roundByMatch = new Map(
        (matchRows ?? []).map((m: { id: string; scoring_round_id: string }) => [m.id, m.scoring_round_id])
      )
      const matchIds = (matchRows ?? []).map((m: { id: string }) => m.id)

      playerGroupScores = new Map()
      if (matchIds.length > 0) {
        const { data: statRows } = await supabase
          .from('fm_player_match_stats')
          .select('player_id, real_match_id, rating')
          .in('real_match_id', matchIds)

        for (const row of statRows ?? []) {
          const roundId = roundByMatch.get(row.real_match_id)
          if (!roundId) continue
          const idx = gsRoundIds.indexOf(roundId)
          if (idx === -1) continue
          if (!playerGroupScores.has(row.player_id)) {
            playerGroupScores.set(row.player_id, [null, null, null])
          }
          const arr = playerGroupScores.get(row.player_id)!
          arr[idx] = row.rating as number
        }
      }
    }

    // Build teamId → opponent fifa_code for the R32
    const r32Matches = (r32MatchesRes.data ?? []) as { home_team_id: string; away_team_id: string }[]
    if (r32Matches.length > 0) {
      const teamIds = new Set<string>()
      for (const m of r32Matches) {
        if (m.home_team_id) teamIds.add(m.home_team_id)
        if (m.away_team_id) teamIds.add(m.away_team_id)
      }
      const { data: teamFifaCodes } = await supabase
        .from('fm_national_team')
        .select('id, fifa_code')
        .in('id', Array.from(teamIds))
      const codeByTeam = new Map((teamFifaCodes ?? []).map((t: { id: string; fifa_code: string }) => [t.id, t.fifa_code]))
      teamR32Opponent = new Map()
      for (const m of r32Matches) {
        if (m.home_team_id && m.away_team_id) {
          teamR32Opponent.set(m.home_team_id, codeByTeam.get(m.away_team_id) ?? '')
          teamR32Opponent.set(m.away_team_id, codeByTeam.get(m.home_team_id) ?? '')
        }
      }
    }
  }

  // Competition-level frozen coach tiers (shown next to each coach so managers
  // can weigh favoredness when picking an allenatore).
  const { data: tierRows } = await supabase
    .from('fm_competition_coach_tier')
    .select('coach_id, tier')
    .eq('competition_id', ctx.competition.id)
  const coachTiers: Record<string, string> = Object.fromEntries(
    (tierRows ?? []).map((r) => [r.coach_id, r.tier])
  )

  // Load price map for active phase. PostgREST caps each response at 1000
  // rows (db-max-rows) and the WC pool is ~1250 players, so we MUST page
  // through or alphabetically-late nations silently lose their prices.
  const PRICE_PAGE = 1000
  const priceMap = new Map<string, number>()
  for (let from = 0; ; from += PRICE_PAGE) {
    const { data: priceRows } = await supabase
      .from('fm_league_phase_player_price')
      .select('player_id, price')
      .eq('league_competition_id', ctx.legaCompetition.id)
      .eq('phase_id', activePhase.id)
      .range(from, from + PRICE_PAGE - 1)
    const batch = priceRows ?? []
    for (const r of batch) priceMap.set(r.player_id, r.price)
    if (batch.length < PRICE_PAGE) break
  }

  const phaseStatusLabel =
    activePhase.status === 'open'
      ? { text: 'Aperta', cls: 'cf-pill-open' }
      : activePhase.status === 'locked'
      ? { text: 'Chiusa', cls: 'cf-pill-locked' }
      : { text: activePhase.name, cls: '' }

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
            {activePhase.name} · Mondiale
          </p>
          <span className={`cf-pill ${phaseStatusLabel.cls}`}>
            {activePhase.status === 'open' && <span className="dot" />}
            {phaseStatusLabel.text}
          </span>
        </div>
        <h1
          className="font-semibold tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(26px, 7vw, 32px)', lineHeight: 1.12, letterSpacing: '-0.03em' }}
        >
          La mia <span className="serif text-ink-3">rosa</span>
        </h1>
      </header>

      {isReadOnly && activePhase.status !== 'open' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-600 dark:text-amber-300">
          La rosa è chiusa — puoi solo visualizzarla.
        </div>
      )}

      {isReadOnly && activePhase.status === 'open' && stageStarted && ctx.fantasyTeamId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[13px] text-amber-600 dark:text-amber-300">
          La rosa è bloccata: la fase è iniziata. In questa fase puoi cambiare solo la
          formazione di giornata, non la rosa.
        </div>
      )}

      <SquadBuilder
        competitionId={id}
        phase={activePhase}
        teams={teams}
        players={players}
        coaches={coaches}
        coachTiers={coachTiers}
        priceMap={priceMap}
        selectedPlayerIds={squadPlayerIds}
        selectedCoachId={coachId}
        budgetTotal={budgetTotal}
        budgetSpent={budgetSpent}
        poolSize={config.squad.pool_size}
        roleQuotas={config.squad.role_quotas}
        isReadOnly={isReadOnly}
        isSuperAdmin={ctx.isSuperAdmin}
        playerGroupScores={playerGroupScores}
        teamR32Opponent={teamR32Opponent}
      />
    </div>
  )
}
