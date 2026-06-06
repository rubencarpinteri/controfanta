// ============================================================
// ControFanta Mondiale — Server-side data access helpers
// ============================================================
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin as getEffectiveSuperAdmin } from '@/lib/league'
import { isUuid } from '@/lib/slug'
import type {
  FMCompetition,
  FMLeagueCompetition,
  FMPhase,
  FMScoringRound,
  FMNationalTeam,
  FMPlayer,
  FMCoach,
  FMCompetitionConfigRow,
  FMFantasyTeam,
} from '@/types/database.types'

export interface FMContext {
  // The Lega's per-instance row — what the URL [id] resolves to.
  legaCompetition: FMLeagueCompetition
  // The global tournament template (fixtures, players, etc) the Lega is playing.
  competition: FMCompetition
  config: FMCompetitionConfigRow | null
  isSuperAdmin: boolean
  userId: string
  fantasyTeamId: string | null
}

/**
 * Resolves a Lega-scoped ControFanta Mondiale context.
 *
 * `legaCompRef` is the URL segment for an `fm_league_competition` — either its
 * human-readable `slug` (preferred) or its UUID `id` (legacy/fallback). Access
 * is gated to enrolled managers in this Lega's instance (super admins get a
 * free pass).
 *
 * Memoized per request via React cache(): an FM page and its layout both call
 * this with the same ref, so without memoization every navigation pays the
 * getUser() round-trip plus four table lookups twice.
 */
export const requireFMContext = cache(async (legaCompRef: string): Promise<FMContext> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Effective super-admin: false while previewing as a manager, so a previewing
  // admin without a team is gated exactly like a real non-admin manager.
  const isSuperAdmin = await getEffectiveSuperAdmin()

  // The Lega instance — joins template (fm_competition) + Lega (leagues) ids.
  // Resolve by slug or UUID so both clean and legacy URLs work.
  const { data: legaComp } = await supabase
    .from('fm_league_competition')
    .select('*')
    .eq(isUuid(legaCompRef) ? 'id' : 'slug', legaCompRef)
    .maybeSingle()

  if (!legaComp) redirect('/dashboard' as Route)

  // User's team in this Lega instance (if any).
  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('league_competition_id', legaComp.id)
    .eq('manager_id', user.id)
    .maybeSingle()

  // Non-admin viewers must be enrolled to access the competition pages.
  if (!isSuperAdmin && !team) redirect('/dashboard' as Route)

  const fantasyTeamId: string | null = team?.id ?? null

  // Global tournament template (fm_competition row the Lega is playing).
  const { data: competition } = await supabase
    .from('fm_competition')
    .select('*')
    .eq('id', legaComp.fm_competition_id)
    .single()

  if (!competition) redirect('/dashboard' as Route)

  const { data: config } = await supabase
    .from('fm_competition_config')
    .select('*')
    .eq('competition_id', competition.id)
    .single()

  return {
    legaCompetition: legaComp,
    competition,
    config: config ?? null,
    isSuperAdmin,
    userId: user.id,
    fantasyTeamId,
  }
})

// Call at the top of admin page.tsx files to gate non-admins.
export function assertSuperAdmin(ctx: FMContext) {
  if (!ctx.isSuperAdmin) redirect('/dashboard' as Route)
}

// Lists every global tournament template (super-admin-facing).
export async function getFMCompetitions(): Promise<FMCompetition[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_competition')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Tournament-template helpers — these query global tables scoped by the
// underlying fm_competition.id, NOT the Lega instance. Callers should pass
// `ctx.competition.id` (the template), not `ctx.legaCompetition.id`.

export async function getFMPhases(competitionId: string): Promise<FMPhase[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_phase')
    .select('*')
    .eq('competition_id', competitionId)
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getFMRounds(competitionId: string): Promise<FMScoringRound[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_scoring_round')
    .select('*')
    .eq('competition_id', competitionId)
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getFMTeams(competitionId: string): Promise<FMNationalTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_national_team')
    .select('*')
    .eq('competition_id', competitionId)
    .order('name', { ascending: true })
  return data ?? []
}

export async function getFMPlayers(
  competitionId: string,
  opts?: { teamId?: string; role?: string }
): Promise<(FMPlayer & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'> })[]> {
  const supabase = await createClient()
  // PostgREST caps each response at 1000 rows (db-max-rows). The full WC
  // pool is ~1250 players, so we MUST page through or teams silently lose
  // their alphabetically-late players. Fetch in 1000-row chunks until done.
  const PAGE = 1000
  const all: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('fm_player')
      .select('*, fm_national_team(name, fifa_code, flag_emoji, logo_url, flag_url)')
      .eq('competition_id', competitionId)
    if (opts?.teamId) q = q.eq('national_team_id', opts.teamId)
    if (opts?.role) q = q.eq('role', opts.role as 'P' | 'D' | 'C' | 'A')
    const { data, error } = await q
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getFMPlayers: ${error.message}`)
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE) break
  }
  return all as (FMPlayer & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'> })[]
}

export async function getFMCoaches(
  competitionId: string
): Promise<(FMCoach & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'> })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_coach')
    .select('*, fm_national_team(name, fifa_code, flag_emoji, logo_url, flag_url)')
    .eq('competition_id', competitionId)
    .order('fm_national_team(name)', { ascending: true })
  return (data ?? []) as unknown as (FMCoach & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'> })[]
}

// Lega-scoped — pass the Lega instance id (ctx.legaCompetition.id), NOT the
// global tournament id.
export async function getFMFantasyTeams(legaCompId: string): Promise<FMFantasyTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_fantasy_team')
    .select('*')
    .eq('league_competition_id', legaCompId)
    .order('name', { ascending: true })
  return data ?? []
}
