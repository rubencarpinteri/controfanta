import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchInplayForLeague } from '@/lib/sportmonks/livescores'
import { parseFixture } from '@/lib/sportmonks/parse'
import {
  hasFixturesInLiveWindow,
  listActiveLeagueRefs,
  upsertFMPlayerStats,
  upsertSerieAPlayerStats,
} from '@/lib/sportmonks/db'
import { checkCronEnv, logCronRun, sendCronAlert } from '@/lib/sportmonks/cronLog'
import { writeLiveSnapshots } from '@/lib/fantamondiale/liveSnapshotWriter'
import { autoAdvanceRounds, autoEliminateNations } from '@/lib/fantamondiale/autoSchedule'

const ENDPOINT = 'sportmonks-ratings-tick'

/**
 * GET /api/cron/sportmonks-ratings-tick
 *
 * Every 1 minute. Cheap pre-check: any fixture in the live window
 * (kickoff−5min .. kickoff+130min)? If not, exit fast — costs zero
 * SportMonks calls.
 *
 * If yes: for each active SportMonks league, GET /livescores/inplay,
 * parse each fixture, upsert per-player stats and bump match score/status.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const started_at = new Date()
  const envCheck = checkCronEnv()
  if (envCheck) {
    const body = { error: 'Missing required env vars', missing: envCheck.missing }
    // No DB client available — env is broken — just return.
    return NextResponse.json(body, { status: 503 })
  }

  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // DB-only housekeeping that must run every minute regardless of whether any
  // fixture is live: open/lock formazioni at their scheduled times and
  // eliminate knockout losers. Cheap, idempotent, zero SportMonks calls — so
  // it runs BEFORE the live-window early-exit below.
  const [sched, elim] = await Promise.all([
    autoAdvanceRounds(db),
    autoEliminateNations(db),
  ])

  const inWindow = await hasFixturesInLiveWindow(db)
  if (!inWindow) {
    const body = { message: 'No fixtures in live window', live: 0, sched, elim }
    await logCronRun(db, {
      endpoint: ENDPOINT,
      started_at,
      status: 'skipped',
      http_status: 200,
      summary: body,
    })
    return NextResponse.json(body)
  }

  const refs = await listActiveLeagueRefs(db)
  if (!refs.length) {
    const body = { message: 'No active SportMonks leagues', live: 0, sched, elim }
    await logCronRun(db, {
      endpoint: ENDPOINT,
      started_at,
      status: 'skipped',
      http_status: 200,
      summary: body,
    })
    return NextResponse.json(body)
  }

  // Dedupe live fetches across competitions sharing a league.
  const liveByLeague = new Map<number, Awaited<ReturnType<typeof fetchInplayForLeague>>>()
  for (const ref of refs) {
    if (!liveByLeague.has(ref.sportmonks_league_id)) {
      try {
        liveByLeague.set(ref.sportmonks_league_id, await fetchInplayForLeague(ref.sportmonks_league_id))
      } catch (e) {
        liveByLeague.set(ref.sportmonks_league_id, [])
        console.error(`[ratings-tick] fetch failed for league ${ref.sportmonks_league_id}:`, e)
      }
    }
  }

  const results: Array<{
    product: string
    owner_id: string
    sportmonks_league_id: number
    live_fixtures: number
    fixtures_upserted: number
    stats_total: number
    error?: string
  }> = []

  for (const ref of refs) {
    const live = liveByLeague.get(ref.sportmonks_league_id) ?? []
    if (!live.length) {
      results.push({
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        live_fixtures: 0,
        fixtures_upserted: 0,
        stats_total: 0,
      })
      continue
    }

    let fixtures_upserted = 0
    let stats_total = 0
    let err: string | undefined

    try {
      for (const fx of live) {
        const parsed = parseFixture(fx)
        if (ref.product === 'fm') {
          const r = await upsertFMPlayerStats(db, ref.owner_id, parsed)
          if (r.match_updated) fixtures_upserted += 1
          stats_total += r.stats_upserted
        } else if (ref.product === 'serie_a') {
          const r = await upsertSerieAPlayerStats(db, ref.owner_id, parsed)
          if (r.matchday_id) fixtures_upserted += 1
          stats_total += r.stats_upserted
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
    }

    results.push({
      product: ref.product,
      owner_id: ref.owner_id,
      sportmonks_league_id: ref.sportmonks_league_id,
      live_fixtures: live.length,
      fixtures_upserted,
      stats_total,
      error: err,
    })
  }

  // After stats are upserted, recompute live snapshots for every currently
  // live round (per lega). Never throws — folds its own errors into summary.
  let liveSnapshots: Awaited<ReturnType<typeof writeLiveSnapshots>> | undefined
  try {
    liveSnapshots = await writeLiveSnapshots(db)
  } catch (e) {
    liveSnapshots = {
      live_rounds: 0,
      legas_processed: 0,
      snapshots_written: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }

  // Matchday anomaly detection — the failure modes that the bland "skipped"/
  // success log would otherwise bury. We're past the live-window gate, so games
  // should be live; if SportMonks returns fixtures but we ingest zero stats, or
  // every league's fetch failed, ratings are NOT flowing and someone must know.
  const liveFixturesTotal = results.reduce((s, r) => s + r.live_fixtures, 0)
  const statsTotal = results.reduce((s, r) => s + r.stats_total, 0)
  const allFetchesEmpty = liveByLeague.size > 0 && [...liveByLeague.values()].every((v) => v.length === 0)
  let anomaly: string | undefined
  if (liveFixturesTotal > 0 && statsTotal === 0) {
    anomaly = `${liveFixturesTotal} live fixture(s) but 0 player stats ingested — check ID matching / parse.`
  } else if (allFetchesEmpty) {
    anomaly = 'In live window but every SportMonks inplay fetch returned empty/failed — check token / API.'
  }
  if (anomaly) {
    // Rate-limit push alerts: only fire if this exact anomaly hasn't been
    // logged in the last 30 minutes — avoids flooding ntfy every tick.
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentSame } = await db
      .from('cron_runs')
      .select('id')
      .eq('endpoint', ENDPOINT)
      .eq('error', anomaly)
      .gte('started_at', cutoff)
      .limit(1)
    if (!recentSame?.length) await sendCronAlert(anomaly)
  }

  const body = { live: liveByLeague.size, results, liveSnapshots, anomaly, sched, elim }
  const hadError = !!anomaly || results.some((r) => r.error) || (liveSnapshots?.errors.length ?? 0) > 0
  await logCronRun(db, {
    endpoint: ENDPOINT,
    started_at,
    status: hadError ? 'error' : 'ok',
    http_status: 200,
    summary: body,
    error: hadError
      ? (anomaly ?? results.find((r) => r.error)?.error ?? liveSnapshots?.errors[0] ?? null)
      : null,
  })
  return NextResponse.json(body)
}
