/**
 * Team squad — used by the seed/backfill script.
 *
 * GET /squads/teams/{team_id}?include=player
 *
 * Returns one row per current contract. We dedupe on player_id
 * (a player may have multiple contract rows in edge cases).
 */

import { fetchSportMonks } from './client'
import type { SMPlayer, SMSquadEntry } from './types'

export async function fetchTeamSquad(teamId: number): Promise<SMSquadEntry[]> {
  const env = await fetchSportMonks<SMSquadEntry[]>(
    `/squads/teams/${teamId}`,
    { include: 'player' },
    'Squad',
  )
  return env.data ?? []
}

/** Convenience: just the unique player rows. */
export async function fetchTeamPlayers(teamId: number): Promise<SMPlayer[]> {
  const squad = await fetchTeamSquad(teamId)
  const seen = new Set<number>()
  const out: SMPlayer[] = []
  for (const entry of squad) {
    if (seen.has(entry.player_id)) continue
    seen.add(entry.player_id)
    out.push(entry.player)
  }
  return out
}

/** A real (non-placeholder) team in a season, with the fields we seed. */
export type SeasonTeam = {
  id: number
  name: string
  short_code: string | null
  image_path: string | null
  country_id: number | null
}

type RawSeasonTeam = SeasonTeam & {
  placeholder?: boolean | null
  type?: string | null
}

/**
 * GET /teams/seasons/{season_id} — teams in a season.
 *
 * IMPORTANT: for cup competitions this endpoint also returns bracket
 * placeholders ("Winner Quarter-final 1", "1st Group L", ...) with
 * placeholder=true and type='domestic'. We filter those out and keep
 * only real national teams so they never reach the DB.
 */
export async function listTeamsInSeason(seasonId: number): Promise<SeasonTeam[]> {
  const env = await fetchSportMonks<RawSeasonTeam[]>(
    `/teams/seasons/${seasonId}`,
    { per_page: 150 },
    'Team',
  )
  return (env.data ?? [])
    .filter((t) => t.placeholder === false && t.type === 'national')
    .map((t) => ({
      id: t.id,
      name: t.name,
      short_code: t.short_code ?? null,
      image_path: t.image_path ?? null,
      country_id: t.country_id ?? null,
    }))
}

type SMCountry = { id: number; image_path: string | null }

// Countries live under the /core base, NOT /football, so the shared
// football client can't reach them. This endpoint is read here directly.
const CORE_COUNTRIES_URL = 'https://api.sportmonks.com/v3/core/countries'

/**
 * Map country_id -> flag image URL for the given country ids, via the
 * core countries endpoint. Paginates until all pages are consumed.
 */
export async function fetchCountryFlags(countryIds: number[]): Promise<Map<number, string>> {
  const flags = new Map<number, string>()
  const unique = [...new Set(countryIds.filter((id) => Number.isFinite(id)))]
  if (unique.length === 0) return flags

  const token = process.env.SPORTMONKS_API_TOKEN
  if (!token) throw new Error('SPORTMONKS_API_TOKEN is not set')

  let page = 1
  // Hard cap pages to avoid any accidental infinite loop.
  for (let i = 0; i < 20; i++) {
    const url = new URL(CORE_COUNTRIES_URL)
    url.searchParams.set('api_token', token)
    url.searchParams.set('filters', `countryIds:${unique.join(',')}`)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SportMonks ${res.status} on /core/countries: ${text.slice(0, 200)}`)
    }
    const body = (await res.json()) as {
      data?: SMCountry[]
      pagination?: { has_more?: boolean }
    }
    for (const c of body.data ?? []) {
      if (c.image_path) flags.set(c.id, c.image_path)
    }
    if (!body.pagination?.has_more) break
    page += 1
  }
  return flags
}

/** GET /coaches/teams/{team_id} — current coach for a team. */
export async function fetchTeamCoach(teamId: number): Promise<{ id: number; name: string } | null> {
  const env = await fetchSportMonks<Array<{ id: number; name: string }>>(
    `/coaches/teams/${teamId}`,
    {},
    'Coach',
  )
  return env.data?.[0] ?? null
}
