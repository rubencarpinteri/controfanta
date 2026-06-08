import { requireFMContext, getFMPhases, getFMRounds, getFMTeams, getFMPlayers, getFMFantasyTeams } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { RoundCountdown } from './RoundCountdown'
import { isUuid } from '@/lib/slug'
import { CreateFMTeamForm } from './CreateFMTeamForm'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // [id] is the Lega instance ref (slug or UUID) — hop through it to the
  // global template for the display name.
  const { data } = await supabase
    .from('fm_league_competition')
    .select('fm_competition(name, edition)')
    .eq(isUuid(id) ? 'id' : 'slug', id)
    .maybeSingle()
  const tpl = Array.isArray(data?.fm_competition) ? data?.fm_competition[0] : data?.fm_competition
  return { title: tpl ? `${tpl.name} ${tpl.edition}` : 'ControFanta Mondiale' }
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:       { label: 'Bozza',       cls: 'text-ink-4 bg-ink-4/10' },
  open:        { label: 'Aperta',      cls: 'text-emerald-400 bg-emerald-400/10' },
  in_progress: { label: 'In corso',    cls: 'text-amber-400 bg-amber-400/10' },
  locked:      { label: 'Chiusa',      cls: 'text-rose-400 bg-rose-400/10' },
  completed:   { label: 'Completata',  cls: 'text-indigo-400 bg-indigo-400/10' },
  archived:    { label: 'Archiviata',  cls: 'text-ink-5 bg-ink-5/10' },
  published:   { label: 'Pubblicata',  cls: 'text-emerald-400 bg-emerald-400/10' },
  scoring:     { label: 'Calcolo',     cls: 'text-amber-400 bg-amber-400/10' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: 'text-ink-4 bg-ink-4/10' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  )
}

function StatCard({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <div className="rounded-xl border border-hairline bg-glass-1 p-4 hover:bg-glass-2 transition-colors">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums text-ink-1">{value}</p>
    </div>
  )
  return href ? <Link href={href as Route}>{content}</Link> : content
}

export default async function FMOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // requireFMContext resolves the URL [id] (Lega instance) into both the
  // Lega instance and the global tournament template. Tournament-template
  // helpers (getFMPhases/Rounds/Teams/Players) take the global template id.
  // getFMFantasyTeams stays Lega-scoped, so it takes the URL id verbatim.
  const ctx = await requireFMContext(id)

  if (!ctx.isSuperAdmin && !ctx.isLeagueAdmin) {
    if (ctx.fantasyTeamId) redirect(`/controfantamondiale/${id}/rosa` as Route)

    return (
      <div className="mx-auto max-w-2xl space-y-5 py-6">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            Sei dentro
          </p>
          <h1
            className="mt-1 font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(24px, 3.4vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">{ctx.competition.name}</span>{' '}
            <span className="serif font-normal text-ink-3">{ctx.competition.edition}</span>
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            La tua Lega partecipa a questa competizione. Crea la tua squadra e vai
            direttamente alla costruzione della rosa.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-glass-1 p-5">
          <CreateFMTeamForm competitionRef={id} />
        </div>
      </div>
    )
  }

  const [phases, rounds, teams, fantasyTeams, players] = await Promise.all([
    getFMPhases(ctx.competition.id),
    getFMRounds(ctx.competition.id),
    getFMTeams(ctx.competition.id),
    getFMFantasyTeams(ctx.legaCompetition.id),
    getFMPlayers(ctx.competition.id),
  ])

  const { competition } = ctx

  const activePhase = phases.find((p) => p.status === 'open') ?? null
  const activeRound = rounds.find((r) => r.status === 'open' || r.status === 'locked') ?? null
  const activeTeams = teams.filter((t) => t.status === 'active').length
  const eliminatedTeams = teams.filter((t) => t.status === 'eliminated').length

  const fmt = (dt: string | null) =>
    dt ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dt)) : '—'

  return (
    <div className="space-y-5">
      {/* ── Competition header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-semibold tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', letterSpacing: '-0.03em' }}
          >
            {competition.name} <span className="font-light text-ink-3">{competition.edition}</span>
          </h1>
          {competition.starts_at && (
            <p className="mt-0.5 text-[11px] text-ink-4">
              {fmt(competition.starts_at)} → {fmt(competition.ends_at)}
            </p>
          )}
        </div>
        <StatusBadge status={competition.status} />
      </div>

      {/* ── Stats grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Nazioni" value={`${activeTeams} (${eliminatedTeams}✕)`} href={`/controfantamondiale/${id}/teams`} />
        <StatCard label="Giocatori" value={players.length} href={`/controfantamondiale/${id}/players`} />
        <StatCard label="Iscritti" value={fantasyTeams.length} href={`/controfantamondiale/${id}/members`} />
        <StatCard label="Fasi" value={phases.length} href={`/controfantamondiale/${id}/phases`} />
      </div>

      {/* ── Active phase + round ───────────────────────────────────────────── */}
      {(activePhase || activeRound) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {activePhase && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Fase attiva</p>
              <p className="mt-1 text-[14px] font-semibold text-ink-1">{activePhase.name}</p>
              {activePhase.squad_lock_at && (
                <p className="mt-0.5 text-[11px] text-ink-4">
                  Lock rosa: {fmt(activePhase.squad_lock_at)}
                </p>
              )}
            </div>
          )}
          {activeRound && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">Giornata attiva</p>
              <p className="mt-1 text-[14px] font-semibold text-ink-1">{activeRound.name}</p>
              {activeRound.lock_at && (
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-[11px] text-ink-5">Lock tra</span>
                  <RoundCountdown lockAt={activeRound.lock_at} />
                  <span className="text-[10px] text-ink-5">({fmt(activeRound.lock_at)})</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Phase timeline ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-hairline">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">Calendario fasi</p>
        </div>
        <div className="divide-y divide-hairline">
          {phases.map((phase) => {
            const phaseRounds = rounds.filter((r) => r.phase_id === phase.id)
            return (
              <div key={phase.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[11px] text-ink-5">{phase.display_order}</span>
                  <span className="flex-1 text-[13px] font-medium text-ink-1">{phase.name}</span>
                  <StatusBadge status={phase.status} />
                </div>
                <div className="mt-1 pl-7 flex flex-wrap gap-3 text-[10px] text-ink-4">
                  {phase.squad_lock_at && <span>Rosa: {fmt(phase.squad_lock_at)}</span>}
                  <span className="text-ink-5">{phaseRounds.length} giornata{phaseRounds.length !== 1 ? 'e' : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
