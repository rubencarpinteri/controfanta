// ============================================================
// FantaMondiale bench substitution — pure, no I/O, testable.
// ============================================================
// "Module is king": the chosen formation never reshapes. A titolare who
// "didn't play" is replaced by the FIRST same-role bench player in bench
// order. Strictly role-locked — P↔P, D↔D, C↔C, A↔A. No cross-role fallback.
// If the same-role bench is exhausted, the slot stays empty and the team
// plays short (the empty slot scores nothing).
//
// A bench player can only come on if he himself played (a bench s.v. is
// useless). "played" is derived by the caller from the league's
// substitution trigger (min_minutes vs no_rating).
// ============================================================

export type FMRole = 'P' | 'D' | 'C' | 'A'

export interface SubStarter {
  player_id: string
  role: FMRole
  /** Did this starter actually play (per the league trigger)? */
  played: boolean
}

export interface SubBench {
  player_id: string
  role: FMRole
  bench_order: number
  /** Did this bench player actually play? Only "played" subs can come on. */
  played: boolean
}

export interface FieldedPlayer {
  player_id: string
  role: FMRole
  via: 'starter' | 'sub'
  /** When via === 'sub', the starter this player replaced. */
  replaced_player_id?: string
}

export interface EmptySlot {
  role: FMRole
  /** The starter whose slot could not be filled — team plays short here. */
  starter_player_id: string
}

export interface SubstitutionResult {
  /** Players who actually contribute a score this round (≤ 11). */
  fielded: FieldedPlayer[]
  /** Unfilled slots (play short). */
  emptySlots: EmptySlot[]
  /** Bench player ids that came on. */
  benchUsed: string[]
}

/**
 * Resolve substitutions for one team.
 * @param starters in lineup order (order only matters for determinism of who
 *                 grabs a scarce bench player first).
 * @param bench    any order; sorted internally by bench_order ascending.
 */
export function applySubstitutions(
  starters: SubStarter[],
  bench: SubBench[],
): SubstitutionResult {
  const benchSorted = [...bench].sort((a, b) => a.bench_order - b.bench_order)
  const used = new Set<string>()

  const fielded: FieldedPlayer[] = []
  const emptySlots: EmptySlot[] = []

  for (const starter of starters) {
    if (starter.played) {
      fielded.push({ player_id: starter.player_id, role: starter.role, via: 'starter' })
      continue
    }

    // Find first unused, same-role bench player who actually played.
    const sub = benchSorted.find(
      (b) => !used.has(b.player_id) && b.role === starter.role && b.played,
    )

    if (sub) {
      used.add(sub.player_id)
      fielded.push({
        player_id: sub.player_id,
        role: sub.role,
        via: 'sub',
        replaced_player_id: starter.player_id,
      })
    } else {
      // No same-role replacement → play short.
      emptySlots.push({ role: starter.role, starter_player_id: starter.player_id })
    }
  }

  return { fielded, emptySlots, benchUsed: [...used] }
}
