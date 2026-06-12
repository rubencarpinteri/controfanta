/**
 * Live polling.
 *
 * GET /livescores/inplay?filters=fixtureLeagues:{id}&include=...
 *
 * Returns an array of fixtures currently in play. Empty array = no
 * live games for that league right now. The cron uses this as the
 * 1-minute tick; the daily-sync cron is responsible for discovery.
 */

import { fetchSportMonks } from './client'
import type { SMFixture } from './types'

const INPLAY_INCLUDES = 'participants;lineups.details.type;events.type;scores;periods'

export async function fetchInplayForLeague(leagueId: number): Promise<SMFixture[]> {
  const env = await fetchSportMonks<SMFixture[]>(
    '/livescores/inplay',
    { filters: `fixtureLeagues:${leagueId}`, include: INPLAY_INCLUDES },
    'Inplay',
  )
  return env.data ?? []
}
