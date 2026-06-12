'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import type {
  LiveRoundSnapshot,
  LiveSnapshotTeam,
  LiveSnapshotPlayer,
  LiveSnapshotMatch,
  LiveSnapshotRealPlayer,
  LiveOwnerRef,
  LiveOwnershipEntry,
} from '@/domain/fantamondiale/engine/liveSnapshot'

const POLL_MS = 35_000

const ROLE_COLOR: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const

// Solid role colors — now used for the thin card outline (kept in sync with
// ROLE_COLOR). Conveys the role at a glance without a dot on the flag.
const ROLE_DOT: Record<string, string> = {
  P: '#f59e0b',
  D: '#34d399',
  C: '#818cf8',
  A: '#fb7185',
}

const ROLE_NAME: Record<string, string> = {
  P: 'Portiere',
  D: 'Difensore',
  C: 'Centrocampista',
  A: 'Attaccante',
}

/** Stable role ordering (P→D→C→A), so a recently-edited lineup still reads in
 * role order rather than in raw snapshot array order. */
function sortByRole<T extends { role: string }>(players: T[]): T[] {
  return [...players].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role as never) - ROLE_ORDER.indexOf(b.role as never),
  )
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return '—'
  return Number(n).toFixed(d)
}

function shortPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0]![0]!.toUpperCase()}. ${parts.slice(1).join(' ')}`
}

function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

// Short date for the match list, e.g. "ven 13 giu". Used so users can tell when
// a match was played or is scheduled, not just the kickoff time.
function fmtMatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Default match focus: a live (in-progress) match if any are playing, otherwise
// the NEXT match still to be played (earliest upcoming kickoff). Only when the
// whole round is over do we fall back to the last finished match.
function defaultMatchId(matches: LiveSnapshotMatch[]): string | null {
  const live = matches.find((m) => m.status === 'in_progress')
  if (live) return live.match_id
  const upcoming = matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())[0]
  if (upcoming) return upcoming.match_id
  // All finished — focus the most recent kickoff.
  const lastFinished = [...matches].sort(
    (a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime(),
  )[0]
  return (lastFinished ?? matches[0])?.match_id ?? null
}

// A team that never submitted a lineup arrives in the snapshot with no formation
// and no players — it scores 0 for the giornata (Battle Royale).
function isNotFielded(team: LiveSnapshotTeam): boolean {
  return team.formation === null && team.players.length === 0
}

type LiveFieldState = 'field' | 'bench'

// Map of player_id → live presence, for matches that are in progress right now.
// 'field' = currently on the pitch; 'bench' = in the matchday squad but not on
// the pitch at this moment (unused sub, or already substituted off).
function buildLiveFieldMap(matches: LiveSnapshotMatch[]): Map<string, LiveFieldState> {
  const map = new Map<string, LiveFieldState>()
  for (const m of matches) {
    if (m.status !== 'in_progress') continue
    for (const p of m.players) {
      const onPitch =
        (p.is_starter && p.subbed_off_minute == null) ||
        (p.subbed_on_minute != null && p.subbed_off_minute == null)
      map.set(p.player_id, onPitch ? 'field' : 'bench')
    }
  }
  return map
}

function teamLiveCounts(
  team: LiveSnapshotTeam,
  liveField: Map<string, LiveFieldState>,
): { field: number; bench: number } {
  let field = 0
  let bench = 0
  for (const p of team.players) {
    const real = liveField.get(p.player_id)
    if (!real) continue // his nation isn't in a live match right now → no dot
    // Green only for a player who is BOTH a titolare in this fantasy team's
    // formation AND currently on the pitch. Everyone else in a live match
    // (fantasy bench, or a titolare not on the pitch) is grey.
    if (p.via === 'starter' && real === 'field') field++
    else bench++
  }
  return { field, bench }
}

// Glowing dots: green for each fantasy titolare currently on the pitch in a live
// match, grey for the rest of the squad involved in a live match.
function LiveDots({ field, bench }: { field: number; bench: number }) {
  if (field + bench === 0) return null
  return (
    <span className="inline-flex items-center gap-1" title={`${field} titolari in campo · ${bench} altri (live)`}>
      {Array.from({ length: field }).map((_, i) => (
        <span
          key={`f${i}`}
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-lime-400 shadow-[0_0_7px_2px] shadow-lime-400/70"
        />
      ))}
      {Array.from({ length: bench }).map((_, i) => (
        <span
          key={`b${i}`}
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-ink-5/55 shadow-[0_0_5px_1px] shadow-ink-5/30"
        />
      ))}
    </span>
  )
}

// ─────────────────────────────────────────────
// Root board — manages poll + tab/selection state
// ─────────────────────────────────────────────

type Tab = 'partite' | 'squadre' | 'classifica'

export function LiveBoard({
  legaCompRef,
  roundName,
  myTeamId,
  initialSnapshot,
  previewMode = false,
}: {
  legaCompRef: string
  roundName: string
  myTeamId: string | null
  initialSnapshot: LiveRoundSnapshot | null
  previewMode?: boolean
}) {
  const [snapshot, setSnapshot] = useState<LiveRoundSnapshot | null>(initialSnapshot)
  const [activeTab, setActiveTab] = useState<Tab>('partite')
  const [userPickedMatch, setUserPickedMatch] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    defaultMatchId(initialSnapshot?.matches ?? []),
  )
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(myTeamId)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(`/api/fm/${legaCompRef}/live`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { snapshot: LiveRoundSnapshot | null }
        if (cancelled || !json.snapshot) return
        setSnapshot(json.snapshot)
      } catch {
        // transient — keep last good snapshot
      }
    }
    timer.current = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [legaCompRef])

  const handleSelectMatch = useCallback((matchId: string) => {
    setUserPickedMatch(true)
    setSelectedMatchId(matchId)
    setActiveTab('partite')
  }, [])

  // Until the user explicitly picks a match, keep the focus on the live game
  // (e.g. once a scheduled match kicks off it becomes the focus automatically).
  useEffect(() => {
    if (userPickedMatch || !snapshot) return
    const next = defaultMatchId(snapshot.matches)
    if (next && next !== selectedMatchId) setSelectedMatchId(next)
  }, [snapshot, userPickedMatch, selectedMatchId])

  const handleSelectTeam = useCallback((teamId: string) => {
    setSelectedTeamId(teamId)
    setActiveTab('squadre')
  }, [])

  const updatedAt = snapshot?.computed_at
    ? new Date(snapshot.computed_at).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
        <p className="text-[14px] text-ink-3">In attesa dei dati live…</p>
        <p className="mt-1 text-[11px] text-ink-5">
          I punteggi compaiono appena le partite di {roundName} entrano in gioco.
        </p>
      </div>
    )
  }

  const selectedMatch = snapshot.matches.find((m) => m.match_id === selectedMatchId) ?? snapshot.matches[0] ?? null
  const selectedTeam = snapshot.teams.find((t) => t.fantasy_team_id === selectedTeamId) ?? null
  const liveField = buildLiveFieldMap(snapshot.matches)

  return (
    <div className="flex flex-col gap-3">
      {/* status bar */}
      <div className="flex items-center gap-2 text-[11px] text-ink-4">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span>Live — {snapshot.round.name}</span>
        {updatedAt && <span className="ml-auto tabular-nums">Aggiornato {updatedAt}</span>}
      </div>

      {/* ── Desktop: 3-column layout ── */}
      <div className="hidden lg:grid lg:grid-cols-[190px_minmax(0,1fr)_190px] lg:gap-3 xl:grid-cols-[198px_minmax(0,1fr)_198px]">
        <MatchListPanel
          matches={snapshot.matches}
          selectedMatchId={selectedMatch?.match_id ?? null}
          onSelect={handleSelectMatch}
        />
        <CenterPanel
          match={selectedMatch}
          team={selectedTeam}
          activeView={selectedTeamId !== null && activeTab === 'squadre' ? 'team' : 'match'}
          myTeamId={myTeamId}
          totalTeams={snapshot.teams.length}
          previewMode={previewMode}
          liveField={liveField}
          ownership={snapshot.ownership}
        />
        <StandingsPanel
          teams={snapshot.teams}
          standings={snapshot.standings}
          classifica={snapshot.classifica}
          roundName={roundName}
          myTeamId={myTeamId}
          selectedTeamId={selectedTeamId}
          onSelect={handleSelectTeam}
        />
      </div>

      {/* ── Mobile: tab bar ── */}
      <div className="lg:hidden">
        <div className="mb-3 flex gap-1 rounded-full border border-hairline bg-glass-1 p-1.5 shadow-sm">
          {(['partite', 'squadre', 'classifica'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-full py-2.5 text-[15px] font-semibold capitalize tracking-tight transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-accent text-white shadow-md shadow-accent/25'
                  : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'partite' && (
          <div className="space-y-2">
            <MatchListPanel
              matches={snapshot.matches}
              selectedMatchId={selectedMatch?.match_id ?? null}
              onSelect={handleSelectMatch}
              inline
            />
            {selectedMatch && (
              <MatchDetailPanel match={selectedMatch} totalTeams={snapshot.teams.length} />
            )}
          </div>
        )}
        {activeTab === 'squadre' && (
          <div className="space-y-2">
            {snapshot.teams.map((team, i) => (
              <MobileTeamCard
                key={team.fantasy_team_id}
                team={team}
                rank={i + 1}
                isMine={team.fantasy_team_id === myTeamId}
                standings={snapshot.standings[team.fantasy_team_id]}
                expanded={team.fantasy_team_id === selectedTeamId}
                previewMode={previewMode}
                liveCounts={teamLiveCounts(team, liveField)}
                liveField={liveField}
                ownership={snapshot.ownership}
                onToggle={() =>
                  setSelectedTeamId(
                    selectedTeamId === team.fantasy_team_id ? null : team.fantasy_team_id,
                  )
                }
              />
            ))}
          </div>
        )}
        {activeTab === 'classifica' && (
          <StandingsPanel
            teams={snapshot.teams}
            standings={snapshot.standings}
            classifica={snapshot.classifica}
            roundName={roundName}
            myTeamId={myTeamId}
            selectedTeamId={selectedTeamId}
            onSelect={handleSelectTeam}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Match list (left column / mobile inline)
// ─────────────────────────────────────────────

function MatchListPanel({
  matches,
  selectedMatchId,
  onSelect,
  inline = false,
}: {
  matches: LiveSnapshotMatch[]
  selectedMatchId: string | null
  onSelect: (id: string) => void
  inline?: boolean
}) {
  if (inline) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {matches.map((m) => (
          <button
            key={m.match_id}
            onClick={() => onSelect(m.match_id)}
            className={`flex-shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
              m.match_id === selectedMatchId
                ? 'border-indigo-500/40 bg-indigo-500/10'
                : 'border-hairline bg-glass-1'
            }`}
          >
            <MatchChip match={m} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-ink-5">
        Partite del turno
      </p>
      {matches.map((m) => (
        <button
          key={m.match_id}
          onClick={() => onSelect(m.match_id)}
          className={`w-full border-t border-hairline px-2.5 py-2 text-left transition-colors hover:bg-glass-2 ${
            m.match_id === selectedMatchId ? 'bg-indigo-500/8' : ''
          }`}
        >
          <MatchChip match={m} selected={m.match_id === selectedMatchId} />
        </button>
      ))}
    </div>
  )
}

function MatchChip({ match: m, selected = false }: { match: LiveSnapshotMatch; selected?: boolean }) {
  const homePresence = matchFantasyPresence(m, m.home_team_id)
  const awayPresence = matchFantasyPresence(m, m.away_team_id)
  const fantasyCount = homePresence.length + awayPresence.length

  return (
    <div className="space-y-1.5">
      {/* status + date + time */}
      <div className="flex items-center gap-1.5">
        <MatchStatusBadge status={m.status} minute={m.minute} minuteAdded={m.minute_added} />
        <span className="text-[10px] font-semibold text-ink-3 tabular-nums capitalize">{fmtMatchDate(m.kickoff_at)}</span>
        {m.status === 'scheduled' && (
          <span className="text-[10px] font-semibold text-ink-3 tabular-nums">· {fmtKickoff(m.kickoff_at)}</span>
        )}
      </div>

      {/* home flag + code · score · away code + flag */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <TeamCrest
            name={m.home_team.name}
            logoUrl={m.home_team.logo_url}
            flagUrl={m.home_team.flag_url}
            fifaCode={m.home_team.fifa_code}
            size={24}
            className="shrink-0"
          />
          <span className={`text-[14px] font-black tabular-nums uppercase tracking-tight ${selected ? 'text-ink-1' : 'text-ink-2'}`}>
            {m.home_team.fifa_code || m.home_team.name.slice(0, 3).toUpperCase()}
          </span>
        </div>

        <span className="text-[14px] font-black tabular-nums text-ink-1">
          {m.status !== 'scheduled' ? `${m.home_score ?? 0}–${m.away_score ?? 0}` : '–'}
        </span>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <span className={`text-[14px] font-black tabular-nums uppercase tracking-tight ${selected ? 'text-ink-1' : 'text-ink-2'}`}>
            {m.away_team.fifa_code || m.away_team.name.slice(0, 3).toUpperCase()}
          </span>
          <TeamCrest
            name={m.away_team.name}
            logoUrl={m.away_team.logo_url}
            flagUrl={m.away_team.flag_url}
            fifaCode={m.away_team.fifa_code}
            size={24}
            className="shrink-0"
          />
        </div>
      </div>

      {/* fantasy presence dots */}
      {fantasyCount > 0 && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5" title={`${fantasyCount} giocatori nel pool in questa partita`}>
          <PresenceDots items={homePresence} />
          <span aria-hidden className="w-4" />
          <PresenceDots items={awayPresence} align="end" />
        </div>
      )}
    </div>
  )
}

function matchFantasyPresence(match: LiveSnapshotMatch, nationalTeamId: string) {
  return match.players
    .filter((p) => p.national_team_id === nationalTeamId && p.owners.length > 0)
    .flatMap((p) => p.owners.map((owner) => ({ isStarter: owner.status === 'titolare' })))
}

function PresenceDots({
  items,
  align = 'start',
}: {
  items: Array<{ isStarter: boolean }>
  align?: 'start' | 'end'
}) {
  if (!items.length) return <span />
  const visible = items.slice(0, 8)
  return (
    <span className={`flex gap-0.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {visible.map((item, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            item.isStarter ? 'bg-indigo-400 dark:bg-indigo-300' : 'bg-ink-5/35'
          }`}
        />
      ))}
      {items.length > visible.length && <span className="text-[8px] leading-none text-ink-5">+{items.length - visible.length}</span>}
    </span>
  )
}

function MatchStatusBadge({
  status,
  minute,
  minuteAdded,
}: {
  status: LiveSnapshotMatch['status']
  minute: number | null
  minuteAdded?: number | null
}) {
  if (status === 'in_progress') {
    const label =
      minute == null ? 'LIVE' : minuteAdded ? `${minute}+${minuteAdded}'` : `${minute}'`
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-400/12 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
        {label}
      </span>
    )
  }
  if (status === 'finished') {
    return <span className="rounded bg-ink-5/10 px-1.5 py-0.5 text-[8px] font-bold text-ink-5">FT</span>
  }
  return null
}

// ─────────────────────────────────────────────
// Center panel
// ─────────────────────────────────────────────

function CenterPanel({
  match,
  team,
  activeView,
  myTeamId,
  totalTeams,
  previewMode,
  liveField,
  ownership,
}: {
  match: LiveSnapshotMatch | null
  team: LiveSnapshotTeam | null
  activeView: 'match' | 'team'
  myTeamId: string | null
  totalTeams: number
  previewMode: boolean
  liveField: Map<string, LiveFieldState>
  ownership: Record<string, LiveOwnershipEntry>
}) {
  if (activeView === 'team' && team) {
    const isMine = team.fantasy_team_id === myTeamId
    if (previewMode && !isMine) {
      return <MaskedTeamPanel team={team} />
    }
    return <TeamDetailPanel team={team} isMine={isMine} liveCounts={teamLiveCounts(team, liveField)} liveField={liveField} ownership={ownership} />
  }
  if (match) {
    return <MatchDetailPanel match={match} totalTeams={totalTeams} />
  }
  return (
    <div className="flex items-center justify-center rounded-xl border border-hairline bg-glass-1 p-8">
      <p className="text-[12px] text-ink-5">Seleziona una partita o una squadra</p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Match detail panel
// ─────────────────────────────────────────────

function MatchDetailPanel({
  match: m,
  totalTeams,
}: {
  match: LiveSnapshotMatch
  totalTeams: number
}) {
  const sideLineups = (['home', 'away'] as const).map((side) => {
    const teamRef = side === 'home' ? m.home_team : m.away_team
    const teamId = side === 'home' ? m.home_team_id : m.away_team_id
    const players = m.players.filter((p) => p.national_team_id === teamId)
    return { side, teamRef, players, lineup: buildRealLineup(players) }
  })
  const maxMainRows = Math.max(0, ...sideLineups.map((lineup) => lineup.lineup.xi.length))
  const maxBenchRows = Math.max(0, ...sideLineups.map((lineup) => lineup.lineup.bench.length))

  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      {/* header */}
      <div className="bg-glass-2 px-4 py-3 border-b border-hairline">
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <TeamCrest
              name={m.home_team.name}
              logoUrl={m.home_team.logo_url}
              flagUrl={m.home_team.flag_url}
              fifaCode={m.home_team.fifa_code}
              size={34}
            />
            <span className="max-w-full truncate text-center text-[12px] font-bold text-ink-2">{m.home_team.name}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            {m.status !== 'scheduled' ? (
              <span className="text-[28px] font-black tabular-nums text-ink-1 leading-none">
                {m.home_score ?? 0}–{m.away_score ?? 0}
              </span>
            ) : (
              <span className="text-[16px] font-bold text-ink-5">vs</span>
            )}
            <MatchStatusBadge status={m.status} minute={m.minute} minuteAdded={m.minute_added} />
            <span className="text-[11px] font-semibold text-ink-2 tabular-nums capitalize">
              {fmtMatchDate(m.kickoff_at)}{m.status === 'scheduled' ? ` · ${fmtKickoff(m.kickoff_at)}` : ''}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <TeamCrest
              name={m.away_team.name}
              logoUrl={m.away_team.logo_url}
              flagUrl={m.away_team.flag_url}
              fifaCode={m.away_team.fifa_code}
              size={34}
            />
            <span className="max-w-full truncate text-center text-[12px] font-bold text-ink-2">{m.away_team.name}</span>
          </div>
        </div>
      </div>

      {/* real-match lineups, split by nation */}
      {m.players.length > 0 ? (
        <div className="p-2 space-y-3 sm:p-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {sideLineups.map(({ side, lineup }) => (
              <MatchSideLineup
                key={side}
                lineup={lineup}
                matchStatus={m.status}
                totalTeams={totalTeams}
                minMainRows={maxMainRows}
                minBenchRows={maxBenchRows}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-[12px] text-ink-5">
            {m.status === 'scheduled'
              ? 'Le formazioni appariranno dopo il calcio d\'inizio'
              : 'Formazioni non ancora disponibili'}
          </p>
        </div>
      )}
    </div>
  )
}

function buildRealLineup(players: LiveSnapshotRealPlayer[]) {
  const byName = new Map(players.map((p) => [p.name, p]))
  const rendered = new Set<string>()
  const xi: { p: LiveSnapshotRealPlayer; depth: number }[] = []

  function chain(p: LiveSnapshotRealPlayer, depth: number) {
    if (rendered.has(p.player_id)) return
    rendered.add(p.player_id)
    xi.push({ p, depth })
    if (p.subbed_off_minute != null && p.replacement_player_name) {
      const rep = byName.get(p.replacement_player_name)
      if (rep) chain(rep, depth + 1)
    }
  }
  for (const p of players.filter((x) => x.is_starter)) chain(p, 0)
  for (const p of players.filter((x) => !rendered.has(x.player_id) && x.subbed_on_minute != null)) {
    chain(p, 0)
  }

  return {
    xi,
    bench: players.filter((x) => !rendered.has(x.player_id)),
  }
}

// One nation's real-match lineup: titolari (role-ordered) with each
// substitution chained directly under the player who came off, then the
// unused bench. Mirrors what's actually on the pitch.
function MatchSideLineup({
  lineup,
  matchStatus,
  totalTeams,
  minMainRows,
  minBenchRows,
}: {
  lineup: ReturnType<typeof buildRealLineup>
  matchStatus: LiveSnapshotMatch['status']
  totalTeams: number
  minMainRows: number
  minBenchRows: number
}) {
  const { xi, bench } = lineup

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-1.5">
      <div className="space-y-1">
        {xi.map(({ p, depth }) => (
          <RealPlayerRow key={p.player_id} p={p} matchStatus={matchStatus} totalTeams={totalTeams} depth={depth} />
        ))}
        {Array.from({ length: Math.max(0, minMainRows - xi.length) }).map((_, i) => (
          <RealPlayerPlaceholder key={`main-placeholder-${i}`} />
        ))}
      </div>

      <div className="space-y-1 pt-1">
        <p className="px-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-ink-5">Panchina</p>
        {bench.map((p) => (
          <RealPlayerRow key={p.player_id} p={p} matchStatus={matchStatus} totalTeams={totalTeams} muted />
        ))}
        {Array.from({ length: Math.max(0, minBenchRows - bench.length) }).map((_, i) => (
          <RealPlayerPlaceholder key={`bench-placeholder-${i}`} />
        ))}
      </div>
    </div>
  )
}

function RealPlayerPlaceholder() {
  return <div aria-hidden className="h-[50px] rounded-md border border-transparent px-2 py-1 opacity-0" />
}

// Resolve a player's displayed voto: split base/total, or a no-play marker.
// Shared by the list row and the pitch chip so the two can never diverge.
type VotoDisplay =
  | { kind: 'score'; base: string; total: string; totalCls: string }
  | { kind: 'marker'; text: string; cls: string }

function computeVoto(p: LiveSnapshotPlayer): VotoDisplay {
  const penNow = p.popularity_penalty_now
  // A voto exists only when the engine produced a base rating. A player who was
  // on the pitch but has no rating yet is S.V. (senza voto) — never show 0.0.
  const baseVoto = p.display_voto_base ?? p.voto_base ?? p.rating
  if (baseVoto != null) {
    const totalNum = (p.display_voto_total ?? p.final_score_now) + p.mvp_bonus - penNow
    return {
      kind: 'score',
      base: fmt(baseVoto, 1),
      total: fmt(totalNum, 1),
      totalCls: totalVotoColor(totalNum),
    }
  }
  if (p.status === 'played') return { kind: 'marker', text: 'S.V.', cls: 'text-amber-500 dark:text-amber-400' }
  return { kind: 'marker', text: p.status === 'pending' ? '–' : '✕', cls: 'text-ink-5' }
}

function totalVotoColor(voto: number): string {
  if (voto >= 10) return 'text-[#374DF5]'
  if (voto >= 9) return 'text-[#00ADC4]'
  if (voto >= 7) return 'text-[#00C424]'
  if (voto >= 6) return 'text-[#D9AF00]'
  if (voto >= 5) return 'text-[#ED7E07]'
  return 'text-[#DC0C00]'
}

// Resolve the right-hand value: split base/total voto, or a no-play marker.
function votoDisplay(
  baseVoto: number | null,
  voto: number | null,
  minutes: number | null,
  playState: LiveSnapshotRealPlayer['play_state'],
  matchStatus: LiveSnapshotMatch['status'],
): { kind: 'score'; base: string; total: string; totalCls: string } | { kind: 'marker'; text: string; cls: string } {
  if (playState === 'played' && baseVoto != null && voto != null) {
    return { kind: 'score', base: fmt(baseVoto, 1), total: fmt(voto, 1), totalCls: totalVotoColor(voto) }
  }
  if ((minutes ?? 0) > 0) return { kind: 'marker', text: 'S.V.', cls: 'text-amber-500 dark:text-amber-400' }
  if (matchStatus === 'finished') return { kind: 'marker', text: '✕', cls: 'text-ink-5' }
  return { kind: 'marker', text: '–', cls: 'text-ink-5' }
}

function RealPlayerRow({
  p,
  matchStatus,
  totalTeams,
  depth = 0,
  muted = false,
}: {
  p: LiveSnapshotRealPlayer
  matchStatus: LiveSnapshotMatch['status']
  totalTeams: number
  depth?: number
  muted?: boolean
}) {
  const storedBaseVoto =
    p.display_voto_base ??
    p.voto_base ??
    (p.play_state === 'played' && p.voto != null ? p.voto : null)
  const storedTotalVoto = p.display_voto_total ?? p.voto
  const v = votoDisplay(storedBaseVoto, storedTotalVoto, p.minutes_played, p.play_state, matchStatus)

  // Exclusively owned (single team in the lega, fielded as a starter) AND best
  // in the fixture — the jackpot moment of the format. The whole row lights up
  // magenta. A lone owner who only benched him doesn't trigger it.
  const exclusiveStarter = p.owners.length === 1 && p.owners[0]?.status === 'titolare'
  const exclusiveMvp = exclusiveStarter && p.is_mvp

  return (
    <div
      className={`flex h-[50px] items-center gap-1 overflow-hidden rounded-md border px-1.5 py-1 sm:gap-1.5 sm:px-2 ${
        exclusiveMvp
          ? 'border-[#f01c9c]/70 bg-[#f01c9c]/15 shadow-sm shadow-[#f01c9c]/25'
          : 'border-hairline bg-glass-2'
      } ${muted ? 'opacity-60' : ''} ${depth > 0 ? 'ml-2 sm:ml-3' : ''}`}
    >
      {depth > 0 && <span className="text-[10px] text-emerald-500 dark:text-emerald-400">↳</span>}
      <span className={`text-[10px] font-bold ${ROLE_COLOR[p.role] ?? 'text-ink-4'}`}>{p.role}</span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-nowrap items-center gap-x-1.5 overflow-hidden">
          <span className="truncate text-[12.5px] font-semibold text-ink-1 sm:text-[13.5px]" title={p.name}>
            {shortPlayerName(p.name)}
          </span>
          {p.is_mvp && (
            <span
              title="Migliore in campo"
              className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/20 px-1.5 py-px text-[9px] font-black text-amber-600 shadow-sm dark:text-amber-200"
            >
              ★ MVP
            </span>
          )}
          {p.subbed_off_minute != null && (
            <span className="shrink-0 rounded bg-rose-400/12 px-1 text-[10px] font-bold tabular-nums text-rose-600 dark:text-rose-300" title="Sostituito">
              ↓{p.subbed_off_minute}&apos;
            </span>
          )}
          {p.subbed_on_minute != null && (
            <span className="shrink-0 rounded bg-emerald-400/12 px-1 text-[10px] font-bold tabular-nums text-emerald-600 dark:text-emerald-300" title="Entrato">
              ↑{p.subbed_on_minute}&apos;
            </span>
          )}
          <BonusMalusIcons p={p} />
        </span>

        <span className="mt-0.5 flex items-center gap-1.5">
          <OwnerPills owners={p.owners} totalTeams={totalTeams} compact />
        </span>
      </span>

      <span className="shrink-0 w-9 overflow-hidden rounded-md border border-hairline bg-surface-2 text-center tabular-nums shadow-sm sm:w-11">
        {v.kind === 'score' ? (
          <>
            <span className="block border-b border-hairline px-1 py-0.5 text-[11px] font-bold leading-none text-ink-2">
              {v.base}
            </span>
            <span className={`block px-1 py-0.5 text-[11px] font-black leading-none ${v.totalCls}`}>
              {v.total}
            </span>
          </>
        ) : (
          <span className={`block px-1 py-1.5 text-[11px] font-bold leading-none ${v.cls}`}>{v.text}</span>
        )}
      </span>
    </div>
  )
}

// Compact goal/assist/card/penalty badges from the real-match stat line.
type BonusMalusPlayer = Pick<
  LiveSnapshotRealPlayer | LiveSnapshotPlayer,
  | 'goals'
  | 'assists'
  | 'penalties_saved'
  | 'clean_sheet_bonus'
  | 'penalties_missed'
  | 'own_goals'
  | 'red_cards'
  | 'yellow_cards'
> & {
  immunita_active?: boolean
}

function BonusMalusIcons({ p }: { p: BonusMalusPlayer }) {
  const items: { key: string; node: ReactNode }[] = []
  const positiveIconClass = 'bg-ink-5/10 text-ink-2'
  if (p.goals > 0)
    items.push({ key: 'g', node: <BonusIcon title="Gol" icon="⚽" count={p.goals} className={positiveIconClass} /> })
  if (p.assists > 0)
    items.push({
      key: 'a',
      node: <BonusIcon title="Assist" icon="👟" count={p.assists} className={positiveIconClass} />,
    })
  if (p.penalties_saved > 0)
    items.push({
      key: 'ps',
      node: <BonusIcon title="Rigore parato" icon="🧤" count={p.penalties_saved} className={positiveIconClass} />,
    })
  if (p.clean_sheet_bonus > 0)
    items.push({
      key: 'cs',
      node: (
        <BonusIcon title={`Porta inviolata +${fmt(p.clean_sheet_bonus, 1)}`} icon="🧤" className={positiveIconClass} />
      ),
    })
  if (p.penalties_missed > 0)
    items.push({
      key: 'pm',
      node: <span className="rounded bg-rose-400/20 px-1 text-[8px] font-bold text-rose-600 dark:text-rose-300" title="Rigore sbagliato">Rig.✕</span>,
    })
  if (p.own_goals > 0)
    items.push({
      key: 'og',
      node: <span className="rounded bg-rose-500/25 px-1 text-[8px] font-bold text-rose-600 dark:text-rose-300" title="Autogol">AG</span>,
    })
  if (p.red_cards > 0)
    items.push({
      key: 'r',
      node: (
        <span className="inline-flex items-center gap-0.5" title={p.immunita_active ? 'Rosso presente, malus annullato da immunità' : 'Rosso'}>
          <span className="inline-block h-3 w-2 rounded-sm bg-rose-500" />
          {p.immunita_active && <span className="text-[10px] leading-none text-indigo-500 dark:text-indigo-300">🛡</span>}
        </span>
      ),
    })
  if (p.yellow_cards > 0 && p.red_cards === 0)
    items.push({
      key: 'y',
      node: (
        <span className="inline-flex items-center gap-0.5" title={p.immunita_active ? 'Giallo presente, malus annullato da immunità' : 'Giallo'}>
          <span className="inline-block h-3 w-2 rounded-sm bg-amber-400" />
          {p.immunita_active && <span className="text-[10px] leading-none text-indigo-500 dark:text-indigo-300">🛡</span>}
        </span>
      ),
    })
  if (!items.length) return null
  return (
    <span className="flex shrink-0 items-center gap-1 self-center">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center leading-none">
          {it.node}
        </span>
      ))}
    </span>
  )
}

function BonusIcon({
  title,
  icon,
  count,
  className = 'bg-ink-5/10 text-ink-2',
}: {
  title: string
  icon: string
  count?: number
  className?: string
}) {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-bold leading-none ${className}`}
      title={title}
    >
      <span aria-hidden>{icon}</span>
      {count != null && count > 1 && <span className="text-[8px]">×{count}</span>}
    </span>
  )
}

