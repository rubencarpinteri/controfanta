import { getFMCompetitions } from '@/lib/fantamondiale/server'
import { isSuperAdmin } from '@/lib/league'
import { bootstrapWC2026Action } from './actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'

export const metadata = { title: 'ControFanta Mondiale' }

const STATUS_COLOR: Record<string, string> = {
  draft:       'text-ink-4 bg-ink-4/10',
  open:        'text-emerald-400 bg-emerald-400/10',
  in_progress: 'text-amber-400 bg-amber-400/10',
  completed:   'text-indigo-400 bg-indigo-400/10',
  archived:    'text-ink-5 bg-ink-5/10',
}

export default async function FantaMondialePage() {
  // Auth: super admins see the full competitions list. Regular managers
  // who own at least one fm_fantasy_team get redirected straight into
  // their competition (single-comp UX). Everyone else → home.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const superAdmin = await isSuperAdmin()

  if (!superAdmin) {
    const { data: team } = await supabase
      .from('fm_fantasy_team')
      .select('league_competition_id, fm_league_competition(slug)')
      .eq('manager_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (team?.league_competition_id) {
      const join = Array.isArray(team.fm_league_competition)
        ? team.fm_league_competition[0]
        : team.fm_league_competition
      redirect(`/controfantamondiale/${join?.slug ?? team.league_competition_id}` as Route)
    }
    redirect('/dashboard')
  }

  const competitions = await getFMCompetitions()

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-semibold tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', letterSpacing: '-0.03em' }}
          >
            ControFanta Mondiale
          </h1>
          <p className="mt-0.5 text-[12px] text-ink-4">
            Competizioni mondiali fantasy — gestione admin
          </p>
        </div>

        {competitions.length === 0 && (
          <form action={bootstrapWC2026Action}>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              🌍 Inizializza ControFanta Mondiale 2026
            </button>
          </form>
        )}
      </div>

      {/* ── Competition list ─────────────────────────────────────────────────── */}
      {competitions.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-glass-1 px-6 py-12 text-center">
          <p className="text-[13px] text-ink-4">Nessuna competizione ControFanta Mondiale.</p>
          <p className="mt-1 text-[11px] text-ink-5">
            Usa il pulsante in alto per creare ControFanta Mondiale 2026.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/controfantamondiale/${c.id}` as Route}
              className="flex items-center gap-4 rounded-xl border border-hairline bg-glass-1 px-5 py-4 hover:bg-glass-2 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-ink-1 tracking-tight truncate">
                  {c.name} {c.edition}
                </p>
                {c.starts_at && (
                  <p className="mt-0.5 text-[11px] text-ink-4">
                    {new Date(c.starts_at).toLocaleDateString('it-IT')}
                    {c.ends_at ? ` → ${new Date(c.ends_at).toLocaleDateString('it-IT')}` : ''}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[c.status] ?? STATUS_COLOR.draft}`}
              >
                {c.status}
              </span>
              <span className="text-ink-5 text-xs">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
