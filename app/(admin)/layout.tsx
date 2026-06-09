import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import { getLeagueContext, isRealSuperAdmin, isViewingAsManager } from '@/lib/league'
import { AdminSidebar } from '@/components/nav/AdminSidebar'
import { toggleViewAsManagerAction } from './preview-actions'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Profile + league context in parallel. getLeagueContext is memoized via
  // React cache(), so child pages reading it again pay zero extra round-trips.
  const [profileResult, ctx, realSuperAdmin, previewing] = await Promise.all([
    supabase.from('profiles').select('username, full_name, is_super_admin').eq('id', user.id).single(),
    getLeagueContext(),
    isRealSuperAdmin(),
    isViewingAsManager(),
  ])

  if (!ctx) {
    // User exists in auth but has no league membership yet
    // Show a holding page rather than a hard redirect
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-4">
        <div className="glass max-w-sm px-8 py-7 text-center">
          <p className="text-[15px] font-semibold tracking-tight text-ink-1">Nessuna lega</p>
          <p className="mt-2 text-[13px] leading-[1.55] text-ink-3">
            Il tuo account non è ancora associato a una lega. Crea la tua, oppure
            chiedi a un admin di invitarti.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <a
              href="/leagues/new"
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Crea una nuova lega
            </a>
            <a
              href="/join"
              className="inline-block rounded-lg border border-hairline bg-glass-1 px-4 py-2 text-[12px] font-semibold text-ink-2 hover:bg-glass-2 transition-colors"
            >
              Ho un codice invito
            </a>
          </div>
        </div>
      </div>
    )
  }

  const profile = profileResult.data
  // Effective admin: false while previewing as a manager. (ctx.role is already
  // downgraded to 'manager' in preview, but guard explicitly for clarity.)
  const isAdmin = !previewing && (ctx.role === 'league_admin' || realSuperAdmin)

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        isAdmin={isAdmin}
        canPreview={realSuperAdmin}
        previewing={previewing}
        username={profile?.username ?? user.email ?? 'Utente'}
        leagueName={ctx.league.name ?? 'Fantacalcio'}
      />
      <main className="flex-1 overflow-y-auto">
        {previewing && (
          <div className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-700 dark:text-amber-300">
            <span className="font-medium">Anteprima “manager” — stai vedendo il sito come un utente non admin.</span>
            <form action={toggleViewAsManagerAction}>
              <button type="submit" className="rounded-md border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors">
                Esci dall&apos;anteprima
              </button>
            </form>
          </div>
        )}
        {/* pb-24 on mobile reserves space above the fixed bottom nav bar */}
        <div className="mx-auto max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
