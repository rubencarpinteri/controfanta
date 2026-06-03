/**
 * SportMonks position ID mapping.
 *
 * 24 = Goalkeeper
 * 25 = Defender
 * 26 = Midfielder
 * 27 = Attacker
 */

import type { RatingClass } from '@/types/database.types'

export function positionIdToRatingClass(positionId: number | null | undefined): RatingClass | null {
  switch (positionId) {
    case 24: return 'GK'
    case 25: return 'DEF'
    case 26: return 'MID'
    case 27: return 'ATT'
    default: return null
  }
}

/** ControFanta Mondiale uses single-letter Italian-classic codes. */
export type FMPlayerRoleCode = 'P' | 'D' | 'C' | 'A'

export function positionIdToFMRole(positionId: number | null | undefined): FMPlayerRoleCode | null {
  switch (positionId) {
    case 24: return 'P'
    case 25: return 'D'
    case 26: return 'C'
    case 27: return 'A'
    default: return null
  }
}
