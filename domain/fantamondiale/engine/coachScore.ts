import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'
import { computeFavoredness, favorednessKey } from '@/domain/fantamondiale/config/schema'
import type { FMEngineCoachInput, FMCoachMatchScoreResult } from './types'

function resolveMatchResult(
  nationalTeamId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): 'home_win' | 'draw' | 'away_win' | null {
  const isHome = nationalTeamId === homeTeamId
  const isAway = nationalTeamId === awayTeamId
  if (!isHome && !isAway) return null

  if (homeScore > awayScore) return 'home_win'
  if (homeScore < awayScore) return 'away_win'
  return 'draw'
}

export function scoreCoach(
  input: FMEngineCoachInput,
  config: FMCompetitionConfig,
): FMCoachMatchScoreResult | null {
  const { matchContext, nationalTeamId, tier, opponentTier, isKnockout, coachId } = input

  const result = resolveMatchResult(
    nationalTeamId,
    matchContext.home_team_id,
    matchContext.away_team_id,
    matchContext.home_score,
    matchContext.away_score,
  )

  if (!result) return null

  // 'advancer_wins' knockout mode: a level tie has no draw. The team that
  // advanced (penalty-shootout winner, recorded on the match result) scores a
  // win, the other a loss. Only a true level result is remapped; a decisive
  // 90/120-min result already carries the right winner. Unknown advancer (e.g.
  // a live shootout not yet settled) falls back to the draw column.
  let effectiveResult = result
  if (
    isKnockout &&
    config.coach_knockout_draw_mode === 'advancer_wins' &&
    result === 'draw' &&
    (matchContext.result === 'home_win' || matchContext.result === 'away_win')
  ) {
    effectiveResult = matchContext.result
  }

  // Knockout rounds (round of 32 onward) score on *favoredness* —
  // own tier relative to the opponent's tier. The group stage, and any
  // knockout match where the opponent tier can't be resolved, fall back
  // to the absolute group matrix.
  const tierRow =
    isKnockout && opponentTier
      ? config.coach_tier_knockout_matrix[favorednessKey(computeFavoredness(tier, opponentTier))]
      : config.coach_tier_matrix[tier]

  let bonus_or_malus: number
  if (effectiveResult === 'home_win') {
    const isHome = nationalTeamId === matchContext.home_team_id
    bonus_or_malus = isHome ? tierRow.win : tierRow.loss
  } else if (effectiveResult === 'away_win') {
    const isAway = nationalTeamId === matchContext.away_team_id
    bonus_or_malus = isAway ? tierRow.win : tierRow.loss
  } else {
    bonus_or_malus = tierRow.draw
  }

  return {
    scoring_round_id: matchContext.scoring_round_id,
    real_match_id: matchContext.real_match_id,
    coach_id: coachId,
    team_tier: tier,
    match_result: effectiveResult,
    bonus_or_malus,
    final_score: bonus_or_malus,
    calc_snapshot: config,
  }
}
