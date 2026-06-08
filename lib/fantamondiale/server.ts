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
  /**
   * True when the user is a `league_admin` of the Lega that owns this FM
   * instance (independent of super-admin). Drives league-admin-editable
   * fantasy surfaces (prices, redraft cadence, fantasy config).
   */
  isLeagueAdmin: boolean
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

  // League-admin of the Lega that owns this instance — gates the league-admin-
  // editable fantasy surfaces. Independent of super-admin and of the previewing
  // flag (a previewing super-admin who is also the real league_admin keeps it).
  const { data: membership } = await supabase
    .from('league_users')
    .select('role')
    .eq('league_id', legaComp.league_id)
    .eq('user_id', user.id)
    .maybeSingle()
  const isLeagueAdmin = membership?.role === 'league_admin'

  // Non-admin viewers must be enrolled to access the competition pages.
  // League admins are allowed in without a personal squad so they can manage
  // their Lega's fantasy surfaces (Setup, Fasi, Prezzi) right after enrolling.
  if (!isSuperAdmin && !isLeagueAdmin && !team) redirect('/dashboard' as Route)

  const fantasyTeamId: string | null = team?.id ?? null

  // Global tournament template (fm_competition row the Lega is playing).
  const { data: competition } = await supabase
    .from('fm_competition')
    .select('*')
    .eq('id', legaComp.fm_competition_id)
    .single()

  if (!competition) redirect('/dashboard' as Route)

  // Fantasy config: prefer this Lega's own per-league config; fall back to the
  // global template row for the `config` blob so leagues enrolled before the
  // per-league layer (or any missing key) keep working.
  const [{ data: globalConfig }, { data: legaConfig }] = await Promise.all([
    supabase
      .from('fm_competition_config')
      .select('*')
      .eq('competition_id', competition.id)
      .single(),
    supabase
      .from('fm_league_competition_config')
      .select('config')
      .eq('league_competition_id', legaComp.id)
      .maybeSingle(),
  ])

  const config: FMCompetitionConfigRow | null = globalConfig
    ? { ...globalConfig, config: legaConfig?.config ?? globalConfig.config }
    : null

  return {
    legaCompetition: legaComp,
    competition,
    config,
    isSuperAdmin,
    isLeagueAdmin,
    userId: user.id,
    fantasyTeamId,
  }
})

// Call at the top of admin page.tsx files to gate non-admins.
export function assertSuperAdmin(ctx: FMContext) {
  if (!ctx.isSuperAdmin) redirect('/dashboard' as Route)
}

// Gate league-admin-editable fantasy surfaces (prices, redraft cadence, fantasy
// config). Allows the owning Lega's league_admin OR a super-admin.
export function assertLeagueAdmin(ctx: FMContext) {
  if (!ctx.isSuperAdmin && !ctx.isLeagueAdmin) redirect('/dashboard' as Route)
}

// ── Per-league fantasy layer helpers ───────────────────────────────────────
// These read the Lega-owned fantasy layer (redraft cadence, budget, prices)
// keyed by fm_league_competition.id, falling back to the global template so a
// Lega missing a per-league row still resolves sane values.

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface LegaPhaseSettings {
  requires_new_squad: boolean
  budget_mode: FMPhase['budget_mode']
  budget_config: FMPhase['budget_config']
}

/** Per-league redraft cadence + budget for one phase (fallback: global fm_phase). */
export async function getLegaPhaseSettings(
  supabase: Supabase,
  legaCompId: string,
  phaseId: string
): Promise<LegaPhaseSettings | null> {
  const { data: lp } = await supabase
    .from('fm_league_phase')
    .select('requires_new_squad, budget_mode, budget_config')
    .eq('league_competition_id', legaCompId)
    .eq('phase_id', phaseId)
    .maybeSingle()
  if (lp) return lp
  const { data: p } = await supabase
    .from('fm_phase')
    .select('requires_new_squad, budget_mode, budget_config')
    .eq('id', phaseId)
    .maybeSingle()
  return p ?? null
}

/** Per-league price for one player in one phase (fallback: global price, else 0). */
export async function getLegaPlayerPrice(
  supabase: Supabase,
  legaCompId: string,
  phaseId: string,
  playerId: string
): Promise<number> {
  const { data: lp } = await supabase
    .from('fm_league_phase_player_price')
    .select('price')
    .eq('league_competition_id', legaCompId)
    .eq('phase_id', phaseId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (lp) return lp.price
  const { data: gp } = await supabase
    .from('fm_phase_player_price')
    .select('price')
    .eq('phase_id', phaseId)
    .eq('player_id', playerId)
    .maybeSingle()
  return gp?.price ?? 0
}

/** Resolve a URL segment (slug or UUID) to the fm_league_competition primary key. */
export async function resolveLegaCompId(
  supabase: Supabase,
  legaCompRef: string
): Promise<string | null> {
  const { data } = await supabase
    .from('fm_league_competition')
    .select('id')
    .eq(isUuid(legaCompRef) ? 'id' : 'slug', legaCompRef)
    .maybeSingle()
  return data?.id ?? null
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
  opts?: { teamId?: string; role?: string; activeOnly?: boolean }
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
    // Listone surfaces pass activeOnly so players trimmed from a squad
    // (injured / final-cut) drop out of the draftable pool. Admin pages
    // omit it to keep managing inactive rows.
    if (opts?.activeOnly) q = q.eq('is_active', true)
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
