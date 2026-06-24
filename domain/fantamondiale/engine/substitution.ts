// ============================================================
// FantaMondiale bench substitution — pure, no I/O, testable.
// ============================================================
// "Module is king": the chosen formation never reshapes. A titolare who
// "didn't play" is replaced by the FIRST same-role bench player in bench
// order. Strictly role-locked — P↔P, D↔D, C↔C, A↔A. No cross-role fallback.
// If the same-role bench is exhausted, the slot stays empty and the team
// plays short (the empty slot scores nothing).
//
// Bench PRIORITY is absolute and ordered. When a slot opens, we walk the
// same-role bench in bench_order and the FIRST eligible candidate decides it:
//   - 'played'     → he comes on and scores.
//   - 'pending'    → his match hasn't resolved yet. The slot is RESERVED for
//                    him and held empty for now — a lower-priority bench player
//                    may NOT jump ahead of him. Only if he himself ends up not
//                    playing does priority pass down the order.
//   - 'not_played' → skip him (a bench s.v. is useless), continue down the order.
//
// This three-state rule is why live and final never diverge: at finalization
// every match is over, so 'pending' never occurs and the rule collapses to the
// plain "first same-role bench player who played" semantics.
// ============================================================

export type FMRole = 'P' | 'D' | 'C' | 'A'

/** Whether a player's match has resolved, and how, per the league trigger. */
// 'sv' = player entered the match but didn't earn a vote (< minutes threshold,
// no decisive event). Treated identically to 'not_played' for substitution
// purposes, but displayed differently in the UI.
export type PlayState = 'played' | 'not_played' | 'sv' | 'pending'

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
  /**
   * Three-state play status. 'pending' (match not yet resolved) reserves the
   * slot and BLOCKS lower-priority bench players — it must not be collapsed to
   * 'not_played', or priority inverts (the live-board substitution bug).
   */
  playState: PlayState
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
  /**
   * A higher-priority bench player whose match is still pending is reserved for
   * this slot: it is not "play short", it is "substitution pending". Null when
   * every same-role bench candidate's match is over (genuinely play short).
   */
  reserved_by: string | null
}

export interface SubstitutionResult {
  /** Players who actually contribute a score this round (≤ 11). */
  fielded: FieldedPlayer[]
  /** Unfilled slots (play short, or pending a reserved bench player). */
  emptySlots: EmptySlot[]
  /** Bench player ids that came on (actually fielded). */
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
  // A bench player is "consumed" once a slot fields him OR reserves him while
  // pending — either way he is no longer available to a later vacancy.
  const consumed = new Set<string>()

  const fielded: FieldedPlayer[] = []
  const emptySlots: EmptySlot[] = []

  for (const starter of starters) {
    if (starter.played) {
      fielded.push({ player_id: starter.player_id, role: starter.role, via: 'starter' })
      continue
    }

    // Walk the same-role bench in priority order. The first candidate whose
    // match is NOT over (played or pending) decides the slot; 'not_played'
    // candidates are skipped entirely.
    const candidate = benchSorted.find(
      (b) =>
        !consumed.has(b.player_id) &&
        b.role === starter.role &&
        b.playState !== 'not_played' && b.playState !== 'sv',
    )

    if (!candidate) {
      // Every same-role bench player's match is over and none played → short.
      emptySlots.push({ role: starter.role, starter_player_id: starter.player_id, reserved_by: null })
      continue
    }

    consumed.add(candidate.player_id)

    if (candidate.playState === 'played') {
      fielded.push({
        player_id: candidate.player_id,
        role: candidate.role,
        via: 'sub',
        replaced_player_id: starter.player_id,
      })
    } else {
      // 'pending' — reserve this candidate for the slot and hold it empty. No
      // lower-priority bench player may take it until his match resolves.
      emptySlots.push({
        role: starter.role,
        starter_player_id: starter.player_id,
        reserved_by: candidate.player_id,
      })
    }
  }

  const benchUsed = fielded.filter((f) => f.via === 'sub').map((f) => f.player_id)
  return { fielded, emptySlots, benchUsed }
}
