/**
 * Fixture discovery + cache.
 *
 * - listFixturesBetween:    GET /fixtures/between/{d1}/{d2}
 * - fetchFixtureWithDetail: GET /fixtures/{id}?include=participants;lineups.details.type;events.type
 *
 * The cron upserts results into sportmonks_fixtures. App code reads
 * from that cache (or from matchday_fixtures / fm_real_match, which
 * are the per-product systems of record).
 */

import { fetchSportMonks } from './client'
import type { SMFixture } from './types'

const FIXTURE_DETAIL_INCLUDES = 'participants;lineups.details.type;events.type;scores;state'

/** Format a Date or "YYYY-MM-DD" to "YYYY-MM-DD" (UTC). */
function ymd(d: Date | string): string {
  if (typeof d === 'string') return d
  return d.toISOString().slice(0, 10)
}

/**
 * List fixtures for a league between two dates, inclusive.
 * Uses the per-league filter so multi-league fan-out is one call per league.
 */
export async function listFixturesBetween(
  leagueId: number,
  from: Date | string,
  to: Date | string,
): Promise<SMFixture[]> {
  const fixtures: SMFixture[] = []
  let page = 1
  const maxPages = 25

  for (let i = 0; i < maxPages; i++) {
    const path = `/fixtures/between/${ymd(from)}/${ymd(to)}`
    const env = await fetchSportMonks<SMFixture[]>(
      path,
      {
        filters: `fixtureLeagues:${leagueId}`,
        include: 'participants;round',
        page,
      },
      'Fixture',
    )
    if (env.data && env.data.length > 0) {
      fixtures.push(...env.data)
    }
    if (!env.pagination || !env.pagination.has_more) {
      break
    }
    page += 1
  }

  return fixtures
}

/**
 * Fetch one fixture with full lineups + per-player stats + events.
 * This is the canonical "give me everything about this match" call
 * used by the reconcile cron and the manual admin re-fetch button.
 */
export async function fetchFixtureWithDetail(fixtureId: number): Promise<SMFixture> {
  const env = await fetchSportMonks<SMFixture>(
    `/fixtures/${fixtureId}`,
    { include: FIXTURE_DETAIL_INCLUDES },
    'Fixture',
  )
  return env.data
}

/**
 * Fetch lineup entries for a fixture directly from the /lineups endpoint.
 * This is a fallback for cases where the fixture's lineups include returns
 * empty even though the match is in progress — the dedicated endpoint
 * sometimes has data the batch fixture endpoint doesn't.
 */
export async function fetchFixtureLineupsOnly(fixtureId: number): Promise<import('./types').SMLineupEntry[]> {
  const env = await fetchSportMonks<import('./types').SMLineupEntry[]>(
    '/lineups',
    { filters: `fixtureId:${fixtureId}`, include: 'details.type' },
    'Fixture',
  )
  return env.data ?? []
}
