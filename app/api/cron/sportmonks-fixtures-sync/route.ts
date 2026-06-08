import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listFixturesBetween } from '@/lib/sportmonks/fixtures'
import {
  autoCreateFMRoundsAndMatches,
  listActiveLeagueRefs,
  refreshFMSquads,
  upsertFixtureCache,
} from '@/lib/sportmonks/db'
import { checkCronEnv, logCronRun } from '@/lib/sportmonks/cronLog'

const ENDPOINT = 'sportmonks-fixtures-sync'

/**
 * GET /api/cron/sportmonks-fixtures-sync
 *
 * Daily 04:00 UTC. For each active SportMonks league (per
 * leagues.active_sportmonks_league_id and fm_competition.active_sportmonks_league_id),
 * pulls fixtures for the next 14 days, upserts the cache, and
 * auto-creates fm_scoring_round + fm_real_match rows where missing.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * cron-job.org config:
 *   URL:    https://<host>/api/cron/sportmonks-fixtures-sync
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Method: GET
 *   When:   daily 04:00 UTC
 */
export async function GET(req: NextRequest) {
  const started_at = new Date()
  const envCheck = checkCronEnv()
  if (envCheck) {
    return NextResponse.json(
      { error: 'Missing required env vars', missing: envCheck.missing },
      { status: 503 },
    )
  }

  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const refs = await listActiveLeagueRefs(db)
  if (!refs.length) {
    const body = { message: 'No active SportMonks leagues', refs: 0 }
    await logCronRun(db, {
      endpoint: ENDPOINT,
      started_at,
      status: 'skipped',
      http_status: 200,
      summary: body,
    })
    return NextResponse.json(body)
  }

  const today = new Date()
  const in14 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
  const in50 = new Date(today.getTime() + 50 * 24 * 60 * 60 * 1000)

  // Determine the target date window per SportMonks league ID
  const leagueFetchTo = new Map<number, Date>()
  for (const ref of refs) {
    const currentMax = leagueFetchTo.get(ref.sportmonks_league_id)
    const targetDate = ref.product === 'fm' ? in50 : in14
    if (!currentMax || targetDate.getTime() > currentMax.getTime()) {
      leagueFetchTo.set(ref.sportmonks_league_id, targetDate)
    }
  }

  const results: Array<{
    product: string
    owner_id: string
    sportmonks_league_id: number
    fixtures_fetched: number
    cache_upserted: number
    rounds_created?: number
    matches_created?: number
    squad_teams?: number
    squad_players_new?: number
    squad_errors?: string[]
    error?: string
  }> = []

  // Cache fixtures per league (dedupe across multiple competitions
  // pointing at the same SportMonks league).
  const seenLeagues = new Map<number, Awaited<ReturnType<typeof listFixturesBetween>>>()

  for (const ref of refs) {
    try {
      let fixtures = seenLeagues.get(ref.sportmonks_league_id)
      if (!fixtures) {
        const fetchTo = leagueFetchTo.get(ref.sportmonks_league_id) ?? in14
        fixtures = await listFixturesBetween(ref.sportmonks_league_id, today, fetchTo)
        seenLeagues.set(ref.sportmonks_league_id, fixtures)
        await upsertFixtureCache(db, fixtures)
      }

      const entry: typeof results[number] = {
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        fixtures_fetched: fixtures.length,
        cache_upserted: fixtures.length,
      }

      if (ref.product === 'fm') {
        const { rounds_created, matches_created } = await autoCreateFMRoundsAndMatches(
          db,
          ref.owner_id,
          fixtures,
        )
        entry.rounds_created = rounds_created
        entry.matches_created = matches_created

        // Daily squad refresh — picks up roster announcements,
        // injury replacements, shirt-number changes. One API call
        // per national team.
        const squad = await refreshFMSquads(db, ref.owner_id)
        entry.squad_teams = squad.teams_processed
        entry.squad_players_new = squad.players_upserted
        if (squad.errors.length) entry.squad_errors = squad.errors
      }

      results.push(entry)
    } catch (e) {
      results.push({
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        fixtures_fetched: 0,
        cache_upserted: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const body = { refs: refs.length, results }
  const firstErr = results.find((r) => r.error)?.error
  await logCronRun(db, {
    endpoint: ENDPOINT,
    started_at,
    status: firstErr ? 'error' : 'ok',
    http_status: 200,
    summary: body,
    error: firstErr ?? null,
  })
  return NextResponse.json(body)
}
