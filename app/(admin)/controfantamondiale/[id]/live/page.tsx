import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { computeLiveRoundSnapshot, type LiveRoundSnapshot } from '@/domain/fantamondiale/engine/liveSnapshot'
import { LiveBoard } from './LiveBoard'

function needsLiveSnapshotShapeRefresh(snapshot: LiveRoundSnapshot | null): boolean {
  return Boolean(
    snapshot?.matches.some((match) =>
      match.players.some((player) => !Object.hasOwn(player, 'display_voto_base')),
    ) ||
      snapshot?.teams.some((team) =>
        team.players.some(
          (player) =>
            !Object.hasOwn(player, 'voto_base') ||
            !Object.hasOwn(player, 'display_voto_base') ||
            !Object.hasOwn(player, 'display_voto_total') ||
            !Object.hasOwn(player, 'clean_sheet_bonus') ||
            !Object.hasOwn(player, 'yellow_cards') ||
            !Object.hasOwn(player, 'immunita_active') ||
            !Object.hasOwn(player, 'sub_for') ||
            !Object.hasOwn(player, 'replaced_by') ||
            !Object.hasOwn(player, 'replacement_pending') ||
            !Object.hasOwn(player, 'replacement_candidate') ||
            !Object.hasOwn(player, 'bench_order'),
        ),
      ),
  )
}

