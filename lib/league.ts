import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import type { League, LeagueRole } from '@/types/database.types'

export interface LeagueContext {
  league: League
  role: LeagueRole
  userId: string
}

// Name of the "view as manager" preview cookie. When set, a real super-admin
// is treated as an ordinary manager throughout the app (admin tabs/buttons
// hidden, admin routes/actions gated) so they can preview the non-admin UX.
export const VIEW_AS_MANAGER_COOKIE = 'view_as_manager'

// Is the current request running in "view as manager" preview mode?
export const isViewingAsManager = cache(async (): Promise<boolean> => {
  const jar = await cookies()
  return jar.get(VIEW_AS_MANAGER_COOKIE)?.value === '1'
})

// The user's TRUE super-admin status from their profile, ignoring any preview
// mode. Use this only to decide whether to offer the preview toggle itself.
export const isRealSuperAdmin = cache(async (): Promise<boolean> => {
  const user = await getAuthUser()
  if (!user) return false
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_super_admin ?? false
})

// Effective super-admin status: false while previewing as a manager.
// Memoized per request so layouts and pages that both call this hit Supabase once.
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  if (await isViewingAsManager()) return false
  return isRealSuperAdmin()
})

/**
 * Redirects to `/login` if the user is not signed in, or `/` if they are
 * signed in but not a super-admin. Returns their user id on success.
 */
export async function requireSuperAdmin(): Promise<{ userId: string }> {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!(await isSuperAdmin())) redirect('/')
  return { userId: user.id }
}

/**
 * Resolves the current user's league context.
 * In v1, each user belongs to exactly one league.
 * Returns null if the user has no league membership.
 *
 * Memoized per request — pages can call this freely without re-querying.
 */
export const getLeagueContext = cache(async (): Promise<LeagueContext | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const supabase = await createClient()

  // Until we ship a proper league switcher, "current league" = the most
  // recently joined one. This makes the post-creation flow land in the
  // freshly created league instead of an arbitrary older membership.
  const { data, error } = await supabase
    .from('league_users')
    .select('league_id, role, leagues(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null

  // The Supabase select-query-parser cannot resolve the `leagues(*)` join
  // because our manually-written types carry `Relationships: never[]` (no FK
  // metadata). The runtime shape is correct; widen, then narrow.
  const d = data as { league_id: string; role: LeagueRole; leagues: unknown }
  // In "view as manager" preview mode, downgrade the role so every
  // `ctx.role === 'league_admin'` check across the app sees a plain manager.
  const role: LeagueRole = (await isViewingAsManager()) ? 'manager' : d.role
  return {
    league: d.leagues as unknown as League,
    role,
    userId: user.id,
  }
})

/**
 * Resolves the current user's league context or throws a redirect.
 * Use in layouts/pages that require league membership.
 */
export async function requireLeagueContext(): Promise<LeagueContext> {
  const ctx = await getLeagueContext()
  if (!ctx) redirect('/login')
  return ctx as LeagueContext
}

/**
 * Resolves the current user's league context and asserts league_admin role
 * (or super-admin). Redirects to `/dashboard` otherwise.
 */
export async function requireLeagueAdmin(): Promise<LeagueContext> {
  const ctx = await requireLeagueContext()
  if (ctx.role === 'league_admin') return ctx
  if (await isSuperAdmin()) return ctx
  redirect('/dashboard')
}
