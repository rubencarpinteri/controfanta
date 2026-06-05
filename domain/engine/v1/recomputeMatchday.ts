// ============================================================
// domain/engine/v1/recomputeMatchday.ts
// ============================================================
// Pure orchestrator: takes raw matchday data + engine config + result
// rules, produces every downstream artefact (player calcs, team
// totals, competition fixtures + standings) WITHOUT touching the DB.
//
// Used by:
//   - The playground page (live simulation, no persistence)
//   - The /api/recompute-all endpoint (after which the result is
//     persisted in a single transaction)
//
// Pure means:
//   - No Supabase calls
//   - No `revalidatePath`
//   - No `Date.now()` / random
//   - Same input → same output, every time
// ============================================================

import { computeMatchday } from './engine'
import { computeTeamScores } from '@/lib/engine/teamScores'
import { computeRound } from '@/domain/competitions/computeRound'
import type { EngineConfig, EnginePlayerInput, PlayerEngineOutput, PlayerCalculationResult } from './types'
import type { ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { ScoringConfig } from '@/domain/competitions/computeRound'
import type {
  LineupPlayer,
  SlotRoles,
  TeamScoreResult,
  PlayerScoreEntry,
} from '@/lib/engine/teamScores'
import type {
  FixtureInput,
  FixtureResult as CompetitionFixtureResult,
  TeamStandingRow,
} from '@/domain/competitions/computeRound'

// ---- Input shapes ------------------------------------------

/** A single active score override (manager-applied fudge on top of engine output). */
export interface ScoreOverrideInput {
  player_id: string
  override_fantavoto: number
}

/** One competition's slice of the work for this matchday. */
export interface CompetitionRoundInput {
  competition_id: string
  /** Round inside this competition that maps to the matchday being recomputed. */
  round_id: string
  /** All fixtures for the round (5 for Campionato, 45 for Battle Royal). */
  fixtures: FixtureInput[]
  /** Standings carried over from prior rounds (empty array for round 1). */
  priorStandings: TeamStandingRow[]
  /** Optional per-competition override of league result_rules. Falls back to default. */
  scoringOverride?: Partial<ScoringConfig>
  /** Field order for tiebreaker sorting. */
  tiebreakerOrder: string[]
}

/** Everything the orchestrator needs to do its work. */
export interface RecomputeInput {
  engineConfig: EngineConfig
  resultRules: ResultRulesConfig
  /** Raw player stats fed to the engine. */
  playerStats: EnginePlayerInput[]
  /** Active overrides keyed by player_id. */
  overrides: ScoreOverrideInput[]
  /** Lineup roster for this matchday, derived from current pointers. */
  lineupPlayers: LineupPlayer[]
  /** submission_id → team_id map (one entry per submission referenced in lineupPlayers). */
  submissionTeamMap: Map<string, string>
  /** slot_id → { native, extended } role lists. */
  slotRolesMap: Map<string, SlotRoles>
  /** Optional rounding to apply to fantavoto values (mirrors leagues.display_rounding). */
  applyDisplayRounding?: (value: number) => number
  /** Per-active-competition slice. Empty for matchdays with no active competitions. */
  competitions: CompetitionRoundInput[]
}

// ---- Output shapes -----------------------------------------

/** Player-level engine output with override flag attached. */
export interface PlayerCalcArtefact {
  output: PlayerEngineOutput
  is_override: boolean
  override_player_id_match: string | null
  /** Final fantavoto after override (null for skipped/NV). */
  effective_fantavoto: number | null
}

export interface CompetitionRoundResult {
  competition_id: string
  round_id: string
  fixtures: CompetitionFixtureResult[]
  standings: TeamStandingRow[]
}

export interface RecomputeOutput {
  /** Per-player engine results with override status. */
  playerCalculations: PlayerCalcArtefact[]
  /** Team totals after bench substitution. */
  teamScores: TeamScoreResult[]
  /** Per-player team-side breakdown (starter/bench/sub status). */
  playerScores: PlayerScoreEntry[]
  /** Per-competition fixture + standings results. */
  competitionResults: CompetitionRoundResult[]
  /**
   * Player IDs that received Immunità this matchday (appeared in exactly one
   * effective lineup across the league). Subset may have no cards — the badge
   * still shows; the scoring impact is only when cards > 0.
   */
  immunitaGrantedIds: string[]
}

// ---- Main ---------------------------------------------------

export function recomputeMatchday(input: RecomputeInput): RecomputeOutput {
  // 1. Pass 1 — run engine on every player without immunity
  const engineResult = computeMatchday(input.playerStats, input.engineConfig)

  // 2. Apply active overrides to per-player fantavoto
  const overrideMap = new Map(input.overrides.map((o) => [o.player_id, o.override_fantavoto]))
  let playerCalculations: PlayerCalcArtefact[] = engineResult.player_results.map((output) => {
    const ov = overrideMap.get(output.player_id)
    if (output.kind === 'skipped') {
      return {
        output,
        is_override: false,
        override_player_id_match: null,
        effective_fantavoto: null,
      }
    }
    if (ov !== undefined) {
      const overridden = applyDisplay(ov, input.applyDisplayRounding)
      return {
        output: { ...output, fantavoto: overridden } as PlayerCalculationResult,
        is_override: true,
        override_player_id_match: output.player_id,
        effective_fantavoto: overridden,
      }
    }
    const final = applyDisplay(output.fantavoto, input.applyDisplayRounding)
    return {
      output: { ...output, fantavoto: final } as PlayerCalculationResult,
      is_override: false,
      override_player_id_match: null,
      effective_fantavoto: final,
    }
  })

  // 3. Build fantaVotoMap (player_id → effective fantavoto, null for NV)
  const fantaVotoMap = new Map<string, number | null>()
  for (const pc of playerCalculations) {
    fantaVotoMap.set(pc.output.player_id, pc.effective_fantavoto)
  }

  // 4. Pass 1 bench substitution — needed to resolve who actually played
  const pass1Scores = computeTeamScores({
    lineupPlayers: input.lineupPlayers,
    submissionTeamMap: input.submissionTeamMap,
    slotRolesMap: input.slotRolesMap,
    fantaVotoMap,
  })

  // 5. Immunità — count effective lineup appearances per player across the league.
  //    Effective lineup = sub_status 'active' (titolare who played) or 'bench_used'
  //    (bench player who subbed in). Players appearing in exactly 1 effective lineup
  //    are granted Immunità (card malus waived).
  const effectiveCount = new Map<string, number>()
  for (const ps of pass1Scores.playerScores) {
    if (ps.sub_status === 'active' || ps.sub_status === 'bench_used') {
      effectiveCount.set(ps.player_id, (effectiveCount.get(ps.player_id) ?? 0) + 1)
    }
  }

  const immunitaGrantedIds: string[] = []
  for (const ps of pass1Scores.playerScores) {
    if (
      (ps.sub_status === 'active' || ps.sub_status === 'bench_used') &&
      effectiveCount.get(ps.player_id) === 1
    ) {
      immunitaGrantedIds.push(ps.player_id)
    }
  }

  const immunitaSet = new Set(immunitaGrantedIds)

  // 6. Pass 2 — recompute scores for immune players who have cards.
  //    Manual overrides are left untouched (manager's explicit decision takes precedence).
  const immunitaWithCards = input.playerStats.filter(
    (s) =>
      immunitaSet.has(s.player_id) &&
      (s.yellow_cards > 0 || s.red_cards > 0) &&
      !overrideMap.has(s.player_id)
  )

  if (immunitaWithCards.length > 0) {
    const immuneInputs = immunitaWithCards.map((s) => ({ ...s, immunita_granted: true }))
    const immuneResults = computeMatchday(immuneInputs, input.engineConfig)
    const immuneResultMap = new Map(immuneResults.player_results.map((r) => [r.player_id, r]))

    playerCalculations = playerCalculations.map((pc) => {
      const immuneResult = immuneResultMap.get(pc.output.player_id)
      if (!immuneResult || immuneResult.kind === 'skipped') return pc
      const final = applyDisplay(immuneResult.fantavoto, input.applyDisplayRounding)
      fantaVotoMap.set(immuneResult.player_id, final)
      return {
        output: { ...immuneResult, fantavoto: final } as PlayerCalculationResult,
        is_override: false,
        override_player_id_match: null,
        effective_fantavoto: final,
      }
    })
  }

  // 7. Final bench substitution with updated fantaVotoMap
  const { teamScores, playerScores } = computeTeamScores({
    lineupPlayers: input.lineupPlayers,
    submissionTeamMap: input.submissionTeamMap,
    slotRolesMap: input.slotRolesMap,
    fantaVotoMap,
  })

  // 8. Build team_id → total fantavoto map for competition computation
  const teamFantavotoMap = new Map<string, number>()
  for (const ts of teamScores) {
    teamFantavotoMap.set(ts.team_id, ts.total_fantavoto)
  }

  // 9. Compute each active competition's round
  const competitionResults: CompetitionRoundResult[] = input.competitions.map((comp) => {
    const cfg: ScoringConfig = {
      method: 'goal_thresholds',
      thresholds: input.resultRules.thresholds,
      smoothing: input.resultRules.smoothing,
      points: input.resultRules.points,
      ...(comp.scoringOverride ?? {}),
    }
    const round = computeRound(
      comp.fixtures,
      teamFantavotoMap,
      cfg,
      comp.priorStandings,
      comp.tiebreakerOrder
    )
    return {
      competition_id: comp.competition_id,
      round_id: comp.round_id,
      fixtures: round.fixtures,
      standings: round.standings,
    }
  })

  return { playerCalculations, teamScores, playerScores, competitionResults, immunitaGrantedIds }
}

// ---- Helpers ------------------------------------------------

function applyDisplay(value: number, fn: ((v: number) => number) | undefined): number {
  return fn ? fn(value) : value
}
