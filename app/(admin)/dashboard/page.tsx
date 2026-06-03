import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import { requireLeagueContext, isSuperAdmin } from '@/lib/league'
import { optLegaIntoFMCompetitionAction } from './actions'

export const metadata = { title: 'La tua Lega' }

type SerieAType = 'campionato' | 'battle_royale' | 'coppa'
type SerieAStatus = 'setup' | 'active' | 'completed' | 'cancelled'

interface SerieARow {
  id: string
  slug: string | null
  name: string
  type: SerieAType
  season: string | null
  status: SerieAStatus
}

interface FMRow {
  id: string
  name: string
  edition: string
  starts_at: string | null
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'archived'
}

const SERIE_A_TYPE_LABEL: Record<SerieAType, string> = {
  campionato:    'Campionato',
  battle_royale: 'Battle Royal',
  coppa:         'Coppa',
}

const SERIE_A_TYPE_ICON: Record<SerieAType, string> = {
  campionato:    '🏟',
  battle_royale: '⚔',
  coppa:         '🏆',
}

const SERIE_A_TYPE_TINT: Record<SerieAType, string> = {
  campionato:    'text-emerald-600 dark:text-emerald-300',
  battle_royale: 'text-rose-600 dark:text-rose-300',
  coppa:         'text-amber-600 dark:text-amber-300',
}