export default async function LivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requireFMContext(id)

  // ?preview=1 — super-admin only gate bypass for layout review.
  // Other teams' lineups are masked in the UI; only your own team renders in full.
  const previewMode = sp['preview'] === '1' && ctx.isSuperAdmin
  const supabase = await createClient()

  const rounds = await getFMRounds(ctx.competition.id)
  // The round currently in play (or most recently scored).
  const activeRound =
    rounds.find((r) => r.status === 'locked') ??
    rounds.find((r) => r.status === 'scoring') ??
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'published') ??
    null

  // Look-back: any round that has at least locked can be browsed via ?round=<id>
  // (its snapshot is persisted and the reveal gate below passes for past rounds).
  // Always keep the active round selectable so there's a way back to "now".
  const browsable = rounds
    .filter((r) => ['locked', 'scoring', 'published'].includes(r.status) || r.id === activeRound?.id)
    .sort((a, b) => a.display_order - b.display_order)

  const requestedId = typeof sp['round'] === 'string' ? sp['round'] : undefined
  const selectedRound =
    (requestedId && browsable.find((r) => r.id === requestedId)) || activeRound

  const roundSelector =
    browsable.length > 1 ? (
      <div className="flex flex-wrap gap-1.5">
        {browsable.map((r) => {
          const isActive = r.id === selectedRound?.id
          return (
            <a
              key={r.id}
              href={`/controfantamondiale/${id}/live?round=${r.id}`}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                  : 'border-hairline bg-glass-1 text-ink-3 hover:bg-glass-2'
              }`}
            >
              {r.name}
              {r.id === activeRound?.id && !isActive ? ' ·' : ''}
            </a>
          )
        })}
      </div>
    ) : null

  const header = (
    <div>
      <h2 className="text-[16px] font-semibold text-ink-1">Live</h2>
      <p className="mt-0.5 text-[11px] text-ink-4">
        Punteggi e schieramenti in tempo reale — pubblici dal primo calcio d&apos;inizio.
      </p>
    </div>
  )

  if (!selectedRound) {
    return (
      <div className="space-y-4">
        {header}
        {roundSelector}
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
          <p className="text-[14px] text-ink-3">Nessun turno attivo al momento.</p>
        </div>
      </div>
    )
  }

  // ── Reveal gate: only after the first official match has kicked off ──
  const { data: matches } = await supabase
    .from('fm_real_match')
    .select('kickoff_at')
    .eq('scoring_round_id', selectedRound.id)

  const kickoffs = (matches ?? [])
    .map((m) => new Date(m.kickoff_at).getTime())
    .filter((n) => !Number.isNaN(n))
  const firstKickoff = kickoffs.length > 0 ? Math.min(...kickoffs) : null
  const revealed = firstKickoff !== null && Date.now() >= firstKickoff

  if (!revealed && !previewMode) {
    const when =
      firstKickoff !== null
        ? new Date(firstKickoff).toLocaleString('it-IT', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            // Server component on a UTC runtime — pin to Italian wall-clock.
            timeZone: 'Europe/Rome',
          })
        : null
    return (
      <div className="space-y-4">
        {header}
        {roundSelector}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <p className="text-[14px] font-semibold text-amber-700 dark:text-amber-300">Live non ancora disponibile</p>
          <p className="mt-1 text-[12px] text-ink-3">
            Si apre al calcio d&apos;inizio della prima partita ufficiale di {selectedRound.name}.
          </p>
          {when && <p className="mt-2 text-[12px] text-ink-2 tabular-nums">Primo fischio: {when}</p>}
        </div>
      </div>
    )
  }

  const { data: snapRow } = await supabase
    .from('fm_live_round_snapshot')
    .select('snapshot, computed_at')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .eq('scoring_round_id', selectedRound.id)
    .maybeSingle()

  let snapshot = (snapRow?.snapshot as LiveRoundSnapshot | null) ?? null
  // Recompute when the row is missing (e.g. an older finished round never had one
  // persisted) or its shape is stale — so any browsable round always renders.
  if (!snapshot || needsLiveSnapshotShapeRefresh(snapshot)) {
    snapshot = await computeLiveRoundSnapshot(selectedRound.id, ctx.legaCompetition.id, supabase)
  }
  // Backfill `classifica` for snapshots persisted before the field existed.
  if (snapshot && !snapshot.classifica) {
    snapshot = {
      ...snapshot,
      classifica: Object.fromEntries(
        snapshot.teams.map((t, i) => [
          t.fantasy_team_id,
          { br_points_prior: 0, br_points_total: 0, raw_score_prior: 0, raw_score_total: 0, rank: i + 1 },
        ])
      ),
    }
  }

  // In preview mode with no real snapshot yet, build a shell from team + match data
  // so the layout is visible. All scores are zero; players list is empty per team.
  if (previewMode && !snapshot) {
    const [{ data: fantasyTeams }, { data: realMatches }, { data: nationalTeams }] = await Promise.all([
      supabase.from('fm_fantasy_team').select('id, name').eq('league_competition_id', ctx.legaCompetition.id).order('name'),
      supabase.from('fm_real_match').select('id, home_team_id, away_team_id, home_score, away_score, status, minute, minute_added, kickoff_at').eq('scoring_round_id', selectedRound.id),
      supabase.from('fm_national_team').select('id, name, fifa_code, logo_url, flag_url'),
    ])
    const ntById = new Map((nationalTeams ?? []).map((t) => [t.id, t]))
    const toRef = (id: string) => {
      const t = ntById.get(id)
      return { name: t?.name ?? id, fifa_code: t?.fifa_code ?? '', logo_url: t?.logo_url ?? null, flag_url: t?.flag_url ?? null }
    }
    snapshot = {
      computed_at: new Date().toISOString(),
      round: { id: selectedRound.id, name: selectedRound.name, phase_id: '' },
      teams: (fantasyTeams ?? []).map((t) => ({
        fantasy_team_id: t.id,
        name: t.name,
        manager_name: null,
        formation: null,
        coach: null,
        players_total: 0,
        live_total: 0,
        players: [],
      })),
      ownership: {},
      matches: (realMatches ?? []).map((m) => ({
        match_id: m.id,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_team: toRef(m.home_team_id),
        away_team: toRef(m.away_team_id),
        home_score: m.home_score,
        away_score: m.away_score,
        minute: m.minute,
        minute_added: m.minute_added,
        status: (m.status as LiveRoundSnapshot['matches'][number]['status']),
        kickoff_at: m.kickoff_at,
        goal_events: [],
        players: [],
      })),
      standings: Object.fromEntries(
        (fantasyTeams ?? []).map((t) => [t.id, { live_total: 0, goals_scored: 0, giornata_points: 0 }])
      ),
      classifica: Object.fromEntries(
        (fantasyTeams ?? []).map((t, i) => [
          t.id,
          { br_points_prior: 0, br_points_total: 0, raw_score_prior: 0, raw_score_total: 0, rank: i + 1 },
        ])
      ),
    }
  }

  const isHistoric = selectedRound.id !== activeRound?.id

  return (
    <div className="space-y-4">
      {header}
      {roundSelector}
      {isHistoric && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-300">
          Stai guardando lo storico di {selectedRound.name} — schieramenti, voti e MVP definitivi.
        </div>
      )}
      {previewMode && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          Modalità anteprima — le formazioni degli altri partecipanti sono nascoste.
        </div>
      )}
      <LiveBoard
        legaCompRef={id}
        roundName={selectedRound.name}
        myTeamId={ctx.fantasyTeamId}
        initialSnapshot={snapshot}
        previewMode={previewMode}
        live={!isHistoric}
      />
    </div>
  )
}
