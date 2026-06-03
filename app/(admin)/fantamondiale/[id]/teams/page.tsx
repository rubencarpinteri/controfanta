import { requireFMContext, assertSuperAdmin, getFMTeams } from '@/lib/fantamondiale/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { addTeamAction, eliminateTeamAction, reactivateTeamAction } from './actions'
import { DeleteTeamButton } from './DeleteTeamButton'

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)
  const teams = await getFMTeams(ctx.competition.id)

  const active = teams.filter((t) => t.status === 'active')
  const eliminated = teams.filter((t) => t.status === 'eliminated')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Nazioni</h2>
        <span className="text-[11px] text-ink-4">{active.length} attive · {eliminated.length} eliminate</span>
      </div>

      {/* ── Add team form ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-4">Aggiungi nazione</p>
        <form action={addTeamAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="competition_id" value={id} />
          <input
            name="name" placeholder="Nome (es. Francia)" required
            className="col-span-2 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            name="fifa_code" placeholder="Codice FIFA (es. FRA)" required maxLength={10}
            className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            name="flag_emoji" placeholder="🇫🇷" maxLength={8}
            className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            name="sportmonks_team_id" placeholder="SportMonks team ID" type="number"
            className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Aggiungi
          </button>
        </form>
      </div>

      {/* ── Active teams ─────────────────────────────────────────────────────── */}
      {active.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hairline">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">Attive ({active.length})</p>
          </div>
          <div className="divide-y divide-hairline">
            {active.map((team) => (
              <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
                <TeamCrest name={team.name} logoUrl={team.logo_url} flagUrl={team.flag_url} fifaCode={team.fifa_code} size={24} className="w-7" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink-1 truncate">{team.name}</p>
                  <p className="text-[10px] text-ink-5 font-mono">{team.fifa_code}{team.sportmonks_team_id ? ` · FM:${team.sportmonks_team_id}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <form action={eliminateTeamAction.bind(null, team.id, id)}>
                    <button type="submit" className="rounded px-2 py-1 text-[10px] font-medium text-rose-400 bg-rose-400/10 hover:bg-rose-400/20 transition-colors">
                      Segna come eliminata
                    </button>
                  </form>
                  <DeleteTeamButton teamId={team.id} competitionId={id} teamName={team.name} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Eliminated teams ─────────────────────────────────────────────────── */}
      {eliminated.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hairline">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400">Eliminate ({eliminated.length})</p>
          </div>
          <div className="divide-y divide-hairline">
            {eliminated.map((team) => (
              <div key={team.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                <TeamCrest name={team.name} logoUrl={team.logo_url} flagUrl={team.flag_url} fifaCode={team.fifa_code} size={24} className="w-7 grayscale opacity-60" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink-4 truncate line-through">{team.name}</p>
                  <p className="text-[10px] text-ink-5 font-mono">{team.fifa_code}</p>
                </div>
                <form action={reactivateTeamAction.bind(null, team.id, id)}>
                  <button type="submit" className="rounded px-2 py-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors">
                    Ripristina
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 px-6 py-10 text-center">
          <p className="text-[13px] text-ink-4">Nessuna nazione aggiunta.</p>
          <p className="mt-1 text-[11px] text-ink-5">Aggiungi le 48 nazionali partecipanti via il form sopra.</p>
        </div>
      )}
    </div>
  )
}
