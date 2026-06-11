import { requireLeagueContext, isSuperAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TeamCard, type MemberPickerOption } from './TeamCard'
import { ProfileEditor } from './ProfileEditor'
import { TransferInbox, type IncomingOffer } from './TransferInbox'

export const metadata = { title: 'Le mie squadre' }

export default async function MyTeamsPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const isAdmin = ctx.role === 'league_admin' || (await isSuperAdmin())

  // Parallel: profile + Serie A teams (this Lega) + FM teams (joined for
  // competition label) + Lega membership list + Serie A competitions
  // (for per-team enrolment labels) + pending transfer requests.
  const [
    profileRes,
    serieARes,
    fmRes,
    membersRes,
    serieACompsRes,
    pendingOffersRes,
    fmPendingOffersRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', ctx.userId)
      .single(),
    supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('manager_id', ctx.userId)
      .eq('league_id', ctx.league.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('fm_fantasy_team')
      .select(`
        id,
        name,
        league_competition_id,
        fm_league_competition!inner (
          league_id,
          slug,
          fm_competition_id,
          fm_competition:fm_competition_id ( name, edition )
        )
      `)
      .eq('manager_id', ctx.userId),
    supabase
      .from('league_users')
      .select(`
        user_id,
        profiles ( username, full_name )
      `)
      .eq('league_id', ctx.league.id),
    supabase
      .from('competitions')
      .select('id, name, type, status')
      .eq('league_id', ctx.league.id)
      .neq('status', 'cancelled'),
    supabase
      .from('fantasy_team_transfer_request')
      .select(`
        id,
        team_id,
        from_user_id,
        to_user_id,
        message,
        created_at,
        status
      `)
      .eq('league_id', ctx.league.id)
      .eq('status', 'pending'),
    supabase
      .from('fm_fantasy_team_transfer_request')
      .select(`
        id,
        team_id,
        from_user_id,
        to_user_id,
        league_competition_id,
        message,
        created_at,
        status
      `)
      .eq('league_id', ctx.league.id)
      .eq('status', 'pending'),
  ])

  type CompetitionTeam = { team_id: string; competition_id: string }
  const ownedSerieATeamIds = (serieARes.data ?? []).map((t) => t.id)
  const { data: enrolmentsRes } = ownedSerieATeamIds.length > 0
    ? await supabase
        .from('competition_teams')
        .select('team_id, competition_id')
        .in('team_id', ownedSerieATeamIds)
    : { data: [] as CompetitionTeam[] }

  type FMJoin = {
    league_id: string
    slug: string | null
    fm_competition_id: string
    fm_competition: { name: string; edition: string } | { name: string; edition: string }[] | null
  }
  type FMTeamRow = {
    id: string
    name: string
    league_competition_id: string
    fm_league_competition: FMJoin | FMJoin[]
  }

  type MemberRow = {
    user_id: string
    profiles: { username: string; full_name: string | null } | { username: string; full_name: string | null }[] | null
  }

  type PendingRow = {
    id: string
    team_id: string
    from_user_id: string
    to_user_id: string
    message: string | null
    created_at: string
    status: string
  }

  type FMPendingRow = PendingRow & {
    league_competition_id: string
  }

  const profile = profileRes.data
  const serieATeams = serieARes.data ?? []
  const fmTeamsRaw = (fmRes.data ?? []) as FMTeamRow[]
  const serieAComps = serieACompsRes.data ?? []
  const enrolments = (enrolmentsRes ?? []) as CompetitionTeam[]
  const memberRows = (membersRes.data ?? []) as unknown as MemberRow[]
  const pendingRows = (pendingOffersRes.data ?? []) as PendingRow[]
  const fmPendingRows = (fmPendingOffersRes.data ?? []) as FMPendingRow[]

  // Build the member lookup table once.
  type MemberLookup = { user_id: string; username: string; full_name: string | null; email: string | null }
  const memberMap = new Map<string, MemberLookup>()
  for (const m of memberRows) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    memberMap.set(m.user_id, {
      user_id:   m.user_id,
      username:  p?.username ?? '—',
      full_name: p?.full_name ?? null,
      email:     null,
    })
  }

  // Emails are PII — only fetch and expose when the viewer is a Lega admin.
  if (isAdmin) {
    const service = createServiceClient()
    const memberIds = Array.from(memberMap.keys())
    await Promise.all(memberIds.map(async (uid) => {
      const { data } = await service.auth.admin.getUserById(uid)
      const entry = memberMap.get(uid)
      if (entry && data?.user?.email) entry.email = data.user.email
    }))
  }

  // Pickable transfer targets: every other member of the Lega.
  const transferTargets: MemberPickerOption[] = Array.from(memberMap.values())
    .filter((m) => m.user_id !== ctx.userId)
    .sort((a, b) => {
      const an = a.full_name || a.username
      const bn = b.full_name || b.username
      return an.localeCompare(bn, 'it')
    })

  // FM teams in this Lega only.
  type FMTeam = {
    id: string
    name: string
    competitionName: string
    competitionEdition: string | null
    rosaHref: string
    fmCompetitionId: string
  }
  const fmTeams = fmTeamsRaw
    .map((r): FMTeam | null => {
      const join = Array.isArray(r.fm_league_competition)
        ? r.fm_league_competition[0]
        : r.fm_league_competition
      if (!join || join.league_id !== ctx.league.id) return null
      const comp = Array.isArray(join.fm_competition)
        ? join.fm_competition[0]
        : join.fm_competition
      const ref = join.slug ?? r.league_competition_id
      return {
        id: r.id,
        name: r.name,
        competitionName: comp?.name ?? 'Competizione internazionale',
        competitionEdition: comp?.edition ?? null,
        rosaHref: `/controfantamondiale/${ref}/rosa`,
        fmCompetitionId: join.fm_competition_id,
      }
    })
    .filter((t): t is FMTeam => t !== null)

  // A team's rosa is editable while its competition has an OPEN phase (the
  // redraft window). Otherwise the rosa is locked → "Visualizza" instead of
  // "Modifica". Phases are competition-level, so one lookup covers all teams.
  const fmCompetitionIds = Array.from(new Set(fmTeams.map((t) => t.fmCompetitionId)))
  const openPhaseCompetitionIds = new Set<string>()
  if (fmCompetitionIds.length > 0) {
    const { data: openPhases } = await supabase
      .from('fm_phase')
      .select('competition_id')
      .in('competition_id', fmCompetitionIds)
      .eq('status', 'open')
    for (const p of openPhases ?? []) openPhaseCompetitionIds.add(p.competition_id)
  }

  const SERIE_A_TYPE_LABEL: Record<string, string> = {
    campionato:    'Campionato',
    battle_royale: 'Battle Royal',
    coppa:         'Coppa',
  }
  const compById = new Map(serieAComps.map((c) => [c.id, c]))
  const enrolmentsByTeam = new Map<string, string[]>()
  for (const e of enrolments) {
    const c = compById.get(e.competition_id)
    if (!c) continue
    const label = `${SERIE_A_TYPE_LABEL[c.type] ?? c.type} · ${c.name}`
    const arr = enrolmentsByTeam.get(e.team_id) ?? []
    enrolmentsByTeam.set(e.team_id, [...arr, label])
  }

  // Outgoing pending offers keyed by team_id (for the owner's TeamCard).
  // Two maps because Serie A and FM team IDs share no namespace logically.
  const outgoingByTeam = new Map<string, PendingRow>()
  for (const r of pendingRows) {
    if (r.from_user_id === ctx.userId) outgoingByTeam.set(r.team_id, r)
  }
  const outgoingFMByTeam = new Map<string, FMPendingRow>()
  for (const r of fmPendingRows) {
    if (r.from_user_id === ctx.userId) outgoingFMByTeam.set(r.team_id, r)
  }

  // Resolve team + context labels for incoming offers (both kinds).
  const teamNameById = new Map<string, string>()
  for (const t of serieATeams) teamNameById.set(t.id, t.name)

  const incomingSerieATeamIds = pendingRows
    .filter((r) => r.to_user_id === ctx.userId)
    .map((r) => r.team_id)
  if (incomingSerieATeamIds.length > 0) {
    const { data: incomingTeams } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .in('id', incomingSerieATeamIds)
    for (const t of incomingTeams ?? []) teamNameById.set(t.id, t.name)
  }

  const fmTeamNameById = new Map<string, string>()
  const fmTeamCompetitionLabel = new Map<string, string>()
  for (const t of fmTeams) {
    fmTeamNameById.set(t.id, t.name)
    fmTeamCompetitionLabel.set(
      t.id,
      `${t.competitionName}${t.competitionEdition ? ' ' + t.competitionEdition : ''}`,
    )
  }
  const incomingFMTeamIds = fmPendingRows
    .filter((r) => r.to_user_id === ctx.userId && !fmTeamNameById.has(r.team_id))
    .map((r) => r.team_id)
  if (incomingFMTeamIds.length > 0) {
    const { data: incomingFM } = await supabase
      .from('fm_fantasy_team')
      .select(`
        id,
        name,
        fm_league_competition!inner (
          fm_competition:fm_competition_id ( name, edition )
        )
      `)
      .in('id', incomingFMTeamIds)
    type IncomingFMRow = {
      id: string
      name: string
      fm_league_competition: {
        fm_competition: { name: string; edition: string } | { name: string; edition: string }[] | null
      } | {
        fm_competition: { name: string; edition: string } | { name: string; edition: string }[] | null
      }[]
    }
    for (const t of (incomingFM ?? []) as IncomingFMRow[]) {
      fmTeamNameById.set(t.id, t.name)
      const join = Array.isArray(t.fm_league_competition)
        ? t.fm_league_competition[0]
        : t.fm_league_competition
      const comp = join
        ? (Array.isArray(join.fm_competition) ? join.fm_competition[0] : join.fm_competition)
        : null
      fmTeamCompetitionLabel.set(
        t.id,
        comp ? `${comp.name}${comp.edition ? ' ' + comp.edition : ''}` : 'Competizione internazionale',
      )
    }
  }

  const incomingSerieAOffers: IncomingOffer[] = pendingRows
    .filter((r) => r.to_user_id === ctx.userId)
    .map((r) => {
      const sender = memberMap.get(r.from_user_id)
      return {
        request_id:     r.id,
        team_id:        r.team_id,
        team_name:      teamNameById.get(r.team_id) ?? 'Squadra',
        level:          'nazionale' as const,
        context_label:  'Serie A',
        from_username:  sender?.username ?? '—',
        from_full_name: sender?.full_name ?? null,
        message:        r.message,
        created_at:     r.created_at,
      }
    })

  const incomingFMOffers: IncomingOffer[] = fmPendingRows
    .filter((r) => r.to_user_id === ctx.userId)
    .map((r) => {
      const sender = memberMap.get(r.from_user_id)
      return {
        request_id:     r.id,
        team_id:        r.team_id,
        team_name:      fmTeamNameById.get(r.team_id) ?? 'Squadra CFM',
        level:          'internazionale' as const,
        context_label:  fmTeamCompetitionLabel.get(r.team_id) ?? 'Competizione internazionale',
        from_username:  sender?.username ?? '—',
        from_full_name: sender?.full_name ?? null,
        message:        r.message,
        created_at:     r.created_at,
      }
    })

  const incomingOffers: IncomingOffer[] = [...incomingSerieAOffers, ...incomingFMOffers]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const totalTeams = serieATeams.length + fmTeams.length

  return (
    <div className="space-y-7">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-4">
          Lega · {ctx.league.name ?? 'Lega'}
        </p>
        <h1
          className="mt-1 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
        >
          <span className="font-semibold">Le mie squadre</span>
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {totalTeams === 0
            ? 'Non hai ancora squadre in questa Lega. Iscriviti a una competizione dalla dashboard.'
            : `${totalTeams} ${totalTeams === 1 ? 'squadra' : 'squadre'} in questa Lega.`}
        </p>
      </div>

      <TransferInbox offers={incomingOffers} />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Livello nazionale
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-indigo-700 ring-1 ring-indigo-500/30 dark:text-indigo-300">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> Livello internazionale
        </span>
        <span className="text-ink-5">— il colore identifica il livello della competizione a cui appartiene la squadra.</span>
      </div>

      {/* Nazionale section */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
          <span className="inline-block h-1.5 w-6 rounded-full bg-emerald-500" />
          Livello nazionale · Serie A
        </h2>
        {serieATeams.length === 0 ? (
          <EmptyTeamSlot
            text="Nessuna squadra di Serie A. Iscriviti dalla dashboard a un Campionato, Coppa o Battle Royal."
            tone="emerald"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {serieATeams.map((t) => {
              const enrolledIn = enrolmentsByTeam.get(t.id) ?? []
              const subLabel = enrolledIn.length > 0
                ? enrolledIn.join(' · ')
                : 'Non ancora iscritta a competizioni'
              const pending = outgoingByTeam.get(t.id)
              const recipient = pending ? memberMap.get(pending.to_user_id) : null
              return (
                <TeamCard
                  key={t.id}
                  teamId={t.id}
                  name={t.name}
                  level="nazionale"
                  competitionLabel="Serie A"
                  competitionSubLabel={subLabel}
                  members={transferTargets}
                  pendingOffer={pending && recipient
                    ? {
                        request_id:   pending.id,
                        to_username:  recipient.username,
                        to_full_name: recipient.full_name,
                      }
                    : null}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Internazionale section */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
          <span className="inline-block h-1.5 w-6 rounded-full bg-indigo-500" />
          Livello internazionale · Mondiali · Europei · Nations
        </h2>
        {fmTeams.length === 0 ? (
          <EmptyTeamSlot
            text="Nessuna squadra in competizioni internazionali. Iscrivi la tua Lega a un torneo dalla dashboard."
            tone="indigo"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {fmTeams.map((t) => {
              const pending = outgoingFMByTeam.get(t.id)
              const recipient = pending ? memberMap.get(pending.to_user_id) : null
              return (
                <TeamCard
                  key={t.id}
                  teamId={t.id}
                  name={t.name}
                  level="internazionale"
                  competitionLabel={t.competitionName}
                  competitionSubLabel={t.competitionEdition}
                  members={transferTargets}
                  rosaHref={t.rosaHref}
                  rosaOpen={openPhaseCompetitionIds.has(t.fmCompetitionId)}
                  pendingOffer={pending && recipient
                    ? {
                        request_id:   pending.id,
                        to_username:  recipient.username,
                        to_full_name: recipient.full_name,
                      }
                    : null}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Profile editor */}
      <Card>
        <CardHeader
          title="Il mio profilo"
          description="Nome da Allenatore (visibile in Lega) e Nome Utente (il tuo @handle)."
        />
        <CardContent>
          <ProfileEditor
            initialFullName={profile?.full_name ?? ''}
            initialUsername={profile?.username ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyTeamSlot({ text, tone }: { text: string; tone: 'emerald' | 'indigo' }) {
  const ring = tone === 'emerald'
    ? 'border-emerald-500/20'
    : 'border-indigo-500/20'
  return (
    <div className={`rounded-2xl border border-dashed ${ring} bg-glass-1 px-5 py-6 text-center backdrop-blur-xl`}>
      <p className="text-[12.5px] text-ink-4">{text}</p>
    </div>
  )
}
