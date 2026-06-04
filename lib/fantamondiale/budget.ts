// ============================================================
// FantaMondiale — per-phase budget resolver
// ============================================================
// Each phase carries its own budget via fm_phase.budget_config
// (validated by fmPhaseBudgetConfigSchema). The budget rises as
// the tournament narrows because the surviving player pool loses
// its cheap filler — the calibration keeps a constant ~75-credit
// "slack" above the cheapest legal 25-man rosa, so the star-
// stacking ceiling stays identical from the group stage to the
// final. See listone_mondiale_2026_analysis.md (§ budget
// progression) for the derivation.
//
//   fixed                 -> { mode: 'fixed', budget }
//   reward_leaders/comeback -> { mode, budget_by_rank: [1st, 2nd, …] }
//
// When a phase has no usable config we fall back to the league's
// squad.budget_default.
// ============================================================

import type { Json } from '@/types/database.types'

type PhaseBudgetConfig = {
  mode?: string
  budget?: number
  budget_by_rank?: number[]
}

/**
 * Resolve the credit budget for a phase.
 * @param budgetConfig fm_phase.budget_config JSON
 * @param fallback     squad.budget_default
 * @param rank         0-based standing (0 = leader); used by rank-based modes
 */
export function resolvePhaseBudget(
  budgetConfig: Json | null | undefined,
  fallback: number,
  rank?: number,
): number {
  const cfg = (budgetConfig ?? null) as PhaseBudgetConfig | null
  if (cfg) {
    if (Array.isArray(cfg.budget_by_rank) && cfg.budget_by_rank.length > 0) {
      const i = Math.max(0, Math.min(rank ?? 0, cfg.budget_by_rank.length - 1))
      const v = cfg.budget_by_rank[i]
      if (typeof v === 'number') return v
    }
    if (typeof cfg.budget === 'number') return cfg.budget
  }
  return fallback
}
