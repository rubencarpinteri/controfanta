import { requireFMContext, assertSuperAdmin, getFMCoaches, getFMTeams } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { addCoachAction, deleteCoachAction } from './actions'

const TIER_LABELS: Record<string, { label: string; cls: string }> = {
  tier_1: { label: 'T1 — Favoriti',   cls: 'text-indigo-400 bg-indigo-400/10' },
  tier_2: { label: 'T2 — Forti',      cls: 'text-emerald-400 bg-emerald-400/10' },
  tier_3: { label: 'T3 — Outsider',   cls: 'text-amber-400 bg-amber-400/10' },
  tier_4: { label: 'T4 — Underdog',   cls: 'text-rose-400 bg-rose-400/10' },
}

export default async function CoachesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)
  const [coaches, teams] = await Promise.all([
    getFMCoaches(ctx.competition.id),
    getFMTeams(ctx.competition.id),
  ])

  // Tiers are competition-level and frozen for the whole tournament
  // (read-only here — no per-phase or in-tournament edits).
  const supabase = await createClient()
  const { data: tierRows } = await supabase
    .from('fm_competition_coach_tier')
    .select('coach_id, tier')
    .eq('competition_id', ctx.competition.id)

  const tierByCoachId = new Map<string, string>(
    (tierRows ?? []).map((r) => [r.coach_id, r.tier])
  )

  const teamsWithoutCoach = teams.filter(
    (t) => t.status === 'active' && !coaches.find((c) => c.national_team_id === t.id)
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Allenatori</h2>
        <span className="text-[11px] text-ink-4">{coaches.length} / {teams.length} nazioni</span>
      </div>

      {/* ── Add coach form ───────────────────────────────────────────────────── */}
      {teamsWithoutCoach.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-4">Aggiungi allenatore</p>
          <form action={addCoachAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input type="hidden" name="competition_id" value={id} />
            <select
              name="national_team_id" required
              className="col-span-2 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Seleziona nazione —</option>
              {teamsWithoutCoach.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              name="name" placeholder="Nome allenatore" required
              className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              name="sportmonks_coach_id" placeholder="SportMonks coach ID" type="number"
              className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
              Aggiungi
            </button>
          </form>
        </div>
      )}

      {/* ── Coach list with frozen competition-level tier ──────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-hairline grid grid-cols-[1fr_auto_auto] gap-3 items-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Allenatore</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 text-center w-28">Tier (fisso)</p>
          <span />
        </div>
        <div className="divide-y divide-hairline">
          {coaches.map((coach) => {
            const tier = tierByCoachId.get(coach.id)
            const meta = tier ? TIER_LABELS[tier] : undefined
            return (
              <div key={coach.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-1 truncate">
                    <TeamCrest
                      name={coach.fm_national_team.name}
                      logoUrl={coach.fm_national_team.logo_url}
                      flagUrl={coach.fm_national_team.flag_url}
                      fifaCode={coach.fm_national_team.fifa_code}
                      size={16}
                    />
                    {coach.name}
                  </p>
                  <p className="text-[10px] text-ink-5">{coach.fm_national_team.name}</p>
                </div>
                <div className="w-28 text-center">
                  <span className={`inline-block rounded px-2 py-1 text-[10px] font-semibold ${meta?.cls ?? 'text-ink-5 bg-glass-2'}`}>
                    {meta?.label ?? '—'}
                  </span>
                </div>
                <form action={deleteCoachAction.bind(null, coach.id, id)}>
                  <button type="submit" className="text-[10px] text-ink-5 hover:text-rose-400 transition-colors">✕</button>
                </form>
              </div>
            )
          })}
        </div>
      </div>

      {coaches.length === 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 px-6 py-10 text-center">
          <p className="text-[13px] text-ink-4">Nessun allenatore inserito.</p>
        </div>
      )}
    </div>
  )
}
