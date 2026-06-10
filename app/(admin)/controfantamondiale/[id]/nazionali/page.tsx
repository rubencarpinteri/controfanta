import { requireFMContext, getFMTeams, getFMPlayers, getFMCoaches } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'

export const metadata = { title: 'Rose Nazionali' }

// Display order + Italian labels for the player roles (semantic role tints).
const ROLE_GROUPS = [
  { code: 'P', label: 'Portieri', cls: 'text-role-por' },
  { code: 'D', label: 'Difensori', cls: 'text-role-def' },
  { code: 'C', label: 'Centrocampisti', cls: 'text-role-mid' },
  { code: 'A', label: 'Attaccanti', cls: 'text-role-att' },
] as const

// "Group A" → "Girone A" for the Italian UI.
function girone(label: string | null): string {
  if (!label) return 'Senza girone'
  return label.replace(/^Group\b/i, 'Girone')
}

export default async function RoseNazionaliPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const [teams, players, coaches] = await Promise.all([
    getFMTeams(ctx.competition.id),
    // Manager-facing listone surface: mirror the squad builder and hide
    // final-cut / inactive players (e.g. not called up for the WC) so the
    // convocati here match exactly what can be drafted in "La mia rosa".
    getFMPlayers(ctx.competition.id, { activeOnly: true }),
    getFMCoaches(ctx.competition.id),
  ])

  // Frozen competition-level coach tiers, mapped to each national team via its
  // coach so the allenatore (name + tier) can sit at the foot of every squad.
  const { data: tierRows } = await supabase
    .from('fm_competition_coach_tier')
    .select('coach_id, tier')
    .eq('competition_id', ctx.competition.id)
  const tierByCoach = new Map<string, string>((tierRows ?? []).map((r) => [r.coach_id, r.tier]))
  const coachByTeam = new Map<string, { name: string; tier: string | null }>()
  for (const c of coaches) {
    coachByTeam.set(c.national_team_id, { name: c.name, tier: tierByCoach.get(c.id) ?? null })
  }

  // Players bucketed by team.
  const playersByTeam = new Map<string, typeof players>()
  for (const p of players) {
    const arr = playersByTeam.get(p.national_team_id) ?? []
    arr.push(p)
    playersByTeam.set(p.national_team_id, arr)
  }

  // Teams bucketed by group, groups sorted A→L (nulls last).
  const groups = new Map<string, typeof teams>()
  for (const t of teams) {
    const key = t.group_label ?? '￿' // sort nulls last
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))

  const activeCount = teams.filter((t) => t.status === 'active').length

  return (
    <div className="space-y-6">
      {/* Header + legend */}
      <header className="pt-1">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
          Mondiale · {teams.length} nazionali
        </p>
        <div className="flex items-start justify-between gap-3">
          <h1
            className="font-semibold tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(26px, 7vw, 32px)', lineHeight: 1.12, letterSpacing: '-0.03em' }}
          >
            Rose <span className="serif text-ink-3">nazionali</span>
          </h1>
          <a
            href={`/api/fm/${id}/listone`}
            download
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline bg-glass-1 px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-glass-2 hover:text-ink-1"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Scarica CSV
          </a>
        </div>
        <p className="mt-2 max-w-prose text-[13.5px] leading-snug text-ink-3">
          Tutte le squadre del Mondiale divise per girone. Tocca una nazionale per vedere i convocati, le quotazioni e l&apos;allenatore.
        </p>
        <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> In gara ({activeCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Eliminata
          </span>
        </div>
      </header>

      {/* Groups */}
      {sortedGroups.map(([key, groupTeams]) => (
        <section key={key} className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
            {girone(key === '￿' ? null : key)}
          </p>
          {/* items-start: keep each card at its own height so opening one
              <details> doesn't stretch its row-neighbor into an empty box. */}
          <div className="grid items-start gap-2.5 sm:grid-cols-2">
            {groupTeams
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((team) => {
                const squad = (playersByTeam.get(team.id) ?? []).slice()
                const eliminated = team.status === 'eliminated'
                const coach = coachByTeam.get(team.id) ?? null
                return (
                  <details
                    key={team.id}
                    className="group overflow-hidden rounded-2xl border border-hairline bg-glass-1 backdrop-blur-xl"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-glass-2">
                      <span className="relative shrink-0">
                        <TeamCrest
                          name={team.name}
                          logoUrl={team.logo_url}
                          flagUrl={team.flag_url}
                          fifaCode={team.fifa_code}
                          size={28}
                          className={eliminated ? 'opacity-50 grayscale' : ''}
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-0 ${
                            eliminated ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14.5px] font-semibold ${eliminated ? 'text-ink-4' : 'text-ink-1'}`}>
                          {team.name}
                        </span>
                        <span className="mono block text-[11px] text-ink-5">
                          {team.fifa_code} · {squad.length} convocati{eliminated ? ' · eliminata' : ''}
                        </span>
                      </span>
                      <svg
                        className="h-4 w-4 shrink-0 text-ink-5 transition-transform group-open:rotate-180"
                        viewBox="0 0 16 16" fill="none"
                      >
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>

                    <div className="space-y-3 border-t border-hairline px-4 py-3.5">
                      {ROLE_GROUPS.map(({ code, label, cls }) => {
                        const rolePlayers = squad
                          .filter((p) => p.role === code)
                          .sort((a, b) => (a.shirt_number ?? 99) - (b.shirt_number ?? 99) || a.name.localeCompare(b.name))
                        if (rolePlayers.length === 0) return null
                        return (
                          <div key={code}>
                            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls}`}>
                              {label}
                            </p>
                            <ul className="space-y-0.5">
                              {rolePlayers.map((p) => (
                                <li key={p.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                                  <span className="mono w-6 shrink-0 text-right text-[11px] tabular-nums text-ink-5">
                                    {p.shirt_number ?? '—'}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                  <span className="mono shrink-0 text-[12px] font-semibold tabular-nums text-ink-3">
                                    {p.base_price} <span className="text-[9px] font-normal text-ink-5">cr</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                      {squad.length === 0 && (
                        <p className="text-[12px] text-ink-5">Nessun convocato disponibile.</p>
                      )}

                      {/* Allenatore — name + frozen tier, at the foot of the squad. */}
                      {coach && (
                        <div className="flex items-center gap-2 border-t border-hairline pt-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                            Allenatore
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-1">
                            {coach.name}
                          </span>
                          <CoachTierBadge tier={coach.tier} full />
                        </div>
                      )}
                    </div>
                  </details>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