// ─────────────────────────────────────────────
// Team detail panel (desktop center)
// ─────────────────────────────────────────────

function TeamDetailPanel({
  team,
  isMine,
  liveCounts,
  liveField,
  ownership,
}: {
  team: LiveSnapshotTeam
  isMine: boolean
  liveCounts: { field: number; bench: number }
  liveField: Map<string, LiveFieldState>
  ownership: Record<string, LiveOwnershipEntry>
}) {
  const notFielded = isNotFielded(team)
  const [view, setView] = useState<TeamLineupView>('pitch')

  return (
    <div
      className={`rounded-xl border bg-glass-1 ${
        isMine ? 'border-indigo-500/40' : 'border-hairline'
      }`}
    >
      <TeamDetailHeader team={team} isMine={isMine} liveCounts={liveCounts} notFielded={notFielded} sticky />

      {notFielded ? (
        <div className="m-3 rounded-lg border border-rose-500/30 bg-rose-500/8 p-4 text-center">
          <p className="text-[13px] font-semibold text-rose-500 dark:text-rose-300">
            Formazione non schierata
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-4">
            Nessuna formazione inviata prima del lock. La squadra prende{' '}
            <span className="font-semibold">0 punti</span> in questa giornata di Battle Royale.
          </p>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex justify-center">
            <TeamViewToggle view={view} onChange={setView} />
          </div>
          {view === 'list' ? (
            <TeamListBody team={team} liveField={liveField} ownership={ownership} />
          ) : (
            <FantasyPitch team={team} liveField={liveField} ownership={ownership} />
          )}
          <LineupLegend />
        </div>
      )}
    </div>
  )
}

