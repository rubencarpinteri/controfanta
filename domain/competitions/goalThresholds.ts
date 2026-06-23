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
  { min: 0,   goals: 0  },
  { min: 62,  goals: 1  },
  { min: 66,  goals: 2  },
  { min: 70,  goals: 3  },
  { min: 74,  goals: 4  },
  { min: 78,  goals: 5  },
  { min: 82,  goals: 6  },
  { min: 86,  goals: 7  },
  { min: 90,  goals: 8  },
  { min: 94,  goals: 9  },
  { min: 98,  goals: 10 },
  { min: 102, goals: 11 },
  { min: 106, goals: 12 },
  { min: 110, goals: 13 },
  { min: 114, goals: 14 },
  { min: 118, goals: 15 },
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
