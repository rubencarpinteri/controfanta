// ============================================================
// FantaMondiale lineup validation — pure, no I/O, testable.
// ============================================================
// FM uses plain player roles (P/D/C/A), not Mantra slots, so it has
// its own validator rather than reusing domain/lineup/validateLineup.ts.
//
// Rules enforced:
//   * exactly 11 starters
//   * bench must contain at least 1 of each role (P, D, C, A) — the
//     minimum disclosure; managers may add more up to the rest of the rosa
//   * no player appears twice (starter or bench)
//   * every starter/bench player belongs to the squad
// ============================================================

export type FMRole = 'P' | 'D' | 'C' | 'A'

export interface FMLineupInput {
  /** Ordered or unordered set of starter player ids. */
  starterIds: string[]
  /** Ordered bench player ids (index 0 = first priority). */
  benchIds: string[]
  /** playerId → role for every player referenced. */
  roleById: Map<string, FMRole>
  /** All player ids available in the squad for this phase. */
  squadIds: Set<string>
}

export interface FMLineupValidation {
  valid: boolean
  errors: string[]
}

const ROLE_LABELS: Record<FMRole, string> = {
  P: 'portiere',
  D: 'difensore',
  C: 'centrocampista',
  A: 'attaccante',
}

export function validateFMLineup({
  starterIds,
  benchIds,
  roleById,
  squadIds,
}: FMLineupInput): FMLineupValidation {
  const errors: string[] = []

  // ---- exactly 11 starters ----
  if (starterIds.length !== 11) {
    errors.push(`Servono esattamente 11 titolari (selezionati: ${starterIds.length}).`)
  }

  // ---- no duplicates across starters + bench ----
  const seen = new Set<string>()
  for (const id of [...starterIds, ...benchIds]) {
    if (seen.has(id)) {
      errors.push('Un giocatore non può essere sia titolare sia in panchina (o ripetuto).')
      break
    }
    seen.add(id)
  }

  // ---- all referenced players belong to the squad ----
  for (const id of [...starterIds, ...benchIds]) {
    if (!squadIds.has(id)) {
      errors.push('La formazione contiene un giocatore che non è nella tua rosa.')
      break
    }
  }

  // ---- bench: at least 1 per role ----
  const benchRoleCounts: Record<FMRole, number> = { P: 0, D: 0, C: 0, A: 0 }
  for (const id of benchIds) {
    const role = roleById.get(id)
    if (role) benchRoleCounts[role] += 1
  }
  for (const role of ['P', 'D', 'C', 'A'] as const) {
    if (benchRoleCounts[role] < 1) {
      errors.push(`La panchina deve avere almeno un ${ROLE_LABELS[role]}.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
