import { requireFMContext, getFMTeams, getFMPlayers } from '@/lib/fantamondiale/server'
import { TeamCrest } from '@/components/fm/TeamCrest'

export const metadata = { title: 'Rose Nazionali' }

// Display order + Italian labels for the player roles.
const ROLE_GROUPS = [
  { code: 'P', label: 'Portieri', cls: 'text-amber-400' },
  { code: 'D', label: 'Difensori', cls: 'text-emerald-400' },
  { code: 'C', label: 'Centrocampisti', cls: 'text-indigo-400' },
  { code: 'A', label: 'Attaccanti', cls: 'text-rose-400' },
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

  const [teams, players] = await Promise.all([
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id),
  ])

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-1">Rose Nazionali</h2>
          <p className="mt-0.5 text-[12px] text-ink-4">
            Tutte le squadre del Mondiale divise per girone ufficiale. Tocca una nazionale per vedere i convocati.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> In gara ({activeCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Eliminata
          </span>
        </div>
      </div>

      {/* Groups */}
      {sortedGroups.map(([key, groupTeams]) => (
        <section key={key} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">
            {girone(key === '￿' ? null : key)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {groupTeams
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((team) => {
                const squad = (playersByTeam.get(team.id) ?? []).slice()
                const eliminated = team.status === 'eliminated'
                return (
                  <details
                    key={team.id}
                    className="group rounded-xl border border-hairline bg-glass-1 overflow-hidden"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-glass-2 transition-colors">
                      <span className="relative shrink-0">
                        <TeamCrest
                          name={team.name}
                          logoUrl={team.logo_url}
                          flagUrl={team.flag_url}
                          fifaCode={team.fifa_code}
                          size={26}
                          className={eliminated ? 'grayscale opacity-50' : ''}
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-0 ${
                            eliminated ? 'bg-rose-500' : 'bg-emerald-400'
                          }`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-semibold ${eliminated ? 'text-ink-4' : 'text-ink-1'}`}>
                          {team.name}
                        </span>
                        <span className="block text-[10px] text-ink-5">
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

                    <div className="border-t border-hairline px-4 py-3 space-y-3">
                      {ROLE_GROUPS.map(({ code, label, cls }) => {
                        const rolePlayers = squad
                          .filter((p) => p.role === code)
                          .sort((a, b) => (a.shirt_number ?? 99) - (b.shirt_number ?? 99) || a.name.localeCompare(b.name))
                        if (rolePlayers.length === 0) return null
                        return (
                          <div key={code}>
                            <p className={`mb-1 text-[10px] font-semibold uppercase tracking-widest ${cls}`}>
                              {label}
                            </p>
                            <ul className="space-y-0.5">
                              {rolePlayers.map((p) => (
                                <li key={p.id} className="flex items-center gap-2 text-[12px] text-ink-2">
                                  <span className="w-6 shrink-0 text-right tabular-nums text-[10px] text-ink-5">
                                    {p.shirt_number ?? '—'}
                                  </span>
                                  <span className="truncate">{p.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                      {squad.length === 0 && (
                        <p className="text-[11px] text-ink-5">Nessun convocato disponibile.</p>
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
