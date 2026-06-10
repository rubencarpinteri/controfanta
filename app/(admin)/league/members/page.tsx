import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { InviteMemberForm } from './InviteMemberForm'
import { CreateTeamForm } from './CreateTeamForm'
import { ChangeRoleForm, RemoveMemberButton } from './MemberActions'
import { InviteLinkCard } from './InviteLinkCard'
import { TeamAssignmentCell } from './TeamAssignmentCell'

export const metadata = { title: 'Membri lega' }

export default async function LeagueMembersPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch the league's current invite token
  const { data: leagueRow } = await supabase
    .from('leagues')
    .select('invite_token')
    .eq('id', ctx.league.id)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://controfanta.vercel.app'
  const joinUrl = leagueRow?.invite_token ? `${appUrl}/join/${leagueRow.invite_token}` : null

  // Fetch all members with profile info
  const { data: members } = await supabase
    .from('league_users')
    .select(`
      user_id,
      role,
      joined_at,
      profiles ( username, full_name )
    `)
    .eq('league_id', ctx.league.id)
    .order('joined_at', { ascending: true })

  // Teams live in the FantaMondiale model (fm_fantasy_team), scoped to a
  // league_competition — NOT the legacy `fantasy_teams` table (purged with the
  // Serie A trial). Resolve the league's active competition and read its teams.
  const { data: activeComp } = await supabase
    .from('fm_league_competition')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: allTeams } = activeComp
    ? await supabase
        .from('fm_fantasy_team')
        .select('id, name, manager_id')
        .eq('league_competition_id', activeComp.id)
        .order('name', { ascending: true })
    : { data: [] }

  type Member = {
    user_id: string
    role: 'manager' | 'league_admin'
    joined_at: string
    profiles: { username: string; full_name: string } | null
  }

  type Team = { id: string; name: string; manager_id: string }

  const memberList = (members ?? []) as unknown as Member[]
  const teamList   = (allTeams ?? []) as Team[]

  // Build a map: manager_id → teams (full row, admin may own multiple)
  const teamsByManager = new Map<string, Team[]>()
  for (const t of teamList) {
    const existing = teamsByManager.get(t.manager_id) ?? []
    teamsByManager.set(t.manager_id, [...existing, t])
  }

  // FM teams are self-created by managers; there is no legacy "placeholder"
  // assignment pool, so the inline assign/unassign UI is suppressed (read-only).
  const adminOwnedTeams: Team[] = []

  const fmt = (dt: string) =>
    new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' }).format(new Date(dt))

  const roleBadge = (role: string) =>
    role === 'league_admin'
      ? 'text-indigo-300 bg-indigo-500/10'
      : 'text-ink-3 bg-glass-1'

  const roleLabel = (role: string) =>
    role === 'league_admin' ? 'Admin' : 'Manager'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a href="/league" className="text-sm text-ink-4 hover:text-indigo-400">
            ← Impostazioni lega
          </a>
          <h1 className="mt-1 text-xl font-bold text-ink-1">Membri lega</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            {memberList.length} {memberList.length === 1 ? 'membro' : 'membri'} · {teamList.length} squadre · {ctx.league.name}
          </p>
        </div>
        <a
          href="/leagues/new"
          className="shrink-0 rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12px] text-ink-3 hover:border-indigo-500/40 hover:text-ink-1 transition-colors"
        >
          + Nuova lega
        </a>
      </div>

      {/* Shareable invite link */}
      <InviteLinkCard
        joinUrl={joinUrl}
        leagueName={ctx.league.name}
      />

      {/* Member list */}
      <Card>
        <CardHeader title="Membri attuali" />
        <CardContent className="p-0">
          {memberList.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-ink-4">
              Nessun membro. Invita il primo manager qui sotto.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-6 py-2.5 text-left text-xs font-medium text-ink-4">Utente</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Squadre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Ruolo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-4">Iscritto</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-4">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {memberList.map((m) => {
                  const isSelf = m.user_id === ctx.userId
                  const teams  = teamsByManager.get(m.user_id) ?? []
                  return (
                    <tr key={m.user_id} className="hover:bg-glass-1">
                      <td className="px-6 py-3">
                        <div className="font-medium text-ink-1">
                          {m.profiles?.full_name || m.profiles?.username || '—'}
                        </div>
                        <div className="text-xs text-ink-4">@{m.profiles?.username ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <TeamAssignmentCell
                          memberUserId={m.user_id}
                          isSelf={true}
                          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
                          availablePlaceholders={adminOwnedTeams.map((t) => ({ id: t.id, name: t.name }))}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadge(m.role)}`}>
                            {roleLabel(m.role)}
                          </span>
                        ) : (
                          <ChangeRoleForm memberId={m.user_id} currentRole={m.role} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-4">{fmt(m.joined_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {isSelf ? (
                          <span className="text-xs text-ink-5">Tu</span>
                        ) : (
                          <RemoveMemberButton
                            memberId={m.user_id}
                            name={m.profiles?.full_name || m.profiles?.username || m.user_id}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create team shortcut */}
      <Card>
        <CardHeader
          title="Crea squadra"
          description="Crea una squadra placeholder. Potrai assegnarla a un manager quando lo inviti."
        />
        <CardContent>
          <CreateTeamForm />
          {adminOwnedTeams.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-ink-4">Squadre placeholder (non ancora assegnate a un manager):</p>
              <div className="flex flex-wrap gap-1.5">
                {adminOwnedTeams.map((t) => (
                  <span
                    key={t.id}
                    className="rounded border border-hairline bg-glass-1 px-2 py-0.5 text-xs text-ink-3"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite form */}
      <Card>
        <CardHeader
          title="Invita manager"
          description="Il manager riceverà un'email con il link per impostare la password e accedere all'app."
        />
        <CardContent>
          <InviteMemberForm unassignedTeams={adminOwnedTeams} />
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="rounded-lg border border-hairline bg-surface-0 px-4 py-3 text-xs text-ink-4 space-y-1">
        <p>
          <span className="text-ink-3">Invito:</span> il manager riceve un link valido 24h. Cliccando il link, imposta la password e accede direttamente al proprio pannello.
        </p>
        <p>
          <span className="text-ink-3">Assegnazione:</span> puoi creare le squadre in anticipo e assegnarle ai manager al momento dell&apos;invito.
        </p>
        <p>
          <span className="text-ink-3">Rimozione:</span> rimuovere un membro elimina la sua squadra ma non cancella il suo account Supabase. Può essere reinvitato in futuro.
        </p>
      </div>
    </div>
  )
}
