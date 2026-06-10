/**
 * Cron-run logging: persist one row in public.cron_runs per cron
 * invocation. Used by every /api/cron/sportmonks-* route.
 *
 * Read by the super-admin page at /league/cron-status.
 *
 * Designed to be fire-and-forget — a logging failure must NEVER
 * cause the cron itself to fail. All errors are swallowed and
 * console-logged.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'

type DB = SupabaseClient<Database>

// `cron_runs` is created by migration 20260521090000 — until the
// generated types are refreshed (`npm run db:types`), we cast through
// `any` at the .from() call. Removing this cast once types regenerate
// will compile cleanly.
type CronRunsInsert = {
  endpoint: string
  started_at: string
  finished_at: string
  duration_ms: number
  status: CronRunStatus
  http_status: number
  summary: Json
  error: string | null
}

export type CronRunStatus = 'ok' | 'error' | 'skipped'

export interface CronRunInput {
  endpoint: string
  started_at: Date
  status: CronRunStatus
  http_status: number
  summary: unknown
  error?: string | null
}

/**
 * Cap the JSON payload at ~32 KB to keep the table light. Falls back
 * to a stringified error envelope if JSON.stringify itself throws
 * (circular refs etc).
 */
function safeJson(value: unknown): Json {
  try {
    const s = JSON.stringify(value)
    if (s.length > 32_000) {
      return { truncated: true, length: s.length, preview: s.slice(0, 30_000) } as unknown as Json
    }
    return JSON.parse(s) as Json
  } catch (e) {
    return { json_error: e instanceof Error ? e.message : String(e) } as unknown as Json
  }
}

export async function logCronRun(db: DB, input: CronRunInput): Promise<void> {
  const finished_at = new Date()
  const duration_ms = finished_at.getTime() - input.started_at.getTime()
  const row: CronRunsInsert = {
    endpoint: input.endpoint,
    started_at: input.started_at.toISOString(),
    finished_at: finished_at.toISOString(),
    duration_ms,
    status: input.status,
    http_status: input.http_status,
    summary: safeJson(input.summary),
    error: input.error ?? null,
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from('cron_runs').insert(row)
    if (error) console.error(`[cron-log] insert failed: ${error.message}`)
  } catch (e) {
    console.error('[cron-log] unexpected:', e)
  }
}

// Default alert channel: a private ntfy.sh topic (free, no account, no secret).
// Subscribe once on your phone via the ntfy app or https://ntfy.sh/<topic> to
// receive matchday push alerts. Override with SPORTMONKS_ALERT_WEBHOOK (a Slack
// or Discord incoming-webhook URL) if you ever want a different channel.
const DEFAULT_ALERT_WEBHOOK = 'https://ntfy.sh/controfanta-live-33a1b0a1eb39'

/**
 * Loud alert for matchday anomalies the cron-status page would otherwise hide
 * (e.g. live fixtures present but zero ratings ingested). Fire-and-forget — it
 * never throws, because a broken alert must never break the cron tick.
 *
 * Delivery: ntfy.sh topics get a plain-text body + notification headers;
 * Slack/Discord webhooks get a `{ text }` JSON payload. Always console.errors
 * too, so the signal survives in Vercel logs even if the channel is down.
 */
export async function sendCronAlert(message: string): Promise<void> {
  console.error(`[cron-alert] ${message}`)
  const url = process.env.SPORTMONKS_ALERT_WEBHOOK || DEFAULT_ALERT_WEBHOOK
  try {
    if (url.includes('ntfy.sh')) {
      await fetch(url, {
        method: 'POST',
        headers: {
          Title: 'CONTROFANTA live ingest',
          Priority: 'high',
          Tags: 'warning',
        },
        body: message,
      })
    } else {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ CONTROFANTA live ingest: ${message}` }),
      })
    }
  } catch (e) {
    console.error('[cron-alert] webhook failed:', e)
  }
}

/**
 * Up-front guard: every cron route must have CRON_SECRET and
 * SPORTMONKS_API_TOKEN set, otherwise we want a clean 503 *before*
 * spending any DB or API calls. Returns null when env is fine.
 */
export function checkCronEnv(): { missing: string[] } | null {
  const missing: string[] = []
  if (!process.env.CRON_SECRET) missing.push('CRON_SECRET')
  if (!process.env.SPORTMONKS_API_TOKEN) missing.push('SPORTMONKS_API_TOKEN')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) return { missing }
  return null
}
