import { requireFMContext, assertSuperAdmin, getFMTeams, getFMPlayers } from '@/lib/fantamondiale/server'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { addPlayersAction, deletePlayerAction } from './actions'

const ROLE_COLORS: Record<string, string> = {
  P: 'text-amber-400 bg-amber-400/10',
  D: 'text-emerald-400 bg-emerald-400/10',
  C: 'text-indigo-400 bg-indigo-400/10',
  A: 'text-rose-400 bg-rose-400/10',
}

export default async function PlayersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)

  const [teams, players] = await Promise.all([
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id),
  ])

  const activeTeams = teams.filter((t) => t.status === 'active')

  const roleCounts = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Giocatori</h2>
        <div className="flex items-center gap-3 text-[11px] text-ink-4">
          {(['P', 'D', 'C', 'A'] as const).map((r) => (
            <span key={r}>
              <span className={`font-semibold ${ROLE_COLORS[r]?.split(' ')[0]}`}>{r}</span>{' '}
              {roleCounts[r] ?? 0}
            </span>
          ))}
          <span className="text-ink-5">Tot: {players.length}</span>
        </div>
      </div>

      {/* ── Bulk add form ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-4">
          Aggiungi giocatori (una riga = un giocatore)
        </p>
        <p className="mb-3 text-[10px] text-ink-5">
          Formato: <code className="font-mono text-ink-4">sportmonks_player_id, nome, numero, ruolo (P/D/C/A), prezzo_base</code>
          <br />
          Esempio: <code className="font-mono text-ink-4">345678, Mbappé K., 10, A, 35</code>
        </p>
        <form action={addPlayersAction} className="space-y-3">
          <input type="hidden" name="competition_id" value={id} />
          <select
            name="national_team_id" required
            className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">— Seleziona nazione —</option>
            {activeTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.fifa_code})
              </option>
            ))}
          </select>
          <textarea
            name="bulk_lines"
            rows={6}
            placeholder={'345678, Mbappé K., 10, A, 35\n901234, Hernandez T., 19, D, 18'}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 font-mono text-[12px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Importa giocatori
          </button>
        </form>
      </div>

      {/* ── Player list grouped by team ─────────────────────────────────────── */}
      {teams.map((team) => {
        const teamPlayers = players.filter((p) => p.national_team_id === team.id)
        if (teamPlayers.length === 0) return null
        return (
          <div key={team.id} className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-hairline">
              <TeamCrest name={team.name} logoUrl={team.logo_url} flagUrl={team.flag_url} fifaCode={team.fifa_code} size={18} />
              <p className="text-[12px] font-semibold text-ink-1">{team.name}</p>
              <span className="ml-auto text-[10px] text-ink-5">{teamPlayers.length} giocatori</span>
            </div>
            <div className="divide-y divide-hairline">
              {teamPlayers.map((player) => (
                <div key={player.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-5 text-right text-[10px] text-ink-5 tabular-nums shrink-0">
                    {player.shirt_number ?? '—'}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${ROLE_COLORS[player.role] ?? ''}`}>
                    {player.role}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-ink-1 truncate">{player.name}</span>
                  <span className="text-[10px] text-ink-5 font-mono shrink-0">FM:{player.sportmonks_player_id}</span>
                  <span className="text-[11px] text-ink-3 tabular-nums shrink-0">{player.base_price}cr</span>
                  <form action={deletePlayerAction.bind(null, player.id, id)}>
                    <button type="submit" className="text-[10px] text-ink-5 hover:text-rose-400 transition-colors shrink-0">✕</button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {players.length === 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 px-6 py-10 text-center">
          <p className="text-[13px] text-ink-4">Nessun giocatore aggiunto.</p>
          <p className="mt-1 text-[11px] text-ink-5">
            Usa il form sopra per importare i giocatori con i loro SportMonks ID.
          </p>
        </div>
      )}
    </div>
  )
}