type TeamLineupView = 'list' | 'pitch'

// Distinct, team-identifying header bar — indigo-tinted gradient (stronger for
// "my team") so the opened team reads clearly apart from the glass-2 player rows.
function TeamDetailHeader({
  team,
  isMine,
  liveCounts,
  notFielded,
  sticky = false,
}: {
  team: LiveSnapshotTeam
  isMine: boolean
  liveCounts: { field: number; bench: number }
  notFielded: boolean
  sticky?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-t-xl border-b px-4 py-3 ${
        sticky ? 'sticky top-[44px] z-10 bg-surface-1 backdrop-blur-xl' : ''
      } ${
        isMine
          ? 'border-indigo-500/40 bg-gradient-to-r from-indigo-500/22 via-indigo-500/8 to-transparent'
          : 'border-hairline bg-gradient-to-r from-accent/18 via-accent/6 to-transparent'
      }`}
    >
      <span
        aria-hidden
        className={`h-8 w-1 shrink-0 rounded-full ${isMine ? 'bg-indigo-500' : 'bg-accent/70'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold tracking-tight text-ink-1">{team.name}</span>
          {isMine && (
            <span className="shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
              Tu
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-4">
            {notFielded ? 'Formazione non schierata' : team.formation ?? '—'}
          </span>
          <LiveDots field={liveCounts.field} bench={liveCounts.bench} />
        </div>
      </div>
      <span className="text-[22px] font-black tabular-nums text-emerald-500 dark:text-emerald-400">
        {fmt(team.live_total, 1)}
      </span>
    </div>
  )
}

function TeamViewToggle({ view, onChange }: { view: TeamLineupView; onChange: (v: TeamLineupView) => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-full border border-hairline bg-glass-1 p-0.5">
      {([
        { v: 'pitch' as const, label: 'Campo' },
        { v: 'list' as const, label: 'Lista' },
      ]).map((opt) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            view === opt.v ? 'bg-accent text-white shadow-sm' : 'text-ink-4 hover:text-ink-2'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Full glyph legend, shown at the bottom of the team view (after the bench).
function LineupLegend() {
  return (
    <div className="mt-1 rounded-xl border border-hairline bg-glass-1 px-3 py-2.5">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-5">Legenda</p>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-ink-4">
        <span className="mr-0.5 text-ink-5">Sigla in alto a sinistra = ruolo:</span>
        {(['P', 'D', 'C', 'A'] as const).map((r) => (
          <span key={r} className="flex items-center gap-1">
            <span
              className="grid h-[14px] w-[14px] place-items-center rounded-[4px] text-[8px] font-black leading-none text-white"
              style={{ background: ROLE_DOT[r] }}
            >
              {r}
            </span>
            {ROLE_NAME[r]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[10px] text-ink-4">
        <span className="flex items-center gap-1"><span aria-hidden>⚽</span>gol</span>
        <span className="flex items-center gap-1"><span aria-hidden>👟</span>assist</span>
        <span className="flex items-center gap-1"><span aria-hidden>🧤</span>porta inviolata (P.I.)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-2 rounded-sm bg-amber-400" />ammonizione</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-2 rounded-sm bg-rose-500" />espulsione</span>
        <span className="flex items-center gap-1"><span aria-hidden>🥅</span>autogol</span>
        <span className="flex items-center gap-1"><span aria-hidden>👑</span>MVP</span>
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center text-rose-500 dark:text-rose-300"><UsersGlyph /></span>
<span className="font-semibold text-rose-500 dark:text-rose-300">−%</span> P.P. — Penalità di Popolarità: quota di voto persa perché lo schiera anche un&apos;altra squadra (es. 20% lega → −30%)
        </span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_5px_1px] shadow-lime-400/70" />in campo ora</span>
        <span className="flex items-center gap-1"><span className="text-[#f01c9c]"><DiamondGlyph /></span>esclusiva</span>
        <span className="flex items-center gap-1"><span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white">XX</span>rivale titolare · <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-5/70 text-[7px] font-bold text-white">XX</span>rivale panchina</span>
      </div>
    </div>
  )
}

// Shared list body — role-grouped titolari, coach, then bench. Used by both the
// desktop detail panel and the mobile expanded card.
function TeamListBody({
  team,
  liveField,
  ownership,
}: {
  team: LiveSnapshotTeam
  liveField: Map<string, LiveFieldState>
  ownership: Record<string, LiveOwnershipEntry>
}) {
  const fielded = team.players.filter((p) => p.counts)
  const bench = team.players.filter((p) => !p.counts)
  return (
    <>
      {ROLE_ORDER.map((role) => {
        const rolePlayers = fielded.filter((p) => p.role === role)
        if (!rolePlayers.length) return null
        return (
          <div key={role} className="space-y-1">
            {rolePlayers.map((p) => (
              <FantasyPlayerRow key={p.player_id} p={p} entry={ownership[p.player_id]} liveState={liveField.get(p.player_id)} />
            ))}
          </div>
        )
      })}

      {team.coach && (
        <div className="border-t border-hairline pt-2">
          <CoachRow coach={team.coach} />
        </div>
      )}

      {bench.length > 0 && (
        <div className="border-t border-hairline pt-2.5 space-y-1">
          <p className="text-[8px] font-bold uppercase tracking-wider text-ink-5 px-1">Panchina</p>
          {sortByRole(bench).map((p) => (
            <FantasyPlayerRow key={p.player_id} p={p} entry={ownership[p.player_id]} muted liveState={liveField.get(p.player_id)} />
          ))}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// Campetto (pitch) view — read-only, attack on top → GK at bottom.
// Each fielded player is a compact-rich chip showing voto base/total, the
// live football bonus/malus glyphs, MVP & popularity pills, and ownership —
// the same data the list row carries, laid out on the field.
// ─────────────────────────────────────────────

function FantasyPitch({
  team,
  liveField,
  ownership,
}: {
  team: LiveSnapshotTeam
  liveField: Map<string, LiveFieldState>
  ownership: Record<string, LiveOwnershipEntry>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const fielded = team.players.filter((p) => p.counts)
  const bench = team.players.filter((p) => !p.counts)
  // GK on top, attack at the bottom. Each role is its own grid row so N players
  // always lay out as N columns (a 4-man midfield never wraps to 3+1).
  const rows = (['P', 'D', 'C', 'A'] as const)
    .map((role) => sortByRole(fielded.filter((p) => p.role === role)))
    .filter((r) => r.length > 0)
  const selected = team.players.find((p) => p.player_id === selectedId) ?? null
  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id))

  return (
    <div className="space-y-2">
      <div
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-hairline px-1.5 py-4 shadow-1"
        style={{ background: 'linear-gradient(170deg, #3a8f57, #2f7a49)' }}
      >
        {/* mowing stripes + field lines */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: 'repeating-linear-gradient(180deg, transparent 0 38px, rgba(255,255,255,0.08) 38px 76px)' }}
        />
        <div className="pointer-events-none absolute left-4 right-4 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.3)' }} />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.3)' }} />

        {rows.map((row, i) => (
          <div
            key={i}
            className="relative z-[1] mx-auto grid w-full gap-1.5"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0,1fr))`, maxWidth: row.length * 88 }}
          >
            {row.map((p) => (
              <FantasyPitchChip
                key={p.player_id}
                p={p}
                entry={ownership[p.player_id]}
                liveState={liveField.get(p.player_id)}
                selected={p.player_id === selectedId}
                onSelect={() => toggle(p.player_id)}
              />
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <PlayerDetailSheet
          p={selected}
          entry={ownership[selected.player_id]}
          teamName={team.name}
          liveState={liveField.get(selected.player_id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {team.coach && <CoachRow coach={team.coach} />}

      {bench.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-[8px] font-bold uppercase tracking-wider text-ink-5">Panchina</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {sortByRole(bench).map((p) => (
              <BenchChip
                key={p.player_id}
                p={p}
                liveState={liveField.get(p.player_id)}
                selected={p.player_id === selectedId}
                onSelect={() => toggle(p.player_id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Round national-team crest. The role is now conveyed by the card outline, so
// the only overlay here is a lime ring when the player is on the pitch right now.
function PlayerCrest({ p, live, size }: { p: LiveSnapshotPlayer; live: boolean; size: number }) {
  const t = p.national_team
  const src = t?.logo_url || t?.flag_url
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className={`block overflow-hidden rounded-full ${live ? 'ring-2 ring-lime-400' : ''}`}
        style={{ width: size, height: size }}
      >
        {src ? (
          <Image src={src} alt={t?.name ?? ''} width={size} height={size} className="h-full w-full object-cover" unoptimized />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-glass-2 font-mono text-ink-4" style={{ fontSize: Math.round(size * 0.4) }}>
            {(t?.fifa_code ?? '').toUpperCase()}
          </span>
        )}
      </span>
    </div>
  )
}

// Small role "nail" tucked in the card's top-left corner — the role letter on
// its solid role color. Reads the role at a glance and stays visible whatever
// the card's border/selection state is (unlike the old thin role outline).
function RoleNail({ role }: { role: string }) {
  const c = ROLE_DOT[role] ?? '#94a3b8'
  return (
    <span
      aria-hidden
      title={ROLE_NAME[role] ?? role}
      className="absolute left-0 top-0 z-[1] grid h-[15px] w-[15px] place-items-center rounded-br-lg rounded-tl-xl text-[9px] font-black leading-none text-white"
      style={{ background: c }}
    >
      {role}
    </span>
  )
}

// MVP crown + the football bonus/malus emoji glyphs (goals/assists carry ×N,
// clean sheet shows the 🧤, cards are colored chips) — reused from the list row.
// `hideMvp` suppresses the standalone crown when it's merged into the combined
// MVP+esclusiva glyph instead.
function PitchGlyphs({ p, hideMvp = false }: { p: LiveSnapshotPlayer; hideMvp?: boolean }) {
  const showMvp = p.mvp_bonus > 0.005 && !hideMvp
  return (
    <>
      {showMvp && (
        <span className="text-[12px] leading-none" title={`MVP +${fmt(p.mvp_bonus, 1)}`} aria-label="MVP">👑</span>
      )}
      <BonusMalusIcons p={p} />
    </>
  )
}

// When a player is BOTH exclusive (owned by this team alone) AND the MVP, the
// diamond and crown merge into one shiny gold→magenta badge — the jackpot moment.
function MvpExclusiveGlyph() {
  return (
    <span
      title="Esclusiva + MVP — solo questa squadra lo schiera, ed è il migliore in campo"
      className="inline-flex animate-pulse items-center gap-0.5 rounded-md px-1 py-[1.5px] text-[10px] font-black leading-none text-white shadow-sm"
      style={{ background: 'linear-gradient(90deg,#f59e0b,#f01c9c)' }}
    >
      <span aria-hidden>👑</span>
      <DiamondGlyph className="text-white" />
      <span aria-hidden>✨</span>
    </span>
  )
}

// Popularity readout for a SHARED player: the % of the lega that fields him
// (now → potential) and, once it materialises, the P.P. voto deduction.
// The percentage is known up-front (it's just ownership), so it shows even
// before any penalty has accrued — the user can read the risk at a glance.
// Shows the Penalità di Popolarità as a PERCENTAGE — the malus a shared player
// will take on his score (e.g. 20% ownership → −30%). The % is bracket-derived,
// so it's known up-front, before he's even played. The minus sign and rose tint
// make it read unambiguously as a penalty. Ownership %, the now→max ramp and the
// live malus amount all live in the tooltip and the detail sheet.
function PopularityChip({ p, entry }: { p: LiveSnapshotPlayer; entry: LiveOwnershipEntry | undefined }) {
  const penPctNow = Math.round(p.popularity_penalty_pct_now ?? 0)
  const penPctMax = Math.round(p.popularity_penalty_pct_potential ?? 0)
  const penPct = penPctNow || penPctMax
  if (penPct <= 0) return null // ≤10% ownership → no penalty bracket
  const biting = p.popularity_penalty_now > 0.005
  const pctOwnNow = entry ? Math.round(entry.pct_now) : null
  const pctOwnMax = entry ? Math.round(entry.pct_potential) : null
  const title =
    `Penalità di Popolarità −${penPct}%` +
    (penPctMax > penPctNow ? ` → −${penPctMax}% se il possesso sale a ${pctOwnMax}%` : '') +
    (pctOwnNow != null ? ` · popolarità ${pctOwnNow}% della lega` : '') +
    (biting ? ` · malus attuale −${fmt(p.popularity_penalty_now, 2)}` : '')
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 text-[8px] font-bold tabular-nums ${
        biting ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300' : 'bg-rose-400/12 text-rose-500/90 dark:text-rose-300/85'
      }`}
    >
      <UsersGlyph className="text-rose-500 dark:text-rose-300" />
      −{penPct}%
    </span>
  )
}

// Three-people glyph for the Penalità di Popolarità (P.P.).
function UsersGlyph({ className = '' }: { className?: string }) {
  return (
    <svg width="12" height="9" viewBox="0 0 16 11" className={className} aria-hidden role="img">
      <circle cx="5" cy="3" r="2.3" fill="currentColor" />
      <circle cx="11.5" cy="3.6" r="1.8" fill="currentColor" />
      <path d="M0.8 10.4c0-2.3 1.9-3.6 4.2-3.6s4.2 1.3 4.2 3.6z" fill="currentColor" />
      <path d="M9.6 10.4c0-1.7 1.1-2.9 2.7-2.9 1.6 0 2.5 1 2.5 2.9z" fill="currentColor" />
    </svg>
  )
}

function DiamondGlyph({ className = '' }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" className={className} aria-hidden role="img">
      <path d="M6 0.7l5 4.3-5 6.3-5-6.3z" fill="currentColor" />
    </svg>
  )
}

// Pitch-chip ownership row: a magenta diamond when only this team fields the
// player (exclusive), otherwise rival monograms colored by status — solid blue
// = titolare, grey = panchina — so the status reads at a glance.
function OwnershipMini({ owners, isMvp = false }: { owners: LiveOwnerRef[]; isMvp?: boolean }) {
  if (!owners.length) {
    if (isMvp) return <MvpExclusiveGlyph />
    return (
      <span
        title="Esclusiva — solo questa squadra lo schiera"
        className="inline-flex h-[17px] items-center rounded-md bg-[#f01c9c]/12 px-1 text-[#f01c9c]"
      >
        <DiamondGlyph />
      </span>
    )
  }
  const shown = owners.slice(0, 3)
  const extra = owners.length - 3
  return (
    <div className="flex h-[17px] items-center">
      {shown.map((o, i) => (
        <span
          key={o.fantasy_team_id}
          title={`${o.team_name} — ${o.status === 'titolare' ? 'titolare' : 'panchina'}`}
          className={`flex h-[17px] w-[17px] items-center justify-center rounded-full text-[8px] font-bold text-white ${
            o.status === 'titolare' ? 'bg-indigo-500' : 'bg-ink-5/70'
          }`}
          style={{ marginLeft: i ? -5 : 0, border: '1.5px solid var(--glass-3)' }}
        >
          {o.team_name.slice(0, 2).toUpperCase()}
        </span>
      ))}
      {extra > 0 && <span className="ml-0.5 text-[9px] font-semibold text-ink-4">+{extra}</span>}
    </div>
  )
}

function FantasyPitchChip({
  p,
  entry,
  liveState,
  selected,
  onSelect,
}: {
  p: LiveSnapshotPlayer
  entry: LiveOwnershipEntry | undefined
  liveState?: LiveFieldState
  selected: boolean
  onSelect: () => void
}) {
  const v = computeVoto(p)
  const isMvp = p.mvp_bonus > 0.005
  const exclusiveMvp = p.owners.length === 0 && isMvp

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex min-h-[116px] min-w-0 flex-col items-center gap-1 rounded-xl border bg-glass-3 px-1 py-1.5 text-center shadow-sm transition-all ${
        selected ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'border-hairline'
      }`}
    >
      <RoleNail role={p.role} />
      <PlayerCrest p={p} live={liveState === 'field'} size={28} />

      <span className="flex w-full items-center justify-center gap-0.5">
        <span className="truncate text-[11px] font-bold leading-tight text-ink-1">{shortPlayerName(p.name)}</span>
        {p.via === 'sub' && (
          <span className="shrink-0 rounded bg-emerald-400/15 px-0.5 text-[7px] font-bold uppercase text-emerald-600 dark:text-emerald-300">sub</span>
        )}
      </span>

      {/* voto base / total */}
      <span className="block w-full max-w-[46px] overflow-hidden rounded-md border border-hairline bg-surface-2 tabular-nums">
        {v.kind === 'score' ? (
          <>
            <span className="block border-b border-hairline px-1 text-[10px] font-bold leading-[1.45] text-ink-2">{v.base}</span>
            <span className={`block px-1 text-[12px] font-black leading-[1.4] ${v.totalCls}`}>{v.total}</span>
          </>
        ) : (
          <span className={`block px-1 py-1 text-[12px] font-bold leading-none ${v.cls}`}>{v.text}</span>
        )}
      </span>

      {/* single meta strip pinned to the bottom — glyphs, popularity and ownership
          all on one wrapping line so every card keeps the same structure & height */}
      <span className="mt-auto flex w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 pt-0.5">
        <PitchGlyphs p={p} hideMvp={exclusiveMvp} />
        <PopularityChip p={p} entry={entry} />
        <OwnershipMini owners={p.owners} isMvp={isMvp} />
      </span>
    </button>
  )
}

// Bench chip — compact, selectable; same crest/voto/ownership language.
function BenchChip({
  p,
  liveState,
  selected,
  onSelect,
}: {
  p: LiveSnapshotPlayer
  liveState?: LiveFieldState
  selected: boolean
  onSelect: () => void
}) {
  const v = computeVoto(p)
  const roleColor = ROLE_DOT[p.role] ?? '#94a3b8'
  return (
    <button
      type="button"
      onClick={onSelect}
      title={ROLE_NAME[p.role] ?? p.role}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border bg-glass-2 px-1.5 py-1.5 text-left transition-all ${
        selected ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'border-hairline'
      }`}
    >
      <span
        aria-hidden
        className="grid h-4 w-4 shrink-0 place-items-center rounded text-[8px] font-black leading-none text-white"
        style={{ background: roleColor }}
      >
        {p.role}
      </span>
      <PlayerCrest p={p} live={liveState === 'field'} size={18} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-2">{shortPlayerName(p.name)}</span>
      <OwnershipMini owners={p.owners} />
      <span className={`shrink-0 text-[11px] font-bold tabular-nums ${v.kind === 'score' ? v.totalCls : v.cls}`}>
        {v.kind === 'score' ? v.total : v.text}
      </span>
    </button>
  )
}

// Tap-to-expand detail for a single player: full voto, every bonus/malus with
// its value, and the rival teams (with titolare/panchina) or an exclusive call.
function PlayerDetailSheet({
  p,
  entry,
  teamName,
  liveState,
  onClose,
}: {
  p: LiveSnapshotPlayer
  entry: LiveOwnershipEntry | undefined
  teamName: string
  liveState?: LiveFieldState
  onClose: () => void
}) {
  const v = computeVoto(p)
  const roleName = ROLE_NAME[p.role] ?? p.role
  const pp = p.popularity_penalty_now
  const ppPot = p.popularity_penalty_potential
  const pctNow = entry ? Math.round(entry.pct_now) : null
  const pctMax = entry ? Math.round(entry.pct_potential) : null

  const chips: { key: string; icon: ReactNode; label: string; value?: ReactNode; title?: string; tone: 'pos' | 'neg' | 'mvp' }[] = []
  if (p.goals > 0) chips.push({ key: 'g', icon: '⚽', label: p.goals > 1 ? `Gol ×${p.goals}` : 'Gol', tone: 'pos' })
  if (p.assists > 0) chips.push({ key: 'a', icon: '👟', label: p.assists > 1 ? `Assist ×${p.assists}` : 'Assist', tone: 'pos' })
  if (p.clean_sheet_bonus > 0) chips.push({ key: 'cs', icon: '🧤', label: 'Porta inviolata', value: `+${fmt(p.clean_sheet_bonus, 1)}`, tone: 'pos' })
  if (p.penalties_saved > 0) chips.push({ key: 'ps', icon: '🧤', label: p.penalties_saved > 1 ? `Rigore parato ×${p.penalties_saved}` : 'Rigore parato', tone: 'pos' })
  if (p.penalties_missed > 0) chips.push({ key: 'pm', icon: '❌', label: 'Rigore sbagliato', tone: 'neg' })
  if (p.own_goals > 0) chips.push({ key: 'og', icon: '🥅', label: p.own_goals > 1 ? `Autogol ×${p.own_goals}` : 'Autogol', tone: 'neg' })
  if (p.yellow_cards > 0 && p.red_cards === 0) chips.push({ key: 'y', icon: <span className="inline-block h-3 w-2 rounded-sm bg-amber-400" />, label: 'Ammonizione', tone: 'neg' })
  if (p.red_cards > 0) chips.push({ key: 'r', icon: <span className="inline-block h-3 w-2 rounded-sm bg-rose-500" />, label: 'Espulsione', tone: 'neg' })
  if (p.mvp_bonus > 0.005) chips.push({ key: 'mvp', icon: '👑', label: 'MVP', value: `+${fmt(p.mvp_bonus, 1)}`, tone: 'mvp' })
  const hasPen = pp > 0.005 || ppPot > 0.005
  const penPctNow = Math.round(p.popularity_penalty_pct_now ?? 0)
  const penPctMax = Math.round(p.popularity_penalty_pct_potential ?? 0)
  const penPct = penPctNow || penPctMax
  if (penPct > 0 || hasPen)
    chips.push({
      key: 'pp',
      icon: <UsersGlyph className="text-rose-500 dark:text-rose-300" />,
      label: 'P.P.',
      title:
        `Penalità di Popolarità −${penPct}%${penPctMax > penPctNow ? ` → −${penPctMax}%` : ''}` +
        (pctNow != null ? ` · popolarità ${pctNow}%${pctMax != null && pctMax > pctNow ? ` → ${pctMax}%` : ''} della lega` : '') +
        (hasPen ? ` · malus −${fmt(pp, 2)} → −${fmt(ppPot, 2)}` : ''),
      value: (
        <>
          {/* the penalty %, leading — what he'll lose to popularity */}
          <span className="font-bold text-rose-600 dark:text-rose-300">
            −{penPct}%{penPctMax > penPctNow && <span className="text-ink-5"> → −{penPctMax}%</span>}
          </span>
          {pctNow != null && (
            <span className="text-ink-5"> · {pctNow}% lega</span>
          )}
          {hasPen && <span className="text-rose-600 dark:text-rose-300"> · −{fmt(pp, 2)}</span>}
        </>
      ),
      tone: 'neg',
    })

  const others = p.owners

  return (
    <div className="rounded-2xl border border-hairline bg-glass-1 p-3.5 shadow-1">
      <div className="flex items-center gap-2.5">
        <PlayerCrest p={p} live={liveState === 'field'} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-ink-1">{p.name}</div>
          <div className="text-[11px] text-ink-4">
            {roleName}
            {liveState === 'field' && <span className="text-lime-500 dark:text-lime-400"> · in campo</span>}
          </div>
        </div>
        {v.kind === 'score' ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-black text-ink-1 tabular-nums">{v.base}</span>
            <span className="text-ink-5">→</span>
            <span className={`text-[20px] font-black tabular-nums ${v.totalCls}`}>{v.total}</span>
          </div>
        ) : (
          <span className={`text-[14px] font-bold ${v.cls}`}>{v.text}</span>
        )}
        <button onClick={onClose} className="ml-1 shrink-0 text-ink-5 hover:text-ink-2" aria-label="Chiudi">✕</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.length ? (
          chips.map((c) => (
            <span
              key={c.key}
              title={c.title}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] ${
                c.tone === 'neg'
                  ? 'bg-rose-400/10 text-rose-600 dark:text-rose-300'
                  : c.tone === 'mvp'
                    ? 'bg-amber-400/12 text-amber-600 dark:text-amber-300'
                    : 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <span className="inline-flex items-center text-[12px] leading-none">{c.icon}</span>
              {c.label}
              {c.value && <span className="font-bold tabular-nums">{c.value}</span>}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-ink-5">Nessun bonus o malus</span>
        )}
      </div>

      <div className="mt-3 border-t border-hairline pt-2.5">
        {others.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-[#f01c9c]/10 px-3 py-2.5">
            <span className="text-[#f01c9c]"><DiamondGlyph className="h-4 w-4" /></span>
            <div>
              <div className="text-[12.5px] font-bold text-[#f01c9c]">Esclusiva di {teamName}</div>
              <div className="text-[10.5px] text-ink-4">Nessun&apos;altra squadra della lega lo schiera</div>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-1 px-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-5">Schierato anche da</p>
            <div className="space-y-0.5">
              {others.map((o) => {
                const titolare = o.status === 'titolare'
                return (
                  <div key={o.fantasy_team_id} className="flex items-center gap-2 py-1">
                    <span
                      className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-bold text-white ${
                        titolare ? 'bg-indigo-500' : 'bg-ink-5/70'
                      }`}
                    >
                      {o.team_name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-1">{o.team_name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        titolare
                          ? 'bg-indigo-400/12 text-indigo-500 dark:text-indigo-300'
                          : 'bg-ink-5/8 text-ink-5'
                      }`}
                    >
                      {titolare ? <PitchGlyph className="text-indigo-500/80 dark:text-indigo-300/80" /> : <BenchGlyph className="text-ink-5" />}
                      {titolare ? 'titolare' : 'panchina'}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CoachRow({ coach }: { coach: LiveSnapshotTeam['coach'] }) {
  if (!coach) return null
  return (
    <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-400/20 bg-indigo-400/8 px-2.5 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-indigo-400/12 text-[10px] font-black text-indigo-500 dark:text-indigo-300">CT</span>
      <TeamCrest
        name={coach.team?.name ?? ''}
        logoUrl={coach.team?.logo_url ?? null}
        flagUrl={coach.team?.flag_url ?? null}
        fifaCode={coach.team?.fifa_code ?? ''}
        size={18}
        className="w-[18px]"
      />
      <span className="flex-1 truncate text-[12px] font-semibold text-ink-1">{coach.name}</span>
      <CoachTierBadge tier={coach.tier} />
      {coach.live_result && (
        <span
          className={`shrink-0 rounded px-1 text-[8px] font-bold uppercase ${
            coach.live_result === 'W'
              ? 'bg-emerald-400/15 text-emerald-300'
              : coach.live_result === 'L'
              ? 'bg-rose-400/15 text-rose-300'
              : 'bg-ink-5/10 text-ink-4'
          }`}
        >
          {coach.live_result === 'W' ? 'VITTORIA' : coach.live_result === 'L' ? 'SCONFITTA' : 'PAREGGIO'}
        </span>
      )}
      <span
        className={`shrink-0 w-10 text-right tabular-nums text-[11px] font-semibold ${
          coach.live_score == null ? 'text-ink-5' : coach.live_score >= 0 ? 'text-ink-1' : 'text-rose-400'
        }`}
      >
        {coach.live_score == null ? '—' : `${coach.live_score > 0 ? '+' : ''}${fmt(coach.live_score)}`}
      </span>
    </div>
  )
}

// A single live-presence dot for a player row: green = on the pitch right now,
// grey = in the real squad but benched by the coach. Nothing when his nation
// isn't in a live match.
function LivePlayerDot({ state }: { state: LiveFieldState | undefined }) {
  if (!state) return null
  return (
    <span
      title={state === 'field' ? 'In campo ora' : 'In panchina (allenatore)'}
      className={`h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${
        state === 'field'
          ? 'bg-lime-400 shadow-[0_0_7px_2px] shadow-lime-400/70'
          : 'bg-ink-5/55 shadow-[0_0_5px_1px] shadow-ink-5/30'
      }`}
    />
  )
}

function FantasyPlayerRow({
  p,
  entry,
  muted = false,
  liveState,
}: {
  p: LiveSnapshotPlayer
  entry?: LiveOwnershipEntry
  muted?: boolean
  liveState?: LiveFieldState
}) {
  const penNow = p.popularity_penalty_now
  const penPot = p.popularity_penalty_potential
  const hasPen = penNow > 0.005 || penPot > 0.005
  const penPctNow = Math.round(p.popularity_penalty_pct_now ?? 0)
  const penPctMax = Math.round(p.popularity_penalty_pct_potential ?? 0)
  const penPct = penPctNow || penPctMax
  const showPen = penPct > 0 || hasPen
  const showMvp = p.mvp_bonus > 0.005
  const pctNow = entry ? Math.round(entry.pct_now) : null
  const pctMax = entry ? Math.round(entry.pct_potential) : null

  const v = computeVoto(p)

  return (
    <div
      className={`flex min-h-[54px] items-center gap-2 rounded-md border border-hairline bg-glass-2 px-2 py-1.5 ${
        muted ? 'opacity-55' : ''
      }`}
    >
      <span
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded text-[10px] font-bold ${
          ROLE_COLOR[p.role] ?? 'text-ink-4'
        } bg-ink-5/10`}
      >
        {p.role}
      </span>
      <TeamCrest
        name={p.national_team?.name ?? ''}
        logoUrl={p.national_team?.logo_url ?? null}
        flagUrl={p.national_team?.flag_url ?? null}
        fifaCode={p.national_team?.fifa_code ?? ''}
        size={16}
        className="w-4 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-ink-1">{p.name}</span>
          {p.via === 'sub' && (
            <span className="shrink-0 rounded bg-emerald-400/15 px-1 py-px text-[8px] font-bold uppercase text-emerald-300">
              sub
            </span>
          )}
          <BonusMalusIcons p={p} />
        </div>

        <OwnerPills owners={p.owners} />

        {(showMvp || showPen) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {showMvp && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-amber-500 dark:text-amber-300">
                <span aria-hidden>★</span>MVP +{fmt(p.mvp_bonus, 1)}
              </span>
            )}
            {showPen && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-rose-400/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-500 dark:text-rose-300"
                title={
                  `Penalità di Popolarità −${penPct}%${penPctMax > penPctNow ? ` → −${penPctMax}%` : ''}` +
                  (pctNow != null ? ` · popolarità ${pctNow}%${pctMax != null && pctMax > pctNow ? ` → ${pctMax}%` : ''} della lega` : '') +
                  (hasPen ? ` · malus −${fmt(penNow)} → −${fmt(penPot)}` : '')
                }
              >
                <UsersGlyph className="text-rose-500 dark:text-rose-300" />
                <span className="font-bold text-rose-600 dark:text-rose-300">
                  −{penPct}%{penPctMax > penPctNow && <span className="text-ink-5"> → −{penPctMax}%</span>}
                </span>
                {pctNow != null && <span className="text-ink-5">· {pctNow}% lega</span>}
                {hasPen && <span className="text-indigo-500 dark:text-indigo-300">· −{fmt(penNow)}</span>}
              </span>
            )}
          </div>
        )}
      </div>

      <LivePlayerDot state={liveState} />

      <span className="shrink-0 w-16 overflow-hidden rounded-lg border border-hairline bg-surface-2 text-center tabular-nums shadow-sm">
        {v.kind === 'score' ? (
          <>
            <span className="block border-b border-hairline px-1.5 py-1 text-[14px] font-bold leading-none text-ink-2">
              {v.base}
            </span>
            <span className={`block px-1.5 py-1 text-[15px] font-black leading-none ${v.totalCls}`}>
              {v.total}
            </span>
          </>
        ) : (
          <span className={`block px-1.5 py-2.5 text-[14px] font-bold leading-none ${v.cls}`}>{v.text}</span>
        )}
      </span>
    </div>
  )
}

function OwnerPills({
  owners,
  totalTeams,
  compact = false,
}: {
  owners: LiveOwnerRef[]
  totalTeams?: number
  compact?: boolean
}) {
  if (!owners.length) return null
  // Exclusive ownership — rostered by exactly one team in the whole lega AND
  // fielded as a starter (titolare). The trademark moment of the format, so the
  // "in 1/N" badge glows magenta. A lone owner who only benched him stays grey
  // until he's actually on the field.
  const isExclusiveStarter =
    totalTeams != null && owners.length === 1 && owners[0]?.status === 'titolare'
  return (
    <div className={`flex min-w-0 items-center gap-1 ${compact ? 'mt-0.5 flex-nowrap overflow-hidden' : 'mt-1 flex-wrap'}`}>
      <span
        className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-medium ${
          isExclusiveStarter ? 'font-black text-[#f01c9c]' : 'text-ink-5'
        }`}
      >
        {totalTeams ? `in ${owners.length}/${totalTeams}` : 'anche in'}
      </span>
      {owners.map((owner, i) => {
        const isStarter = owner.status === 'titolare'
        return (
          <span
            key={`${owner.team_name}-${owner.status}-${i}`}
            className={`inline-flex ${compact ? 'max-w-[96px] px-1.5 py-px text-[9px]' : 'max-w-[180px] px-2 py-0.5 text-[10px]'} items-center gap-1 rounded-full border font-semibold ${
              isStarter
                ? 'border-indigo-400/25 bg-indigo-400/12 text-indigo-500 dark:text-indigo-300'
                : 'border-hairline bg-ink-5/8 text-ink-5'
            }`}
            title={`${owner.team_name} — ${isStarter ? 'titolare' : 'panchina'}`}
          >
            <span className="truncate">{owner.team_name}</span>
            {isStarter ? (
              <PitchGlyph className="shrink-0 text-indigo-500/80 dark:text-indigo-300/80" />
            ) : (
              <BenchGlyph className="shrink-0 text-ink-5" />
            )}
          </span>
        )
      })}
    </div>
  )
}

// Titolare → a tiny football pitch; panchina → a bench. Replaces the old
// "tit"/"pan" text so a glance reads the role without parsing abbreviations.
function PitchGlyph({ className = '' }: { className?: string }) {
  return (
    <svg width="11" height="9" viewBox="0 0 14 11" className={className} aria-label="titolare" role="img">
      <rect x="0.6" y="0.6" width="12.8" height="9.8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="7" y1="0.6" x2="7" y2="10.4" stroke="currentColor" strokeWidth="1" />
      <circle cx="7" cy="5.5" r="1.7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function BenchGlyph({ className = '' }: { className?: string }) {
  return (
    <svg width="11" height="9" viewBox="0 0 14 11" className={className} aria-label="panchina" role="img">
      {/* seat + backrest */}
      <line x1="1.5" y1="4" x2="12.5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1.5" y1="6.2" x2="12.5" y2="6.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* legs */}
      <line x1="3" y1="6.2" x2="3" y2="9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="6.2" x2="11" y2="9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────
// Standings panel (right column / mobile tab)
// ─────────────────────────────────────────────

function StandingsPanel({
  teams,
  standings,
  classifica,
  roundName,
  myTeamId,
  selectedTeamId,
  onSelect,
}: {
  teams: LiveSnapshotTeam[]
  standings: LiveRoundSnapshot['standings']
  classifica: LiveRoundSnapshot['classifica']
  roundName: string
  myTeamId: string | null
  selectedTeamId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <GiornataLivePanel
        teams={teams}
        standings={standings}
        roundName={roundName}
        myTeamId={myTeamId}
        selectedTeamId={selectedTeamId}
        onSelect={onSelect}
      />
      <ClassificaLivePanel
        teams={teams}
        classifica={classifica}
        myTeamId={myTeamId}
        selectedTeamId={selectedTeamId}
        onSelect={onSelect}
      />
    </div>
  )
}

/** The current giornata's live battle — score, goals, giornata points. */
function GiornataLivePanel({
  teams,
  standings,
  roundName,
  myTeamId,
  selectedTeamId,
  onSelect,
}: {
  teams: LiveSnapshotTeam[]
  standings: LiveRoundSnapshot['standings']
  roundName: string
  myTeamId: string | null
  selectedTeamId: string | null
  onSelect: (id: string) => void
}) {
  // Ordered by live total (teams already arrives sorted by live_total desc).
  // A proportional bar (relative to the leader) makes the gaps glanceable.
  const maxTotal = Math.max(1, ...teams.map((t) => (standings ?? {})[t.fantasy_team_id]?.live_total ?? t.live_total))
  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <div className="px-2.5 pt-2.5 pb-1">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-400/80">Giornata live</p>
        <p className="text-[9.5px] text-ink-5">{roundName} — punteggi e gol in tempo reale</p>
      </div>

      {teams.map((team, i) => {
        const s = (standings ?? {})[team.fantasy_team_id]
        const isMine = team.fantasy_team_id === myTeamId
        const isSelected = team.fantasy_team_id === selectedTeamId
        const goals = s?.goals_scored ?? 0
        const gPts = s?.giornata_points ?? 0
        const total = s?.live_total ?? team.live_total
        const notFielded = isNotFielded(team)
        const barPct = notFielded ? 0 : Math.max(2, (total / maxTotal) * 100)

        return (
          <button
            key={team.fantasy_team_id}
            onClick={() => onSelect(team.fantasy_team_id)}
            className={`w-full border-t border-hairline px-2.5 py-2 text-left transition-colors hover:bg-glass-2 ${
              isSelected ? 'bg-indigo-500/8' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-4 shrink-0 text-center text-[12px] font-bold tabular-nums ${
                  i === 0 ? 'text-amber-500 dark:text-amber-400' : 'text-ink-5'
                }`}
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={`truncate text-[13px] font-bold ${isMine ? 'text-indigo-500 dark:text-indigo-300' : 'text-ink-1'}`}>
                    {team.name}
                  </span>
                  {isMine && (
                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-indigo-400/70">tu</span>
                  )}
                  {notFielded && (
                    <span className="shrink-0 text-[9px] font-semibold text-rose-500 dark:text-rose-400">non schierata</span>
                  )}
                </div>

                {/* proportional score bar */}
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-5/10">
                  <div
                    className={`h-full rounded-full ${isMine ? 'bg-indigo-400' : i === 0 ? 'bg-emerald-400' : 'bg-emerald-400/55'}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>

                <div className="mt-1 flex items-center gap-2 text-[9.5px] text-ink-5">
                  <span className="flex items-center gap-0.5 tabular-nums">
                    <span className={goals > 0 ? 'text-emerald-500 dark:text-emerald-400' : ''}>⚽ {goals}</span>
                  </span>
                  <span className="text-ink-5/40">·</span>
                  <span className="tabular-nums">
                    <span className={`font-bold ${gPts > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-ink-4'}`}>{gPts}</span> pt giornata
                  </span>
                </div>
              </div>

              <span className="shrink-0 self-start text-[18px] font-black tabular-nums text-ink-1 leading-none">
                {fmt(total, 1)}
              </span>
            </div>
          </button>
        )
      })}

      <div className="border-t border-hairline px-2.5 py-2 text-[9.5px] text-ink-5 leading-relaxed">
        Punti giornata calcolati in tempo reale sulle soglie gol.
      </div>
    </div>
  )
}

/** Cumulative season standings, with this giornata's live points layered in. */
function ClassificaLivePanel({
  teams,
  classifica,
  myTeamId,
  selectedTeamId,
  onSelect,
}: {
  teams: LiveSnapshotTeam[]
  classifica: LiveRoundSnapshot['classifica']
  myTeamId: string | null
  selectedTeamId: string | null
  onSelect: (id: string) => void
}) {
  // Order by the classifica rank, not by giornata live order.
  // `classifica` can be absent on snapshots polled from the live API (the
  // page-level backfill only covers the initial SSR snapshot), so default it.
  const classMap = classifica ?? {}
  const ordered = [...teams].sort(
    (a, b) =>
      (classMap[a.fantasy_team_id]?.rank ?? 99) - (classMap[b.fantasy_team_id]?.rank ?? 99),
  )

  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <div className="px-2.5 pt-2.5 pb-1">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-ink-4">Classifica live</p>
        <p className="text-[9.5px] text-ink-5">Totale stagione, giornata corrente inclusa</p>
      </div>

      {ordered.map((team) => {
        const c = classMap[team.fantasy_team_id]
        const isMine = team.fantasy_team_id === myTeamId
        const isSelected = team.fantasy_team_id === selectedTeamId
        const rank = c?.rank ?? 0
        const brTotal = c?.br_points_total ?? 0
        const brPrior = c?.br_points_prior ?? 0
        const liveDelta = brTotal - brPrior

        return (
          <button
            key={team.fantasy_team_id}
            onClick={() => onSelect(team.fantasy_team_id)}
            className={`w-full border-t border-hairline px-2.5 py-2 text-left transition-colors hover:bg-glass-2 ${
              isSelected ? 'bg-indigo-500/8' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-center text-[12px] font-bold text-ink-5">{rank}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={`truncate text-[13px] font-bold ${isMine ? 'text-indigo-300' : 'text-ink-2'}`}>
                    {team.name}
                  </span>
                  {isMine && (
                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-indigo-400/60">tu</span>
                  )}
                </div>
              </div>

              {/* live delta from this giornata */}
              {liveDelta > 0 && (
                <span className="shrink-0 text-[9.5px] font-semibold tabular-nums text-emerald-400/80">
                  +{liveDelta}
                </span>
              )}
              <span className="w-8 shrink-0 text-right text-[17px] font-black tabular-nums leading-none text-ink-1">
                {brTotal}
              </span>
            </div>
          </button>
        )
      })}

      <div className="border-t border-hairline px-2.5 py-2 text-[9.5px] text-ink-5 leading-relaxed">
        Punti totali = giornate concluse + proiezione live di questa giornata.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Preview-mode masking components
// ─────────────────────────────────────────────

function MaskedTeamPanel({ team }: { team: LiveSnapshotTeam }) {
  const starterCount = team.players.filter((p) => p.counts).length
  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <div className="bg-glass-2 border-b border-hairline px-4 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-bold text-ink-1 truncate">{team.name}</span>
          <p className="text-[10px] text-ink-5">{team.formation ?? '—'}</p>
        </div>
        <span className="text-[22px] font-black tabular-nums text-emerald-400">
          {fmt(team.live_total, 1)}
        </span>
      </div>
      <div className="p-4 text-center space-y-2">
        <MaskedPlayerRows count={starterCount} />
        <p className="text-[10px] text-ink-5 pt-2">
          Formazione nascosta — visibile dal primo calcio d&apos;inizio
        </p>
      </div>
    </div>
  )
}

function MaskedPlayerRows({ count }: { count: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-md border border-hairline bg-glass-2 px-2 py-1"
        >
          <span className="h-2 w-2 rounded-full bg-ink-5/20" />
          <span className="flex-1 h-2 rounded bg-ink-5/15" />
          <span className="w-8 h-2 rounded bg-ink-5/10" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Mobile team card (accordion)
// ─────────────────────────────────────────────

function MobileTeamCard({
  team,
  rank,
  isMine,
  standings,
  expanded,
  previewMode,
  liveCounts,
  liveField,
  ownership,
  onToggle,
}: {
  team: LiveSnapshotTeam
  rank: number
  isMine: boolean
  standings: LiveRoundSnapshot['standings'][string] | undefined
  expanded: boolean
  previewMode: boolean
  liveCounts: { field: number; bench: number }
  liveField: Map<string, LiveFieldState>
  ownership: Record<string, LiveOwnershipEntry>
  onToggle: () => void
}) {
  const notFielded = isNotFielded(team)
  const [view, setView] = useState<TeamLineupView>('pitch')
  return (
    <div
      className={`rounded-xl border bg-glass-1 ${expanded ? '' : 'overflow-hidden'} ${
        isMine ? 'border-indigo-500/30' : 'border-hairline'
      }`}
    >
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 rounded-t-xl px-3 py-2.5 border-b ${
          expanded
            ? isMine
              ? 'sticky top-[44px] z-10 border-indigo-500/40 bg-surface-1 bg-gradient-to-r from-indigo-500/22 via-indigo-500/8 to-transparent backdrop-blur-xl'
              : 'sticky top-[44px] z-10 border-hairline bg-surface-1 bg-gradient-to-r from-accent/18 via-accent/6 to-transparent backdrop-blur-xl'
            : 'border-hairline bg-glass-2'
        }`}
      >
        <span className="w-5 text-center text-[11px] font-bold text-ink-5">{rank}</span>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[13.5px] font-extrabold tracking-tight text-ink-1 truncate">{team.name}</span>
            {isMine && (
              <span className="shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
                Tu
              </span>
            )}
          </div>
          {notFielded ? (
            <span className="text-[10px] font-semibold text-rose-500 dark:text-rose-400 truncate block">
              Formazione non schierata
            </span>
          ) : (
            team.manager_name && (
              <span className="text-[10px] text-ink-5 truncate block">{team.manager_name}</span>
            )
          )}
        </div>
        <LiveDots field={liveCounts.field} bench={liveCounts.bench} />
        <span className={`shrink-0 text-[10px] tabular-nums ${(standings?.goals_scored ?? 0) > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-ink-5'}`}>
          ⚽ {standings?.goals_scored ?? 0}
        </span>
        <span className={`shrink-0 text-[11px] font-bold tabular-nums ${(standings?.giornata_points ?? 0) > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-ink-4'}`}>
          {standings?.giornata_points ?? 0} pt
        </span>
        <span className="w-12 shrink-0 text-right text-[15px] font-black tabular-nums text-ink-1">
          {fmt(team.live_total, 1)}
        </span>
        <span className="shrink-0 text-[10px] text-ink-4">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {notFielded ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-3 text-center">
              <p className="text-[12px] font-semibold text-rose-500 dark:text-rose-300">
                Formazione non schierata
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-4">
                Nessuna formazione inviata prima del lock — 0 punti in questa giornata.
              </p>
            </div>
          ) : previewMode && !isMine ? (
            <MaskedPlayerRows count={team.players.filter((p) => p.counts).length} />
          ) : (
            <>
              <div className="flex justify-center">
                <TeamViewToggle view={view} onChange={setView} />
              </div>
              {view === 'list' ? (
                <div className="space-y-2"><TeamListBody team={team} liveField={liveField} ownership={ownership} /></div>
              ) : (
                <FantasyPitch team={team} liveField={liveField} ownership={ownership} />
              )}
              <LineupLegend />
            </>
          )}
        </div>
      )}
    </div>
  )
}
