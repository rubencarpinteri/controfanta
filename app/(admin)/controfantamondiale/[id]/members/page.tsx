import { requireFMContext, assertSuperAdmin, getFMFantasyTeams } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { addMemberAction, removeMemberAction } from './actions'

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const _ctx = await requireFMContext(id)
  assertSuperAdmin(_ctx)
  const fantasyTeams = await getFMFantasyTeams(id)

  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .order('username')

  const enrolledUserIds = new Set(fantasyTeams.map((t) => t.manager_id))
  const unenrolled = (profiles ?? []).filter((p) => !enrolledUserIds.has(p.id))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Iscritti</h2>
        <span className="text-[11px] text-ink-4">{fantasyTeams.length} squadre</span>
      </div>

      {/* ── Enroll user ───────────────────────────────────────────────────────── */}
      {unenrolled.length > 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-4">Aggiungi iscritto</p>
          <form action={addMemberAction} className="flex gap-2">
            <input type="hidden" name="league_competition_id" value={id} />
            <select
              name="user_id" required
              className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Seleziona utente —</option>
              {unenrolled.map((p) => (
                <option key={p.id} value={p.id}>{p.username}{p.full_name ? ` (${p.full_name})` : ''}</option>
              ))}
            </select>
            <input
              name="team_name" placeholder="Nome squadra" required maxLength={80}
              className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Iscrivi
            </button>
          </form>
        </div>
      )}

      {/* ── Enrolled teams ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
        {fantasyTeams.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-ink-4">Nessun iscritto.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {fantasyTeams.map((team, i) => {
              const profile = (profiles ?? []).find((p) => p.id === team.manager_id)
              return (
                <div key={team.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-right text-[10px] text-ink-5 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink-1 truncate">{team.name}</p>
                    <p className="text-[10px] text-ink-5">{profile?.username ?? team.manager_id}</p>
                  </div>
                  <form action={removeMemberAction.bind(null, team.id, id)}>
                    <button type="submit" className="rounded px-2 py-1 text-[10px] text-rose-400 bg-rose-400/10 hover:bg-rose-400/20 transition-colors">
                      Rimuovi
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
