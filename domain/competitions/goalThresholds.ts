// ============================================================
// domain/competitions/goalThresholds.ts
// ============================================================
// Pure helper: converts a team's total_fantavoto to a fantasy
// goal count using the league-configured threshold table.
//
// Thresholds are evaluated in ascending `min` order.
// The last threshold whose `min` <= fantavoto wins.
// If fantavoto is below every threshold's min (i.e., < thresholds[0].min),
// 0 goals are returned.
// ============================================================

export interface GoalThreshold {
  min: number
  goals: number
}

/**
 * Default thresholds — data-calibrated against the league's score distribution.
 * Aligns with leagues.result_rules JSON default (migration 034).
 * Admins may override per league or per competition.
 */
export const DEFAULT_MANTRA_THRESHOLDS: GoalThreshold[] = [
  { min: 0,     goals: 0  },
  { min: 64.5,  goals: 1  },
  { min: 70.5,  goals: 2  },
  { min: 76.5,  goals: 3  },
  { min: 82.5,  goals: 4  },
  { min: 88.5,  goals: 5  },
  { min: 94.5,  goals: 6  },
  { min: 100.5, goals: 7  },
  { min: 106.5, goals: 8  },
  { min: 112.5, goals: 9  },
  { min: 118.5, goals: 10 },
  { min: 124.5, goals: 11 },
  { min: 130.5, goals: 12 },
]

/**
 * Converts a team's total_fantavoto to fantasy goals.
 * Thresholds are sorted ascending by `min` internally — caller order does not matter.
 */
export function fantaVotoToGoals(
  fantavoto: number,
  thresholds: GoalThreshold[]
): number {
  const sorted = [...thresholds].sort((a, b) => a.min - b.min)
  let goals = 0
  for (const t of sorted) {
    if (fantavoto >= t.min) {
      goals = t.goals
    } else {
      break
    }
  }
  return goals
}