function serieAStatusBadge(status: SerieAStatus): { label: string; cls: string } {
  switch (status) {
    case 'setup':     return { label: 'Setup',     cls: 'bg-glass-2 text-ink-4' }
    case 'active':    return { label: 'In corso',  cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' }
    case 'completed': return { label: 'Conclusa',  cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' }
    case 'cancelled': return { label: 'Annullata', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' }
  }
}

function fmStatusBadge(status: FMRow['status']): { label: string; cls: string } {
  switch (status) {
    case 'draft':       return { label: 'Bozza',             cls: 'bg-glass-2 text-ink-4' }
    case 'open':        return { label: 'Iscrizioni aperte', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' }
    case 'in_progress': return { label: 'In corso',          cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' }
    case 'completed':   return { label: 'Conclusa',          cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' }
    case 'archived':    return { label: 'Archiviata',        cls: 'bg-glass-2 text-ink-5' }
  }
}

// Temporary: the Serie A trial was scrapped (Jun 2026) and Serie A will be
// rebuilt FM-style later. For now the Lega only plays ControFanta Mondiale,
// so we hide the Serie A surface from the dashboard. Flip back to `true`
// (and re-enable the sidebar/admin entry points) when Serie A returns.
const SHOW_SERIE_A = false

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const isAdmin = ctx.role === 'league_admin' || (await isSuperAdmin())

  const [profileRes, serieARes, fmRes, mySerieATeamRes, myFMTeamsRes, legaInstancesRes] = await Promise.all([
    supabase.from('profiles').select('full_name, username').eq('id', ctx.userId).maybeSingle(),
    supabase
      .from('competitions')
      .select('id, slug, name, type, season, status')
      .eq('league_id', ctx.league.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true }),
    supabase
      .from('fm_competition')
      .select('id, name, edition, starts_at, status')
      .neq('status', 'draft')
      .neq('status', 'archived')
      .order('starts_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('manager_id', ctx.userId)
      .eq('league_id', ctx.league.id)
      .maybeSingle(),
    supabase
      .from('fm_fantasy_team')
      .select('id, name, league_competition_id, fm_league_competition!inner(fm_competition_id)')
      .eq('manager_id', ctx.userId),
    // Which global tournaments has THIS Lega opted into?
    supabase
      .from('fm_league_competition')
      .select('id, slug, fm_competition_id')
      .eq('league_id', ctx.league.id)
      .eq('status', 'active'),
  ])

  const profile = profileRes.data
  const serieAList = (serieARes.data ?? []) as SerieARow[]
  const fmList = (fmRes.data ?? []) as FMRow[]
  const mySerieATeam = mySerieATeamRes.data

  // Resolve which Serie A competitions the user's fantasy team is enrolled in.
  let mySerieAEnrolments = new Set<string>()
  if (mySerieATeam) {
    const { data: enrolments } = await supabase
      .from('competition_teams')
      .select('competition_id')
      .eq('team_id', mySerieATeam.id)
    mySerieAEnrolments = new Set((enrolments ?? []).map((r) => r.competition_id))
  }

  // Map fm_competition_id → user's team in this Lega's instance of that tournament.
  type MyFMTeamRow = {
    id: string
    name: string
    league_competition_id: string
    fm_league_competition: { fm_competition_id: string } | { fm_competition_id: string }[]
  }
  const myFMTeams = new Map<string, { id: string; name: string; legaCompId: string }>()
  for (const r of (myFMTeamsRes.data ?? []) as MyFMTeamRow[]) {
    const join = Array.isArray(r.fm_league_competition)
      ? r.fm_league_competition[0]
      : r.fm_league_competition
    if (!join) continue
    myFMTeams.set(join.fm_competition_id, {
      id: r.id,
      name: r.name,
      legaCompId: r.league_competition_id,
    })
  }

  // fm_competition_id → this Lega's instance URL ref (slug, falling back to
  // UUID) so cards link to the Lega's private game state, not the global
  // tournament. Missing entry means the Lega hasn't opted in yet.
  const legaInstanceByCompId = new Map<string, string>(
    (legaInstancesRes.data ?? []).map((r) => [r.fm_competition_id, r.slug ?? r.id])
  )

  const firstName =
    profile?.full_name?.trim().split(' ')[0] ||
    profile?.username ||
    user?.email?.split('@')[0] ||
    null

  const activeCount =
    serieAList.filter((c) => c.status === 'active' || c.status === 'setup').length +
    fmList.filter((c) => c.status === 'open' || c.status === 'in_progress').length

  return (
    <div className="space-y-10">
      {/* Header */}
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-4">
              La tua Lega
            </p>
            <h1
              className="mt-1 flex flex-wrap items-baseline gap-x-3 font-light tracking-tight text-ink-1"
              style={{ fontSize: 'clamp(24px, 3.4vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.03em' }}
            >
              <span className="font-semibold">{ctx.league.name ?? 'Lega'}</span>
              {ctx.league.season_name && (
                <span className="serif font-normal text-ink-3">{ctx.league.season_name}</span>
              )}
            </h1>
            <p className="mt-2 text-[13.5px] text-ink-3">
              {firstName ? `Bentornato ${firstName}` : 'Bentornato'} ·{' '}
              <span className="text-ink-4">{isAdmin ? 'Amministratore' : 'Manager'}</span>
              {activeCount > 0 && (
                <>
                  {' '}·{' '}
                  <span className="text-ink-4">
                    {activeCount} {activeCount === 1 ? 'competizione attiva' : 'competizioni attive'}
                  </span>
                </>
              )}
            </p>
          </div>

          {isAdmin && (
            <Link
              href={'/league' as Route}
              className="inline-flex h-fit items-center gap-1.5 rounded-xl border border-hairline-strong bg-glass-2 px-3.5 py-2 text-[12.5px] font-semibold text-ink-1 backdrop-blur-xl transition-all hover:bg-glass-3"
            >
              Impostazioni Lega
            </Link>
          )}
        </div>
      </section>

      {/* Nazionali — Serie A (hidden for now: Mondiale-only) */}
      {SHOW_SERIE_A && (
      <section>
        <SectionHeader
          eyebrow="Livello nazionale"
          eyebrowTint="text-emerald-600 dark:text-emerald-300"
          title="Serie A"
          subtitle="Campionato, Coppa e Battle Royal — tre modi di vivere la stessa stagione."
          action={isAdmin ? { href: '/competitions/new' as Route, label: '+ Nuova competizione' } : null}
        />

        {serieAList.length === 0 ? (
          <EmptyState
            text={
              isAdmin
                ? 'Nessuna competizione di Serie A creata. Inizia dal Campionato.'
                : 'Nessuna competizione di Serie A configurata. Chiedi a un admin di crearne una.'
            }
          />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {serieAList.map((c) => {
              const enrolled = mySerieAEnrolments.has(c.id)
              const myTeamName = enrolled ? mySerieATeam?.name ?? null : null
              const status = serieAStatusBadge(c.status)
              return (
                <Link
                  key={c.id}
                  href={`/competitions/${c.slug ?? c.id}` as Route}
                  className="group rounded-2xl border border-hairline bg-glass-1 p-5 backdrop-blur-xl transition-all hover:border-indigo-400/40 hover:bg-glass-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`text-xl ${SERIE_A_TYPE_TINT[c.type]}`} aria-hidden>
                        {SERIE_A_TYPE_ICON[c.type]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                          {SERIE_A_TYPE_LABEL[c.type]}
                        </p>
                        <p className="mt-0.5 truncate text-[14.5px] font-semibold tracking-tight text-ink-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                          {c.name}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[12px] text-ink-4">
                    <span className="min-w-0 truncate">
                      {myTeamName ? (
                        <><span className="text-ink-5">Squadra:</span> <span className="text-ink-2">{myTeamName}</span></>
                      ) : c.season ? (
                        <span>{c.season}</span>
                      ) : (
                        <span>&nbsp;</span>
                      )}
                    </span>
                    <span className="shrink-0 text-ink-3 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                      Vai →
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
      )}

      {/* Internazionali — ControFanta Mondiale (WC / Euros / Nations) */}
      <section>
        <SectionHeader
          eyebrow="Livello internazionale"
          eyebrowTint="text-indigo-600 dark:text-indigo-300"
          title="Competizioni Internazionali"
          subtitle="Mondiali, Europei e Nations League in formato Battle Royal — quando il campionato si ferma, la Lega no."
          action={null}
        />

        {fmList.length === 0 ? (
          <EmptyState text="Nessuna competizione internazionale aperta al momento." />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fmList.map((c) => {
              const myTeam = myFMTeams.get(c.id)
              const legaInstanceId = legaInstanceByCompId.get(c.id) ?? null
              const status = fmStatusBadge(c.status)
              const startsLabel = formatDate(c.starts_at)
              const enrollmentClosed = c.status === 'completed' || c.status === 'archived'

              const head = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="text-xl text-indigo-600 dark:text-indigo-300" aria-hidden>🌍</span>
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                          {c.edition}
                        </p>
                        <p className="mt-0.5 truncate text-[14.5px] font-semibold tracking-tight text-ink-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                          {c.name}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                </>
              )

              const cardCls =
                'group rounded-2xl border border-hairline bg-glass-1 p-5 backdrop-blur-xl transition-all hover:border-indigo-400/40 hover:bg-glass-2'

              // Lega already plays this tournament — link straight to the instance.
              if (legaInstanceId) {
                const cta = myTeam ? 'Vai →' : enrollmentClosed ? 'Vedi →' : 'Iscriviti →'
                return (
                  <Link key={c.id} href={`/controfantamondiale/${legaInstanceId}` as Route} className={cardCls}>
                    {head}
                    <div className="mt-4 flex items-center justify-between text-[12px] text-ink-4">
                      <span className="min-w-0 truncate">
                        {myTeam ? (
                          <><span className="text-ink-5">Squadra:</span> <span className="text-ink-2">{myTeam.name}</span></>
                        ) : startsLabel ? (
                          <span>Inizio {startsLabel}</span>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </span>
                      <span className="shrink-0 text-ink-3 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                        {cta}
                      </span>
                    </div>
                  </Link>
                )
              }

              // Lega has NOT opted in. Admin sees a one-click "Iscrivi la Lega"
              // button; managers see a passive message.
              const optIn = optLegaIntoFMCompetitionAction.bind(null, c.id)
              return (
                <div key={c.id} className={cardCls}>
                  {head}
                  <div className="mt-4 flex items-center justify-between gap-2 text-[12px] text-ink-4">
                    <span className="min-w-0 truncate">
                      {enrollmentClosed
                        ? <span>Iscrizioni chiuse</span>
                        : startsLabel
                          ? <span>Inizio {startsLabel}</span>
                          : <span>La tua Lega non gioca ancora questa competizione</span>}
                    </span>
                    {isAdmin && !enrollmentClosed ? (
                      <form action={optIn} className="shrink-0">
                        <button
                          type="submit"
                          className="rounded-lg border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-2.5 py-1 text-[11.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
                        >
                          Iscrivi la Lega
                        </button>
                      </form>
                    ) : (
                      <span className="shrink-0 text-ink-5">In attesa dell&apos;admin</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  eyebrowTint,
  title,
  subtitle,
  action,
}: {
  eyebrow: string
  eyebrowTint: string
  title: string
  subtitle: string
  action: { href: Route; label: string } | null
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${eyebrowTint}`}>
          {eyebrow}
        </p>
        <h2
          className="mt-1 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(18px, 2.2vw, 22px)', lineHeight: 1.2, letterSpacing: '-0.025em' }}
        >
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-fit shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-hairline-strong bg-glass-1 px-5 py-10 text-center backdrop-blur-xl">
      <p className="text-[13px] text-ink-4">{text}</p>
    </div>
  )
}
