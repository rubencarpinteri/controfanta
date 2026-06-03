import { requireFMContext, assertSuperAdmin, getFMCoaches, getFMTeams, getFMPhases } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { addCoachAction, deleteCoachAction, setCoachTierAction } from './actions'

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
  const [coaches, teams, phases] = await Promise.all([
    getFMCoaches(ctx.competition.id),
    getFMTeams(ctx.competition.id),
    getFMPhases(ctx.competition.id),
  ])

  const supabase = await createClient()
  const { data: tierRows } = await supabase
    .from('fm_phase_coach_tier')
    .select('phase_id, coach_id, tier, odds_value')
    .in('phase_id', phases.map((p) => p.id))

  const tierMap = new Map<string, { tier: string; odds_value: number | null }>(
    (tierRows ?? []).map((r) => [`${r.phase_id}:${r.coach_id}`, { tier: r.tier, odds_value: r.odds_value }])
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

      {/* ── Coach list with tier assignment per phase ──────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-hairline grid grid-cols-[1fr_repeat(6,auto)] gap-3 items-center">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">Allenatore</p>
          {phases.map((phase) => (
            <p key={phase.id} className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 text-center w-24 truncate">
              {phase.name.split(' ')[0]}
            </p>
          ))}
          <span />
        </div>
        <div className="divide-y divide-hairline">
          {coaches.map((coach) => (
            <div key={coach.id} className="grid grid-cols-[1fr_repeat(6,auto)] gap-3 items-center px-4 py-2.5">
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
              {phases.map((phase) => {
                const key = `${phase.id}:${coach.id}`
                const current = tierMap.get(key)
                return (
                  <form key={phase.id} action={setCoachTierAction} className="w-24">
                    <input type="hidden" name="competition_id" value={id} />
                    <input type="hidden" name="phase_id" value={phase.id} />
                    <input type="hidden" name="coach_id" value={coach.id} />
                    <select
                      name="tier"
                      defaultValue={current?.tier ?? ''}
                      onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}
                      className={`w-full rounded border px-1 py-1 text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                        current ? TIER_LABELS[current.tier]?.cls ?? '' : 'text-ink-5 border-hairline bg-glass-2'
                      } border-hairline bg-glass-2`}
                    >
                      <option value="">—</option>
                      <option value="tier_1">T1</option>
                      <option value="tier_2">T2</option>
                      <option value="tier_3">T3</option>
                      <option value="tier_4">T4</option>
                    </select>
                  </form>
                )
              })}
              <form action={deleteCoachAction.bind(null, coach.id, id)}>
                <button type="submit" className="text-[10px] text-ink-5 hover:text-rose-400 transition-colors">✕</button>
              </form>
            </div>
          ))}
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
