'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import type {
  LiveRoundSnapshot,
  LiveSnapshotTeam,
  LiveSnapshotPlayer,
  LiveSnapshotMatch,
  LiveSnapshotRealPlayer,
  LiveSnapshotGoalEvent,
  LiveOwnerRef,
  LiveOwnershipEntry,
  LiveTeamRef,
} from '@/domain/fantamondiale/engine/liveSnapshot'

const POLL_MS = 35_000
const RATING_FLASH_MS = 15_000

// ─────────────────────────────────────────────
// Rating-change flash — when a player's fetched voto moves between snapshots,
// his box gets a subtle 15s green/red tint that fades away. The board tracks
// the previous value per player and publishes the active flashes via context,
// so any player box can opt in by player_id.
// ─────────────────────────────────────────────

type FlashDir = 'up' | 'down'
const RatingFlashContext = createContext<Map<string, FlashDir>>(new Map())

function useRatingFlash(snapshot: LiveRoundSnapshot | null): Map<string, FlashDir> {
  const prev = useRef<Map<string, number>>(new Map())
  const seeded = useRef(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [flashes, setFlashes] = useState<Map<string, FlashDir>>(new Map())

  useEffect(() => {
    if (!snapshot) return
    const current = new Map<string, number>()
    for (const t of snapshot.teams) {
      for (const p of t.players) {
        const v = p.display_voto_base ?? p.voto_base ?? p.rating
        if (v != null) current.set(p.player_id, Number(v))
      }
    }
    for (const m of snapshot.matches) {
      for (const p of m.players) {
        if (current.has(p.player_id)) continue
        const v = p.display_voto_base ?? p.voto_base ?? p.voto
        if (v != null) current.set(p.player_id, Number(v))
      }
    }

    // First snapshot only seeds the baseline — never flash on initial mount.
    if (!seeded.current) {
      prev.current = current
      seeded.current = true
      return
    }

    const changed: Array<[string, FlashDir]> = []
    for (const [id, v] of current) {
      const old = prev.current.get(id)
      if (old != null && Math.abs(v - old) > 0.001) changed.push([id, v > old ? 'up' : 'down'])
      prev.current.set(id, v)
    }
    if (!changed.length) return

    setFlashes((cur) => {
      const next = new Map(cur)
      for (const [id, dir] of changed) next.set(id, dir)
      return next
    })
    for (const [id, dir] of changed) {
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)
      void dir
      const handle = setTimeout(() => {
        setFlashes((cur) => {
          const next = new Map(cur)
          next.delete(id)
          return next
        })
        timers.current.delete(id)
      }, RATING_FLASH_MS)
      timers.current.set(id, handle)
    }
  }, [snapshot])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const h of map.values()) clearTimeout(h)
    }
  }, [])

  return flashes
}

function fmtGoalMinute(event: Pick<LiveSnapshotGoalEvent, 'minute' | 'extra_minute'>): string {
  if (event.minute == null) return ''
  return event.extra_minute ? `${event.minute}+${event.extra_minute}'` : `${event.minute}'`
}

function useFlash(playerId: string): FlashDir | undefined {
  return useContext(RatingFlashContext).get(playerId)
}

function flashTintClass(dir: FlashDir | undefined, onInk = false): string {
  if (!dir) return ''
  if (onInk) return dir === 'up' ? 'rating-flash-up-on-ink' : 'rating-flash-down-on-ink'
  return dir === 'up' ? 'rating-flash-up' : 'rating-flash-down'
}

const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const

// Solid role colors — drive the corner role "nail" tag on every player box.
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

const FALLBACK_CARD_MALUS = {
  yellow: 0.5,
  red: 1,
}

/** Stable role ordering (P→D→C→A), so a recently-edited lineup still reads in
 * role order rather than in raw snapshot array order. */
function sortByRole<T extends { role: string }>(players: T[]): T[] {
  return [...players].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role as never) - ROLE_ORDER.indexOf(b.role as never),
  )
}

function sortBenchByPriority<T extends { bench_order?: number | null; name: string }>(players: T[]): T[] {
  return [...players].sort((a, b) => (a.bench_order ?? 999) - (b.bench_order ?? 999) || a.name.localeCompare(b.name))
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return '—'
  return Number(n).toFixed(d)
}

function popularityPenaltyState(p: LiveSnapshotPlayer): {
  nowPct: number
  maxPct: number
  activePct: number
  hasActivePenalty: boolean
  hasPotentialPenalty: boolean
  label: string
} {
  const nowPct = Math.round(p.popularity_penalty_pct_now ?? 0)
  const maxPct = Math.round(p.popularity_penalty_pct_potential ?? 0)
  const hasActivePenalty = p.popularity_penalty_now > 0.005 || nowPct > 0
  const hasPotentialPenalty = maxPct > 0 || p.popularity_penalty_potential > 0.005
  const activePct = nowPct || (hasActivePenalty ? maxPct : 0)
  const label = hasActivePenalty
    ? `−${activePct}%${maxPct > nowPct ? ` → −${maxPct}%` : ''}`
    : `0${maxPct > 0 ? `-${maxPct}%` : '%'}`

  return { nowPct, maxPct, activePct, hasActivePenalty, hasPotentialPenalty, label }
}

function immunityRemovedMalus(p: LiveSnapshotPlayer): number {
  if (!p.immunita_active) return 0
  if (p.immunity_removed_malus > 0.005) return p.immunity_removed_malus

  return p.yellow_cards * FALLBACK_CARD_MALUS.yellow + p.red_cards * FALLBACK_CARD_MALUS.red
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
  const flashes = useRatingFlash(snapshot)

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
    <RatingFlashContext.Provider value={flashes}>
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
    </RatingFlashContext.Provider>
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
            } ${m.status === 'in_progress' ? 'ring-1 ring-inset ring-lime-400/80' : ''}`}
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
          } ${m.status === 'in_progress' ? 'ring-1 ring-inset ring-lime-400/80' : ''}`}
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

        <span
          className={`text-[14px] font-black tabular-nums ${
            m.status === 'in_progress' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-1'
          }`}
        >
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
      minute == null ? 'HT' : minuteAdded ? `${minute}+${minuteAdded}'` : `${minute}'`
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/14 px-2 py-0.5 text-[10px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-300" />
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

  const [view, setView] = useState<TeamLineupView>('pitch')
  // Marcatori line: one entry per goal, tagged with the nation that scored (own
  // goals tagged with the BENEFITING nation) and the assist-man at low opacity.
  // The snapshot carries goal/assist COUNTS but no goal↔assist linkage, so the
  // assist is paired best-effort (per-team, in order) rather than authoritatively.
  const codeOf = (teamId: string) =>
    teamId === m.home_team_id ? m.home_team.fifa_code : m.away_team.fifa_code
  const assistPool = new Map<string, string[]>()
  for (const a of m.players) {
    if (a.assists > 0) {
      const arr = assistPool.get(a.national_team_id) ?? []
      for (let i = 0; i < a.assists; i++) arr.push(a.name)
      assistPool.set(a.national_team_id, arr)
    }
  }
  type GoalEntry = { key: string; minute: number | null; extra_minute: number | null; scorer: string; code: string; assist: string | null; own: boolean }
  const fallbackGoalEntries: GoalEntry[] = []
  for (const s of m.players) {
    for (let i = 0; i < s.goals; i++) {
      const pool = assistPool.get(s.national_team_id) ?? []
      fallbackGoalEntries.push({ key: `g-${s.player_id}-${i}`, minute: null, extra_minute: null, scorer: s.name, code: codeOf(s.national_team_id), assist: pool.shift() ?? null, own: false })
    }
  }
  for (const o of m.players) {
    for (let i = 0; i < o.own_goals; i++) {
      const benefitsTeamId = o.national_team_id === m.home_team_id ? m.away_team_id : m.home_team_id
      fallbackGoalEntries.push({ key: `og-${o.player_id}-${i}`, minute: null, extra_minute: null, scorer: o.name, code: codeOf(benefitsTeamId), assist: null, own: true })
    }
  }
  const goalEntries: GoalEntry[] = m.goal_events?.length ? m.goal_events : fallbackGoalEntries
  const hasGoalEvents = goalEntries.length > 0

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

        {hasGoalEvents && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] leading-tight text-ink-3">
            {goalEntries.map((e) => (
              <span key={e.key} className={`inline-flex items-center gap-1 ${e.own ? 'text-rose-500 dark:text-rose-300' : ''}`}>
                <span aria-hidden>{e.own ? '🥅' : '⚽'}</span>
                {e.minute != null && (
                  <span className="rounded bg-ink-5/12 px-1 text-[8px] font-black tabular-nums text-ink-4">
                    {fmtGoalMinute(e)}
                  </span>
                )}
                {shortPlayerName(e.scorer)}
                <span className="rounded bg-ink-5/12 px-1 text-[8px] font-bold tracking-wide text-ink-4">
                  {e.own ? `A.G. ${e.code}` : e.code}
                </span>
                {e.assist && (
                  <span className="inline-flex items-center gap-0.5 opacity-50" title={`Assist: ${e.assist}`}>
                    <span aria-hidden>👟</span>
                    {shortPlayerName(e.assist)}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* real-match lineups — Campo (pitch) by default, Lista as a fallback */}
      {m.players.length > 0 ? (
        <div className="p-2 space-y-2 sm:p-3">
          <div className="flex justify-center">
            <TeamViewToggle view={view} onChange={setView} />
          </div>
          {view === 'pitch' ? (
            <RealMatchPitch m={m} totalTeams={totalTeams} />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-4">
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
          )}
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
    <div className="grid h-full min-w-0 grid-rows-[1fr_auto] gap-1.5">
      <div className="min-w-0 space-y-1">
        {xi.map(({ p, depth }) => (
          <RealPlayerRow key={p.player_id} p={p} matchStatus={matchStatus} totalTeams={totalTeams} depth={depth} />
        ))}
        {Array.from({ length: Math.max(0, minMainRows - xi.length) }).map((_, i) => (
          <RealPlayerPlaceholder key={`main-placeholder-${i}`} />
        ))}
      </div>

      <div className="min-w-0 space-y-1 pt-1">
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

// ─────────────────────────────────────────────
// Real-match Campo (pitch) — both nations on ONE mirrored vertical pitch.
// Home defends the top (GK at the very top, attack toward halfway); away mirrors
// it from below. The starting XI lives on the grass; substitutes who came on sit
// in a "Subentrati" strip on each team's bench side. Every card carries the same
// data as the list row (split voto, bonus/malus, MVP, ownership), in fixed-size
// chips so the field reads cleanly even on a phone.
// ─────────────────────────────────────────────

function realOnPitch(p: LiveSnapshotRealPlayer, matchStatus: LiveSnapshotMatch['status']): boolean {
  if (matchStatus !== 'in_progress') return false
  return (
    (p.is_starter && p.subbed_off_minute == null) ||
    (p.subbed_on_minute != null && p.subbed_off_minute == null)
  )
}

function RealMatchPitch({ m, totalTeams }: { m: LiveSnapshotMatch; totalTeams: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id))
  const selected = m.players.find((p) => p.player_id === selectedId) ?? null
  const selectedTeamRef = selected
    ? selected.national_team_id === m.home_team_id ? m.home_team : m.away_team
    : null
  const sideOf = (teamId: string) => m.players.filter((p) => p.national_team_id === teamId)
  const homeAll = sideOf(m.home_team_id)
  const awayAll = sideOf(m.away_team_id)
  const xi = (players: LiveSnapshotRealPlayer[]) => players.filter((p) => p.is_starter)
  // Subentrati = came on as a sub (or otherwise logged minutes without starting).
  const subs = (players: LiveSnapshotRealPlayer[]) =>
    players.filter((p) => !p.is_starter && (p.subbed_on_minute != null || (p.minutes_played ?? 0) > 0))
  const bench = (players: LiveSnapshotRealPlayer[]) =>
    players.filter((p) => !p.is_starter && p.subbed_on_minute == null && (p.minutes_played ?? 0) === 0)

  // GK at each team's own end; rows go P→D→C→A for the home half and mirror
  // (A→C→D→P) for the away half so the two attacks meet at the halfway line.
  const homeRows = (['P', 'D', 'C', 'A'] as const)
    .map((r) => sortByName(xi(homeAll).filter((p) => p.role === r)))
    .filter((row) => row.length > 0)
  const awayRows = (['A', 'C', 'D', 'P'] as const)
    .map((r) => sortByName(xi(awayAll).filter((p) => p.role === r)))
    .filter((row) => row.length > 0)
  const homeSubs = subs(homeAll)
  const awaySubs = subs(awayAll)
  const homeBench = bench(homeAll)
  const awayBench = bench(awayAll)

  // One CSS-grid row per role line: N equal columns that shrink to fit the pitch
  // width and never wrap, so the module reads correctly on mobile.
  const renderRow = (row: LiveSnapshotRealPlayer[], teamRef: LiveTeamRef, key: string) => (
    <div
      key={key}
      className="relative z-[1] mx-auto grid w-full items-stretch gap-1.5"
      style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0,1fr))`, maxWidth: row.length * 92 }}
    >
      {row.map((p) => (
        <RealPitchChip key={p.player_id} p={p} teamRef={teamRef} matchStatus={m.status} totalTeams={totalTeams} selected={p.player_id === selectedId} onSelect={() => toggle(p.player_id)} />
      ))}
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="rounded-2xl">
        <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-black/10 px-1.5 py-4 shadow-1 dark:border-white/10">
          {/* field base — soft turf in light mode, charcoal in dark mode */}
          <div className="pointer-events-none absolute inset-0 dark:hidden" style={{ background: 'linear-gradient(180deg, #e7f8e1, #d3efc8 50%, #e7f8e1)' }} />
          <div className="pointer-events-none absolute inset-0 hidden dark:block" style={{ background: 'linear-gradient(180deg, #20232b, #2a2e38 50%, #20232b)' }} />
          {/* mowing stripes */}
          <div className="pointer-events-none absolute inset-0 dark:hidden" style={{ background: 'repeating-linear-gradient(180deg, transparent 0 38px, rgba(33,116,57,0.07) 38px 76px)' }} />
          <div className="pointer-events-none absolute inset-0 hidden opacity-45 dark:block" style={{ background: 'repeating-linear-gradient(180deg, transparent 0 38px, rgba(255,255,255,0.028) 38px 76px)' }} />
          {/* field lines */}
          <div className="pointer-events-none absolute left-4 right-4 top-1/2 h-px bg-black/8 dark:bg-white/10" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/8 dark:border-white/10" />

          {homeRows.map((row, i) => renderRow(row, m.home_team, `home-${i}`))}
          <div className="h-2" />
          {awayRows.map((row, i) => renderRow(row, m.away_team, `away-${i}`))}
        </div>
      </div>

      {selected && selectedTeamRef && (
        <RealPlayerSheet p={selected} teamRef={selectedTeamRef} matchStatus={m.status} totalTeams={totalTeams} onClose={() => setSelectedId(null)} />
      )}

      {(homeSubs.length > 0 || awaySubs.length > 0) && (
        <div className="space-y-1.5">
          <p className="px-1 text-[9px] font-bold uppercase tracking-wider text-ink-5">Subentrati</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <RealSubColumn teamRef={m.home_team} subs={homeSubs} matchStatus={m.status} totalTeams={totalTeams} selectedId={selectedId} onSelect={toggle} />
            <RealSubColumn teamRef={m.away_team} subs={awaySubs} matchStatus={m.status} totalTeams={totalTeams} selectedId={selectedId} onSelect={toggle} />
          </div>
        </div>
      )}

      {(homeBench.length > 0 || awayBench.length > 0) && (
        <div className="space-y-1.5">
          <p className="px-1 text-[9px] font-bold uppercase tracking-wider text-ink-5">Panchine</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <RealSubColumn teamRef={m.home_team} subs={homeBench} matchStatus={m.status} totalTeams={totalTeams} selectedId={selectedId} onSelect={toggle} label="Panchina" />
            <RealSubColumn teamRef={m.away_team} subs={awayBench} matchStatus={m.status} totalTeams={totalTeams} selectedId={selectedId} onSelect={toggle} label="Panchina" />
          </div>
        </div>
      )}
    </div>
  )
}

function sortByName<T extends { name: string }>(players: T[]): T[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name))
}

// National-team crest for a real-match chip (all players on a side share it).
// Lime ring when the player is on the pitch right now.
function RealCrest({ teamRef, live, size }: { teamRef: LiveTeamRef; live: boolean; size: number }) {
  const src = teamRef.flag_url || teamRef.logo_url
  const width = Math.round(size * 1.38)
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[5px] border border-white/35 bg-surface-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-surface-2 ${
        live ? 'ring-2 ring-lime-400' : ''
      }`}
      style={{ width, height: size }}
    >
      {src ? (
        <Image src={src} alt={teamRef.name} fill sizes={`${width}px`} className="h-full w-full object-cover" unoptimized />
      ) : (
        <span className="font-mono text-ink-4" style={{ fontSize: Math.round(size * 0.4) }}>
          {(teamRef.fifa_code ?? '').toUpperCase()}
        </span>
      )}
    </span>
  )
}

// Ownership pill for a real-match chip: how many of the lega's teams roster this
// player, split titolare (T) vs panchina (P). Magenta when exclusive (a single
// owner), indigo otherwise. Tapping is out of scope here — the count is the chip
// layer; named owners live in the Lista view's rows.
function RealOwnershipPill({ p, totalTeams }: { p: LiveSnapshotRealPlayer; totalTeams: number }) {
  if (p.owners.length === 0) return null
  const tit = p.owners.filter((o) => o.status === 'titolare').length
  const pan = p.owners.length - tit
  const exclusive = p.owners.length === 1
  const benchOnlyExclusive = exclusive && tit === 0
  const title =
    `${p.owners.length} su ${totalTeams} squadre · ${tit} titolare${tit === 1 ? '' : ''} · ${pan} panchina — ` +
    p.owners.map((o) => `${o.team_name} (${o.status})`).join(', ')
  if (benchOnlyExclusive) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-ink-5/14 px-2 py-0.5 text-[9px] font-bold tabular-nums text-ink-4"
      >
        {p.owners.length}/{totalTeams}
        <span>0T·{pan}P</span>
      </span>
    )
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold tabular-nums text-white ${
        exclusive ? 'bg-[#FF0090]' : 'bg-indigo-600'
      }`}
    >
      {exclusive && <DiamondGlyph className="text-white" />}
      {p.owners.length}/{totalTeams}
      <span className="opacity-80">{tit}T·{pan}P</span>
    </span>
  )
}

// Split voto pill shared by the real-match chip & sub chip. Always dark — base
// on a deep slate, total on its colour band — so the voto reads consistently on
// both the charcoal pitch and the glass surface below it.
function RealVotoPill({ p, matchStatus, width }: { p: LiveSnapshotRealPlayer; matchStatus: LiveSnapshotMatch['status']; width: number }) {
  const storedBase =
    p.display_voto_base ?? p.voto_base ?? (p.play_state === 'played' && p.voto != null ? p.voto : null)
  const v = votoDisplay(storedBase, p.display_voto_total ?? p.voto, p.minutes_played, p.play_state, matchStatus)
  return (
    <span
      className="block overflow-hidden rounded-md border border-white/15 bg-[#111827] text-center tabular-nums shadow-sm"
      style={{ width }}
    >
      {v.kind === 'score' ? (
        <>
          <span className="block border-b border-white/15 bg-[#1b2236] px-1 text-[10px] font-bold leading-[1.55] text-white">{v.base}</span>
          <span className={`block px-1 text-[12px] font-black leading-[1.45] ${v.totalOnBgCls}`} style={{ background: v.totalBg }}>{v.total}</span>
        </>
      ) : (
        <span className={`block px-1 py-1.5 text-[12px] font-bold leading-none ${v.text === 'S.V.' ? v.cls : 'text-ink-5 dark:text-white/70'}`}>{v.text}</span>
      )}
    </span>
  )
}

function RealPitchChip({ p, teamRef, matchStatus, totalTeams, selected, onSelect }: { p: LiveSnapshotRealPlayer; teamRef: LiveTeamRef; matchStatus: LiveSnapshotMatch['status']; totalTeams: number; selected: boolean; onSelect: () => void }) {
  const ownedTitolare = p.owners.some((o) => o.status === 'titolare')
  const ownedPanchina = !ownedTitolare && p.owners.length > 0
  const owned = p.owners.length > 0
  const exclusiveStarter = p.owners.length === 1 && p.owners[0]?.status === 'titolare'
  const exclusiveMvp = exclusiveStarter && p.is_mvp
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash, owned && !exclusiveMvp)

  // Picked players are tinted with their ownership colour (magenta for esclusiva,
  // indigo for shared) — strong for a titolare, faint for bench-only — while
  // not-picked players stay a neutral faint card. Tints are theme-aware (deeper
  // in dark mode, softer in light) so the tiers separate on either field.
  const exclusiveOwn = p.owners.length === 1
  // Literal class strings (Tailwind JIT can't see interpolated ones).
  const tierClass = ownedTitolare
    ? exclusiveOwn
      ? 'bg-[#090b12] border-[#FF0090]/80 dark:border-[#FF0090]/90'
      : 'bg-[#090b12] border-indigo-400/80 dark:border-indigo-400/90'
    : ownedPanchina
      ? exclusiveOwn
        ? 'bg-[#FF0090]/12 dark:bg-[#FF0090]/22 border-[#FF0090]/45 dark:border-[#FF0090]/60'
        : 'bg-indigo-500/12 dark:bg-indigo-500/22 border-indigo-400/45 dark:border-indigo-400/60'
      : 'bg-black/[0.035] dark:bg-white/[0.035] border-black/10 dark:border-white/10'
  // MVP frame: bright gold ring + glow around the whole card. The badge
  // lives in a corner medallion (below) so it never crowds the role nail.
  const boxShadow = exclusiveMvp
    ? '0 0 0 2px #FFC83D, 0 0 0 5px rgba(255,0,144,0.42), 0 0 34px 8px rgba(255,0,144,0.82)'
    : p.is_mvp
      ? '0 0 0 2px #FFC83D, 0 0 0 5px rgba(255,200,61,0.34), 0 0 30px 7px rgba(255,200,61,0.78)'
      : undefined

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex min-h-[96px] w-full min-w-0 flex-col items-center gap-0.5 overflow-hidden rounded-[12px] border px-1 pb-1.5 pt-2.5 text-center transition-transform active:scale-[0.97] ${tierClass} ${selected ? 'outline outline-2 -outline-offset-1 outline-accent' : ''} ${flashClass}`}
      style={boxShadow ? { boxShadow } : undefined}
    >
      <RoleNail role={p.role} onDark={ownedTitolare} />

      <RealCrest teamRef={teamRef} live={realOnPitch(p, matchStatus)} size={26} />

      <span className={`block w-full truncate text-[13px] font-bold leading-tight ${ownedTitolare ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]' : 'text-ink-1 dark:text-white dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.85)]'}`} title={p.name}>
        {shortPlayerName(p.name)}
      </span>

      <span className="flex min-h-[18px] items-center justify-center">
        {p.is_mvp && (
          <span
            aria-label="MVP"
            title={exclusiveMvp ? 'Esclusiva + MVP — solo questa squadra lo schiera, ed è il migliore in campo' : 'Migliore in campo — MVP'}
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-black leading-none tracking-wide text-[#4a3100] ${exclusiveMvp ? 'animate-pulse' : ''}`}
            style={{
              background: exclusiveMvp ? 'linear-gradient(90deg,#FFE9A8,#FF0090)' : 'linear-gradient(90deg,#FFF4BF,#E2A100)',
              boxShadow: '0 2px 7px rgba(0,0,0,0.42), 0 0 12px rgba(255,200,61,0.85), inset 0 0 0 1px rgba(255,255,255,0.75)',
            }}
          >
            <MvpGlyph className="h-3 w-3" />
            MVP
          </span>
        )}
      </span>

      <span className="min-h-[15px] rounded-md px-1 py-0.5 text-[10px] font-black leading-none text-rose-600 dark:text-rose-300" title={p.subbed_off_minute != null ? 'Sostituito' : undefined}>
        {p.subbed_off_minute != null ? `↓${p.subbed_off_minute}'` : ''}
      </span>

      <span className="flex min-h-[12px] flex-wrap items-center justify-center gap-0.5">
        <BonusMalusIcons p={p} />
      </span>

      <RealVotoPill p={p} matchStatus={matchStatus} width={40} />

      <span className="flex min-h-[12px] items-center justify-center">
        <RealOwnershipPill p={p} totalTeams={totalTeams} />
      </span>
    </button>
  )
}

// One team's substitutes, listed below the pitch (off the grass, on the normal
// glass surface) so the "↑min per <player>" linkage is actually readable.
function RealSubColumn({ teamRef, subs, matchStatus, totalTeams, selectedId, onSelect, label }: { teamRef: LiveTeamRef; subs: LiveSnapshotRealPlayer[]; matchStatus: LiveSnapshotMatch['status']; totalTeams: number; selectedId: string | null; onSelect: (id: string) => void; label?: string }) {
  if (subs.length === 0) return null
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1 px-0.5 text-[8.5px] font-bold uppercase tracking-wider text-ink-4">
        <RealCrest teamRef={teamRef} live={false} size={12} />
        <span className="truncate">{teamRef.name}</span>
        {label && <span className="text-ink-5">· {label}</span>}
      </p>
      {subs.map((p) => (
        <RealSubChip key={p.player_id} p={p} teamRef={teamRef} matchStatus={matchStatus} totalTeams={totalTeams} selected={p.player_id === selectedId} onSelect={() => onSelect(p.player_id)} />
      ))}
    </div>
  )
}

// A single substitute row (below the pitch): crest, name, the "↑min per X"
// linkage, bonus/malus + ownership, and the split voto. Themed for the glass
// surface, with the owned dark-fill treatment shared with the rest of the board.
function RealSubChip({ p, teamRef, matchStatus, totalTeams, selected, onSelect }: { p: LiveSnapshotRealPlayer; teamRef: LiveTeamRef; matchStatus: LiveSnapshotMatch['status']; totalTeams: number; selected: boolean; onSelect: () => void }) {
  const ownedTitolare = p.owners.some((o) => o.status === 'titolare')
  const owned = p.owners.length > 0
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash, ownedTitolare)
  const cardClass = ownedTitolare
    ? p.is_mvp
      ? 'border-amber-300 bg-[#090b12] shadow-[0_0_24px_-2px_rgba(255,200,61,0.82)]'
      : 'border-indigo-400/80 bg-[#090b12] shadow-sm shadow-indigo-500/20'
    : owned
      ? 'border-ink-1/25 bg-ink-1/[0.06]'
      : 'border-hairline bg-glass-2'
  return (
    <button type="button" onClick={onSelect} className={`relative flex w-full items-center gap-1.5 overflow-hidden rounded-[10px] border pl-5 pr-1.5 py-1 text-left shadow-sm transition-transform active:scale-[0.98] ${selected ? 'ring-2 ring-accent' : ''} ${cardClass} ${flashClass}`}>
      <RoleNail role={p.role} onDark={ownedTitolare} />
      <RealCrest teamRef={teamRef} live={realOnPitch(p, matchStatus)} size={18} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1">
          <span className={`truncate text-[12.5px] font-bold ${ownedTitolare ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]' : 'text-ink-1'}`} title={p.name}>{shortPlayerName(p.name)}</span>
          {p.is_mvp && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[8.5px] font-black leading-none text-amber-700 ring-1 ring-amber-400/45 shadow-[0_0_10px_rgba(255,200,61,0.35)] dark:text-amber-200" title="Migliore in campo — MVP">
              <MvpGlyph className="h-3 w-3" />
              MVP
            </span>
          )}
        </span>
        {p.subbed_on_minute != null && (
          <span className="truncate text-[10px] font-black text-emerald-700 dark:text-emerald-300" title={p.replaced_player_name ? `Entrato per ${p.replaced_player_name}` : 'Entrato'}>
            ↑{p.subbed_on_minute}&apos;{p.replaced_player_name ? ` per ${shortPlayerName(p.replaced_player_name)}` : ''}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-0.5">
          <BonusMalusIcons p={p} inverted={ownedTitolare} />
          <RealOwnershipPill p={p} totalTeams={totalTeams} />
        </span>
      </span>
      <RealVotoPill p={p} matchStatus={matchStatus} width={34} />
    </button>
  )
}

// Tap-to-reveal detail for a real-match player: the answer to "who owns him?".
// Lists the exact fantasy teams holding the player, split titolare vs panchina,
// plus his bonus/malus. Esclusiva (a single owner) is called out in neon magenta.
function RealPlayerSheet({ p, teamRef, matchStatus, totalTeams, onClose }: { p: LiveSnapshotRealPlayer; teamRef: LiveTeamRef; matchStatus: LiveSnapshotMatch['status']; totalTeams: number; onClose: () => void }) {
  const storedBase = p.display_voto_base ?? p.voto_base ?? (p.play_state === 'played' && p.voto != null ? p.voto : null)
  const displayedTotalRaw = p.display_voto_total ?? p.voto
  const v = votoDisplay(storedBase, displayedTotalRaw, p.minutes_played, p.play_state, matchStatus)
  const tit = p.owners.filter((o) => o.status === 'titolare')
  const pan = p.owners.filter((o) => o.status === 'panchina')
  const exclusive = p.owners.length === 1
  const fallbackPenaltyPct = realMatchFallbackPenaltyPct(tit.length, totalTeams)
  const penaltyPct =
    (p.popularity_penalty_pct_now ?? 0) > 0
      ? p.popularity_penalty_pct_now ?? 0
      : fallbackPenaltyPct
  const penaltyAmount =
    (p.popularity_penalty_now ?? 0) > 0.005
      ? p.popularity_penalty_now ?? 0
      : displayedTotalRaw != null
        ? (Math.abs(displayedTotalRaw) * penaltyPct) / 100
        : 0
  const calculatedFinal =
    v.kind === 'score' && displayedTotalRaw != null
      ? displayedTotalRaw + (p.mvp_bonus ?? 0) - penaltyAmount
      : null
  const displayedFinal = calculatedFinal ?? p.final_score_now
  const hasFinalOverlay = displayedFinal != null && v.kind === 'score'
  return (
    <div className="rounded-2xl border border-hairline bg-glass-1 p-3.5 shadow-1">
      <div className="flex items-center gap-2.5">
        <RealCrest teamRef={teamRef} live={realOnPitch(p, matchStatus)} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink-1">{p.name}</div>
          <div className="text-[12px] text-ink-4">
            {ROLE_NAME[p.role] ?? p.role} · {teamRef.name}
            {realOnPitch(p, matchStatus) && <span className="text-lime-500 dark:text-lime-400"> · in campo</span>}
          </div>
        </div>
        {v.kind === 'score' ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[18px] font-black text-ink-1 tabular-nums">{v.base}</span>
            <span className="text-ink-5">→</span>
            <span className={`text-[20px] font-black tabular-nums ${totalVotoColor(displayedFinal ?? Number(v.total))}`}>
              {displayedFinal != null ? fmt(displayedFinal, 1) : v.total}
            </span>
          </div>
        ) : (
          <span className={`text-[14px] font-bold ${v.cls}`}>{v.text}</span>
        )}
        <button onClick={onClose} className="ml-1 shrink-0 text-ink-5 hover:text-ink-2" aria-label="Chiudi">✕</button>
      </div>

      {hasFinalOverlay && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/35 bg-amber-400/8 px-3 py-2.5 shadow-[0_0_18px_rgba(255,200,61,0.12)]">
          <div className="min-w-0">
            <div className="text-[10.5px] font-black uppercase tracking-wider text-ink-3">Voto reale dopo penalità</div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-ink-3">
              Voto bonus/malus {v.total}
              {(penaltyAmount > 0.005 || (p.mvp_bonus ?? 0) > 0.005) && <span> · </span>}
              {penaltyAmount > 0.005 && <>P.P. {Math.round(penaltyPct)}% −{fmt(penaltyAmount, 1)}</>}
              {penaltyAmount > 0.005 && (p.mvp_bonus ?? 0) > 0.005 && <span> · </span>}
              {(p.mvp_bonus ?? 0) > 0.005 && <>MVP +{fmt(p.mvp_bonus ?? 0, 1)}</>}
              {penaltyAmount <= 0.005 && (p.mvp_bonus ?? 0) <= 0.005 && 'Nessun correttivo ownership attivo'}
            </div>
          </div>
          <span className={`shrink-0 rounded-lg bg-surface-0 px-2.5 py-1 text-[26px] font-black tabular-nums shadow-sm ${totalVotoColor(displayedFinal ?? 0)}`}>
            {fmt(displayedFinal, 1)}
          </span>
        </div>
      )}

      <div className="mt-3 border-t border-hairline pt-2.5">
        {p.owners.length === 0 ? (
          <div className="text-[12px] text-ink-5">Nessuna squadra della lega lo schiera.</div>
        ) : exclusive ? (
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,0,144,0.10)' }}>
            <span style={{ color: '#FF0090' }}><DiamondGlyph className="h-4 w-4" /></span>
            <div className="min-w-0 text-[12.5px]">
              <span className="font-bold" style={{ color: '#FF0090' }}>Esclusiva di {p.owners[0]!.team_name}</span>
              <span className="text-ink-4"> · {p.owners[0]!.status === 'titolare' ? 'titolare' : 'in panchina'}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-5">
              In {p.owners.length} squadre su {totalTeams}
            </div>
            {tit.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-300">Titolare:</span>
                {tit.map((o) => (
                  <span key={o.fantasy_team_id} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11.5px] font-semibold text-indigo-700 dark:text-indigo-200">{o.team_name}</span>
                ))}
              </div>
            )}
            {pan.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-ink-4">Panchina:</span>
                {pan.map((o) => (
                  <span key={o.fantasy_team_id} className="rounded-md bg-ink-5/12 px-2 py-0.5 text-[11.5px] font-semibold text-ink-3">{o.team_name}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
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
  if (p.status === 'pending') return { kind: 'marker', text: '–', cls: 'text-ink-5' }
  // Didn't play (final) — make the ✕ a strong ink so it's clearly visible in the
  // pill rather than a near-invisible light grey.
  return { kind: 'marker', text: '✕', cls: 'text-ink-1' }
}

function totalVotoColor(voto: number): string {
  if (voto >= 10) return 'text-[#374DF5]'
  if (voto >= 9) return 'text-[#00ADC4]'
  if (voto >= 7) return 'text-[#00C424]'
  if (voto >= 6) return 'text-[#D9AF00]'
  if (voto >= 5) return 'text-[#ED7E07]'
  return 'text-[#DC0C00]'
}

// Same scale as totalVotoColor but as a solid background hex — used to fill the
// total-voto line of the pill for lega-owned ("spined") players.
function totalVotoBgColor(voto: number): string {
  if (voto >= 10) return '#374DF5'
  if (voto >= 9) return '#00ADC4'
  if (voto >= 7) return '#00C424'
  if (voto >= 6) return '#D9AF00'
  if (voto >= 5) return '#ED7E07'
  return '#DC0C00'
}

// Text color for the number sitting on the colored total-line: black on the
// light/mid bands for readability, white only on the two dark bands (blue ≥10,
// red <5) where black would be muddy.
function totalVotoOnBgTextClass(voto: number): string {
  return voto >= 10 || voto < 5 ? 'text-white' : 'text-black'
}

function realMatchFallbackPenaltyPct(fieldedOwners: number, totalTeams: number): number {
  const ownershipPct = totalTeams > 0 ? (fieldedOwners / totalTeams) * 100 : 0
  if (ownershipPct <= 10) return 0
  if (ownershipPct <= 25) return 30
  if (ownershipPct <= 45) return 40
  if (ownershipPct <= 65) return 50
  if (ownershipPct <= 80) return 60
  return 70
}

// Resolve the right-hand value: split base/total voto, or a no-play marker.
function votoDisplay(
  baseVoto: number | null,
  voto: number | null,
  minutes: number | null,
  playState: LiveSnapshotRealPlayer['play_state'],
  matchStatus: LiveSnapshotMatch['status'],
): { kind: 'score'; base: string; total: string; totalCls: string; totalBg: string; totalOnBgCls: string } | { kind: 'marker'; text: string; cls: string } {
  if (playState === 'played' && baseVoto != null && voto != null) {
    return { kind: 'score', base: fmt(baseVoto, 1), total: fmt(voto, 1), totalCls: totalVotoColor(voto), totalBg: totalVotoBgColor(voto), totalOnBgCls: totalVotoOnBgTextClass(voto) }
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
  // Lega-ownership highlight: any player owned by a lega team gets a tinted row
  // + a black/colored voto pill, so he's easy to spot among the 22 on the pitch.
  // Graded — stronger tint when at least one team fields him as a titolare,
  // faint when only on benches. Suppressed under the exclusive-MVP magenta
  // treatment, which already owns the box.
  const ownedTitolare = p.owners.some((o) => o.status === 'titolare')
  const ownedSpine = p.owners.length > 0 && !exclusiveMvp
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash, ownedTitolare && !exclusiveMvp)
  const darkVotoPill = ownedTitolare && !exclusiveMvp

  return (
    <div
      className={`relative flex min-h-[50px] items-center gap-1 overflow-hidden rounded-md border py-1 pl-4 pr-1.5 sm:gap-1.5 sm:pl-5 sm:pr-2 ${
        exclusiveMvp
          ? 'border-[#FF0090]/90 bg-[#090b12] shadow-[0_0_32px_-2px_rgba(255,0,144,0.88)]'
          : ownedTitolare
            ? p.is_mvp
              ? 'border-amber-300 bg-[#090b12] shadow-[0_0_30px_-2px_rgba(255,200,61,0.82)]'
              : 'border-indigo-400/80 bg-[#090b12] shadow-sm shadow-indigo-500/20'
            : ownedSpine
              ? 'border-ink-1/25 bg-ink-1/[0.06]'
              : 'border-hairline bg-glass-2'
      } ${depth > 0 ? 'ml-2 sm:ml-3' : ''} ${flashClass}`}
      style={exclusiveMvp ? { background: 'linear-gradient(100deg, #090b12 0%, #130912 55%, #22091a 100%)' } : undefined}
    >
      <RoleNail role={p.role} onDark={ownedTitolare} />
      {depth > 0 && <span className="self-center text-[10px] text-emerald-500 dark:text-emerald-400">↳</span>}

      <span className="min-w-0 flex-1">
        {/* Name gets its own line so it stays readable even in a narrow column;
            sub markers, bonus/malus glyphs and MVP all wrap onto the meta line
            below, never crowding (and truncating) the name. */}
        <span className={`block truncate text-[14.5px] font-semibold sm:text-[15px] ${ownedTitolare ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]' : 'text-ink-1'}`} title={p.name}>
          {shortPlayerName(p.name)}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {p.subbed_off_minute != null && (
            <span className="shrink-0 rounded-md bg-rose-500 px-2 py-0.5 text-[12px] font-black tabular-nums text-white shadow-sm" title="Sostituito">
              ↓{p.subbed_off_minute}&apos;
            </span>
          )}
          {p.subbed_on_minute != null && (
            <span className="shrink-0 rounded-md bg-emerald-500 px-2 py-0.5 text-[12px] font-black tabular-nums text-white shadow-sm" title="Entrato">
              ↑{p.subbed_on_minute}&apos;
            </span>
          )}
          {exclusiveMvp ? (
            <span
              title="Esclusiva + MVP — solo questa squadra lo schiera, ed è il migliore in campo"
              className="shrink-0 inline-flex animate-pulse items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase leading-none tracking-wide text-white shadow-sm"
              style={{ background: 'linear-gradient(90deg,#E2A100,#FF0090)', boxShadow: '0 0 18px rgba(255,0,144,0.7)' }}
            >
              <MvpGlyph className="h-3 w-3 text-white" />
              <DiamondGlyph className="text-white" />
              MVP
            </span>
          ) : (
            p.is_mvp && (
              <span
                title="Migliore in campo"
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-400/25 px-2 py-0.5 text-[10px] font-black text-amber-700 shadow-[0_0_16px_rgba(255,200,61,0.5)] dark:text-amber-200"
              >
                <MvpGlyph className="h-2.5 w-2.5" />
                MVP
              </span>
            )
          )}
          <BonusMalusIcons p={p} inverted={ownedTitolare && !exclusiveMvp} />
          <OwnerPills owners={p.owners} totalTeams={totalTeams} compact onInk={ownedTitolare && !exclusiveMvp} />
        </span>
      </span>

      <span
        className={`shrink-0 self-center w-9 overflow-hidden rounded-md border text-center tabular-nums shadow-sm sm:w-11 ${
          darkVotoPill
            ? 'border-white/15 bg-[#111827]'
            : 'border-hairline bg-surface-2'
        }`}
      >
        {v.kind === 'score' ? (
          p.owners.length > 0 ? (
            <>
              <span className="block border-b border-white/15 bg-[#1b2236] px-1 py-0.5 text-[12px] font-bold leading-none text-white">
                {v.base}
              </span>
              <span
                className={`block px-1 py-0.5 text-[12px] font-black leading-none ${v.totalOnBgCls}`}
                style={{ background: v.totalBg }}
              >
                {v.total}
              </span>
            </>
          ) : (
          <>
            <span className="block border-b border-hairline px-1 py-0.5 text-[12px] font-bold leading-none text-ink-2">
              {v.base}
            </span>
            <span className={`block px-1 py-0.5 text-[12px] font-black leading-none ${v.totalCls}`}>
              {v.total}
            </span>
          </>
          )
        ) : (
          <span
            className={`block px-1 py-1.5 leading-none ${
              v.text === '✕' && p.owners.length > 0
                ? `text-[14px] font-black ${
                    ownedTitolare && !exclusiveMvp
                      ? 'text-white [text-shadow:0.35px_0_0_currentColor,-0.35px_0_0_currentColor]'
                      : 'text-ink-1 [text-shadow:0.35px_0_0_currentColor,-0.35px_0_0_currentColor]'
                  }`
                : `text-[11px] font-bold ${v.cls}`
            }`}
          >
            {v.text}
          </span>
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

function BonusMalusIcons({ p, inverted = false }: { p: BonusMalusPlayer; inverted?: boolean }) {
  const items: { key: string; node: ReactNode }[] = []
  // On an inverted (solid-ink) owned row the default dark-on-faint chip vanishes,
  // so flip to a light-on-translucent variant that reads in both themes.
  const positiveIconClass = inverted ? 'bg-surface-0/20 text-surface-0' : 'bg-ink-5/10 text-ink-2'
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
      node: <span className="rounded bg-rose-400/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-300" title="Rigore sbagliato">Rig.✕</span>,
    })
  if (p.own_goals > 0)
    items.push({
      key: 'og',
      node: <span className="rounded bg-rose-500/25 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-300" title="Autogol">AG</span>,
    })
  if (p.red_cards > 0)
    items.push({
      key: 'r',
      node: (
        <span className="inline-flex items-center gap-0.5" title={p.immunita_active ? 'Rosso presente, malus annullato da immunità' : 'Rosso'}>
          <span className="inline-block h-3.5 w-2.5 rounded-sm bg-rose-500" />
          {p.immunita_active && <span className="text-[11px] leading-none text-indigo-500 dark:text-indigo-300">🛡</span>}
        </span>
      ),
    })
  if (p.yellow_cards > 0 && p.red_cards === 0)
    items.push({
      key: 'y',
      node: (
        <span className="inline-flex items-center gap-0.5" title={p.immunita_active ? 'Giallo presente, malus annullato da immunità' : 'Giallo'}>
          <span className="inline-block h-3.5 w-2.5 rounded-sm bg-amber-400" />
          {p.immunita_active && <span className="text-[11px] leading-none text-indigo-500 dark:text-indigo-300">🛡</span>}
        </span>
      ),
    })
  if (!items.length) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 self-center">
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
      className={`inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-[12px] font-bold leading-none ${className}`}
      title={title}
    >
      <span aria-hidden>{icon}</span>
      {count != null && count > 1 && <span className="text-[9px]">×{count}</span>}
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
        <span className="flex items-center gap-1"><span className="text-[#FF0090]"><DiamondGlyph /></span>esclusiva</span>
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
  // Role groups keep both the fielded players AND any non-playing titolare of
  // that role (he stays among the titolari, marked "Non ha giocato" by the row —
  // never demoted to the bench). Bench = true reserves only.
  const inXi = team.players.filter((p) => p.counts || (p.via === 'starter' && !p.counts))
  const bench = team.players.filter((p) => !p.counts && p.via === 'bench')
  return (
    <>
      {ROLE_ORDER.map((role) => {
        const rolePlayers = inXi.filter((p) => p.role === role)
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
          {ROLE_ORDER.map((role) => {
            const roleBench = sortBenchByPriority(bench.filter((p) => p.role === role))
            if (!roleBench.length) return null
            return (
              <div key={role} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5">
                <div
                  className="flex items-center justify-center rounded-md border border-white/20 text-[10px] font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  style={{ background: ROLE_DOT[role] }}
                >
                  {role}
                </div>
                <div className="min-w-0 space-y-1">
                {roleBench.map((p) => (
                  <FantasyPlayerRow key={p.player_id} p={p} entry={ownership[p.player_id]} muted liveState={liveField.get(p.player_id)} />
                ))}
                </div>
              </div>
            )
          })}
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
  // Bench = true reserves only. A non-playing titolare is NOT demoted here — he
  // stays "up" as a ghost slot on the pitch (or is replaced by a sub who's on).
  const bench = team.players.filter((p) => !p.counts && p.via === 'bench')
  // A titolare who didn't play and had no eligible same-role sub leaves a hole.
  // We render an explicit ghost slot in his role row so the gap is never silent.
  const playedShort = team.players.filter((p) => !p.counts && p.via === 'starter' && !p.replaced_by)
  const pendingReplacementByCandidate = new Map(
    playedShort
      .filter((p) => p.replacement_pending && p.replacement_candidate)
      .map((p) => [p.replacement_candidate!.player_id, p.name]),
  )
  // GK on top, attack at the bottom. Each role is its own grid row so N players
  // always lay out as N columns (a 4-man midfield never wraps to 3+1).
  type PitchSlot =
    | { kind: 'player'; p: LiveSnapshotPlayer }
    | { kind: 'ghost'; p: LiveSnapshotPlayer }
  const rows = (['P', 'D', 'C', 'A'] as const)
    .map((role): PitchSlot[] => [
      ...sortByRole(fielded.filter((p) => p.role === role)).map((p): PitchSlot => ({ kind: 'player', p })),
      ...playedShort.filter((p) => p.role === role).map((p): PitchSlot => ({ kind: 'ghost', p })),
    ])
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
            {row.map((slot) =>
              slot.kind === 'ghost' ? (
                <GhostPitchSlot key={slot.p.player_id} p={slot.p} />
              ) : (
                <FantasyPitchChip
                  key={slot.p.player_id}
                  p={slot.p}
                  entry={ownership[slot.p.player_id]}
                  liveState={liveField.get(slot.p.player_id)}
                  selected={slot.p.player_id === selectedId}
                  onSelect={() => toggle(slot.p.player_id)}
                />
              ),
            )}
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
        <div className="space-y-1.5">
          <p className="px-1 text-[9px] font-bold uppercase tracking-wider text-ink-5">Panchina</p>
          {ROLE_ORDER.map((role) => {
            const roleBench = sortBenchByPriority(bench.filter((p) => p.role === role))
            if (!roleBench.length) return null
            return (
              <div key={role} className="grid grid-cols-[18px_minmax(0,1fr)] items-stretch gap-1.5">
                <div
                  className="flex items-center justify-center rounded-md border border-white/20 text-[10px] font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                  style={{ background: ROLE_DOT[role] }}
                >
                  {role}
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {roleBench.map((p) => (
                    <BenchChip
                      key={p.player_id}
                      p={p}
                      pendingFor={pendingReplacementByCandidate.get(p.player_id)}
                      liveState={liveField.get(p.player_id)}
                      selected={p.player_id === selectedId}
                      onSelect={() => toggle(p.player_id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Round national-team crest. The role is now conveyed by the card outline, so
// the only overlay here is a lime ring when the player is on the pitch right now.
function PlayerCrest({ p, live, size }: { p: LiveSnapshotPlayer; live: boolean; size: number }) {
  const t = p.national_team
  const src = t?.flag_url || t?.logo_url
  const width = Math.round(size * 1.38)
  return (
    <div className="relative shrink-0" style={{ width, height: size }}>
      <span
        className={`relative grid place-items-center overflow-hidden rounded-[5px] border border-white/35 bg-surface-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:border-white/15 dark:bg-surface-2 ${
          live ? 'ring-2 ring-lime-400' : ''
        }`}
        style={{ width, height: size }}
      >
        {src ? (
          <Image
            src={src}
            alt={t?.name ?? ''}
            fill
            sizes={`${width}px`}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-glass-2 font-mono text-ink-4" style={{ fontSize: Math.round(size * 0.4) }}>
            {(t?.fifa_code ?? '').toUpperCase()}
          </span>
        )}
      </span>
    </div>
  )
}

// Small role glyph in the card's top-left corner. The colour carries the role,
// without the heavy clipped-corner tag.
function RoleNail({ role, onDark = false }: { role: string; onDark?: boolean }) {
  const c = ROLE_DOT[role] ?? '#94a3b8'
  return (
    <span
      aria-hidden
      title={ROLE_NAME[role] ?? role}
      className={`absolute left-1 top-1 z-[1] flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black leading-none shadow-sm ring-1 ${
        onDark
          ? 'bg-[#171a22] ring-white/10'
          : 'bg-surface-0/85 ring-black/5 dark:bg-surface-3/85 dark:ring-white/10'
      }`}
      style={{
        color: c,
      }}
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
      style={{ background: 'linear-gradient(90deg,#f59e0b,#FF0090)' }}
    >
      <span aria-hidden>👑</span>
      <DiamondGlyph className="text-white" />
      <span aria-hidden>✨</span>
    </span>
  )
}

// Popularity readout for a SHARED player: the % of the lega that fields him
// (now → potential) and, once it materialises, the P.P. voto deduction.
// The percentage is known up-front (it's just ownership), so pending bench risk
// shows as a muted 0-max range until another team actually fields him.
// Shows the Penalità di Popolarità as a PERCENTAGE — the malus a shared player
// will take on his score (e.g. 20% ownership → −30%). The % is bracket-derived,
// so it's known up-front, before he's even played. Ownership %, the now→max ramp
// and the live malus amount all live in the tooltip and the detail sheet.
function PopularityChip({ p, entry }: { p: LiveSnapshotPlayer; entry: LiveOwnershipEntry | undefined }) {
  const penalty = popularityPenaltyState(p)
  if (!penalty.hasPotentialPenalty) return null // ≤10% ownership → no penalty bracket
  const pctOwnNow = entry ? Math.round(entry.pct_now) : null
  const pctOwnMax = entry ? Math.round(entry.pct_potential) : null
  const title =
    (penalty.hasActivePenalty ? `Penalità di Popolarità ${penalty.label}` : `Rischio Penalità di Popolarità ${penalty.label}`) +
    (!penalty.hasActivePenalty && pctOwnMax != null ? ` se il possesso sale a ${pctOwnMax}%` : '') +
    (pctOwnNow != null ? ` · popolarità ${pctOwnNow}% della lega` : '') +
    (penalty.hasActivePenalty && p.popularity_penalty_now > 0.005 ? ` · malus attuale −${fmt(p.popularity_penalty_now, 1)}` : '')
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 text-[8px] font-bold tabular-nums ${
        penalty.hasActivePenalty
          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
          : 'bg-ink-5/10 text-ink-5'
      }`}
    >
      <UsersGlyph className={penalty.hasActivePenalty ? 'text-rose-500 dark:text-rose-300' : 'text-ink-5'} />
      {penalty.label}
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

function MvpGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden role="img">
      <path d="M8 1.2l1.65 4.2 4.5.28-3.48 2.86 1.13 4.36L8 10.48 4.2 12.9l1.13-4.36-3.48-2.86 4.5-.28z" fill="currentColor" />
      <path d="M8 3.9l.73 1.86 2 .12-1.54 1.27.5 1.94L8 8.02 6.31 9.09l.5-1.94-1.54-1.27 2-.12z" fill="rgba(255,255,255,0.5)" />
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
        className="inline-flex h-[17px] items-center rounded-md bg-[#FF0090]/12 px-1 text-[#FF0090]"
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

// Empty slot on the pitch: a titolare who didn't play and isn't (yet) replaced.
// Keeps his muted flag + struck-through name so it's clearly HIS slot, then
// moves the X below the name instead of covering the crest.
function GhostPitchSlot({ p }: { p: LiveSnapshotPlayer }) {
  const pending = p.replacement_pending === true
  return (
    <div
      title={
        pending
          ? `${p.name} non ha giocato — ${p.replacement_candidate ? `se gioca entra ${p.replacement_candidate.name}` : 'in attesa di un subentrante di ruolo'}`
          : `${p.name} non ha giocato — nessun subentrante di ruolo, si gioca in inferiorità`
      }
      className="relative flex min-h-[126px] min-w-0 flex-col items-center gap-1 overflow-hidden rounded-[12px] border border-dashed border-white/35 bg-black/30 px-1 py-1.5 text-center grayscale"
    >
      <RoleNail role={p.role} />
      <div className="opacity-45">
          <PlayerCrest p={p} live={false} size={28} />
      </div>
      <span className="w-full truncate text-[11px] font-bold leading-tight text-white/70 line-through decoration-white/55 decoration-2">
        {shortPlayerName(p.name)}
      </span>
      <span aria-hidden className="-mt-0.5 text-[13px] font-black leading-none text-white/65">
        ✕
      </span>
      <span className="mt-auto rounded-md bg-white/14 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
        Non ha giocato
      </span>
      {pending && (
        <span
          className="w-full rounded-md bg-white/16 px-1 py-1 text-[9.5px] font-black leading-[1.05] text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
          title={p.replacement_candidate ? `Se gioca entra ${p.replacement_candidate.name}` : 'In attesa di un subentrante di ruolo'}
        >
          {p.replacement_candidate ? (
            <>
              <span className="block uppercase tracking-wide">1° Cambio:</span>
              <span className="block truncate normal-case">{shortPlayerName(p.replacement_candidate.name)}</span>
            </>
          ) : (
            'in attesa subentro'
          )}
        </span>
      )}
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
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex min-h-[116px] min-w-0 flex-col items-center gap-1 overflow-hidden rounded-[12px] border bg-glass-3 px-1 py-1.5 text-center shadow-sm transition-all ${
        selected ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'border-hairline'
      } ${flashClass}`}
    >
      <RoleNail role={p.role} />
      <PlayerCrest p={p} live={liveState === 'field'} size={28} />

      <span className="flex w-full items-center justify-center gap-0.5">
        <span className="truncate text-[11.5px] font-bold leading-tight text-ink-1">{shortPlayerName(p.name)}</span>
        {p.via === 'sub' && (
          <span
            className="shrink-0 rounded bg-emerald-400/15 px-0.5 text-[7.5px] font-bold uppercase text-emerald-600 dark:text-emerald-300"
            title={p.sub_for ? `Subentrato per ${p.sub_for.name}` : 'Subentrato'}
          >
            ↑ sub
          </span>
        )}
      </span>
      {p.via === 'sub' && p.sub_for && (
        <span className="block w-full truncate text-center text-[8px] font-semibold leading-tight text-emerald-600 dark:text-emerald-400" title={`Subentrato per ${p.sub_for.name}`}>
          per {shortPlayerName(p.sub_for.name)}
        </span>
      )}

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
  pendingFor,
  liveState,
  selected,
  onSelect,
}: {
  p: LiveSnapshotPlayer
  pendingFor?: string
  liveState?: LiveFieldState
  selected: boolean
  onSelect: () => void
}) {
  const v = computeVoto(p)
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash)
  const pendingTitle = pendingFor ? `Se gioca subentra per ${pendingFor}` : ROLE_NAME[p.role] ?? p.role
  return (
    <button
      type="button"
      onClick={onSelect}
      title={pendingTitle}
      className={`relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border bg-glass-2 py-1.5 pl-5 pr-1.5 text-left transition-all ${
        selected
          ? 'border-accent bg-accent/10 ring-2 ring-accent'
          : pendingFor
            ? 'border-amber-400/70 bg-amber-400/10 ring-1 ring-amber-300/40'
            : 'border-hairline'
      } ${flashClass}`}
    >
      <RoleNail role={p.role} />
      <PlayerCrest p={p} live={liveState === 'field'} size={20} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[12px] font-semibold text-ink-2">{shortPlayerName(p.name)}</span>
        {pendingFor && (
          <span className="truncate text-[8px] font-black uppercase tracking-wide text-amber-600 dark:text-amber-300">
            entra se gioca
          </span>
        )}
      </span>
      <OwnershipMini owners={p.owners} />
      <span className={`shrink-0 text-[12px] font-bold tabular-nums ${v.kind === 'score' ? v.totalCls : v.cls}`}>
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
  const hasFinalOverlay = v.kind === 'score' && p.final_score_now != null
  const displayedFinal = hasFinalOverlay ? p.final_score_now : null

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
  const penalty = popularityPenaltyState(p)
  if (penalty.hasPotentialPenalty)
    chips.push({
      key: 'pp',
      icon: <UsersGlyph className={penalty.hasActivePenalty ? 'text-rose-500 dark:text-rose-300' : 'text-ink-5'} />,
      label: 'P.P.',
      title:
        (penalty.hasActivePenalty ? `Penalità di Popolarità ${penalty.label}` : `Rischio Penalità di Popolarità ${penalty.label}`) +
        (pctNow != null ? ` · popolarità ${pctNow}%${pctMax != null && pctMax > pctNow ? ` → ${pctMax}%` : ''} della lega` : '') +
        (penalty.hasActivePenalty ? ` · malus −${fmt(pp, 1)} → −${fmt(ppPot, 1)}` : ''),
      value: (
        <>
          {/* the penalty %, leading — what he'll lose to popularity */}
          <span className={`font-bold ${penalty.hasActivePenalty ? 'text-rose-600 dark:text-rose-300' : 'text-ink-5'}`}>
            {penalty.label}
          </span>
          {pctNow != null && (
            <span className="text-ink-5"> · {pctNow}% lega</span>
          )}
          {penalty.hasActivePenalty && <span className="text-rose-600 dark:text-rose-300"> · −{fmt(pp, 1)}</span>}
        </>
      ),
      tone: 'neg',
    })

  const others = p.owners
  const hasStarterOwners = others.some((o) => o.status === 'titolare')
  const hasBenchOwners = others.some((o) => o.status !== 'titolare')
  const ownersHeading = hasStarterOwners && !hasBenchOwners
    ? 'Schierato anche da'
    : !hasStarterOwners && hasBenchOwners
      ? 'Presente, ma in panchina, anche da'
      : 'Presente anche in altre squadre'

  return (
    <div className="rounded-2xl border border-hairline bg-glass-1 p-3.5 shadow-1">
      <div className="flex items-center gap-2.5">
        <PlayerCrest p={p} live={liveState === 'field'} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink-1">{p.name}</div>
          <div className="text-[12px] text-ink-4">
            {roleName}
            {liveState === 'field' && <span className="text-lime-500 dark:text-lime-400"> · in campo</span>}
          </div>
        </div>
        {v.kind === 'score' ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-black text-ink-1 tabular-nums">{v.base}</span>
            <span className="text-ink-5">→</span>
            <span className={`text-[20px] font-black tabular-nums ${totalVotoColor(displayedFinal ?? Number(v.total))}`}>
              {displayedFinal != null ? fmt(displayedFinal, 1) : v.total}
            </span>
          </div>
        ) : (
          <span className={`text-[14px] font-bold ${v.cls}`}>{v.text}</span>
        )}
        <button onClick={onClose} className="ml-1 shrink-0 text-ink-5 hover:text-ink-2" aria-label="Chiudi">✕</button>
      </div>

      {hasFinalOverlay && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-1 px-3 py-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-5">Voto finale con P.P./MVP</div>
            <div className="mt-0.5 text-[11.5px] text-ink-4">
              Voto pre-P.P. {v.total}
              {(pp > 0.005 || p.mvp_bonus > 0.005) && <span> · </span>}
              {pp > 0.005 && <>P.P. −{fmt(pp, 1)}</>}
              {pp > 0.005 && p.mvp_bonus > 0.005 && <span> · </span>}
              {p.mvp_bonus > 0.005 && <>MVP +{fmt(p.mvp_bonus, 1)}</>}
              {pp <= 0.005 && p.mvp_bonus <= 0.005 && 'Nessun correttivo ownership attivo'}
            </div>
          </div>
          <span className={`shrink-0 text-[22px] font-black tabular-nums ${totalVotoColor(p.final_score_now)}`}>
            {fmt(p.final_score_now, 1)}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.length ? (
          chips.map((c) => (
            <span
              key={c.key}
              title={c.title}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] ${
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
          <span className="text-[12px] text-ink-5">Nessun bonus o malus</span>
        )}
      </div>

      <div className="mt-3 border-t border-hairline pt-2.5">
        {others.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-[#FF0090]/10 px-3 py-2.5">
            <span className="text-[#FF0090]"><DiamondGlyph className="h-4 w-4" /></span>
            <div>
              <div className="text-[13px] font-bold text-[#FF0090]">Esclusiva di {teamName}</div>
              <div className="text-[11.5px] text-ink-4">Nessun&apos;altra squadra della lega lo schiera</div>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-5">{ownersHeading}</p>
            <div className="space-y-0.5">
              {others.map((o) => {
                const titolare = o.status === 'titolare'
                const showBenchRisk =
                  !titolare &&
                  penalty.hasPotentialPenalty &&
                  !penalty.hasActivePenalty &&
                  ppPot > 0.005
                const cardMalusIfSub = immunityRemovedMalus(p)
                const potentialPenalty =
                  p.popularity_penalty_potential_without_immunity ??
                  Math.max(0, ppPot - (cardMalusIfSub * penalty.maxPct) / 100)
                const eventualScore =
                  p.final_score_potential_without_immunity ??
                  ((p.display_voto_total ?? p.raw_subtotal) - cardMalusIfSub - potentialPenalty)
                return (
                  <div key={o.fantasy_team_id} className="py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9px] font-bold text-white ${
                          titolare ? 'bg-indigo-500' : 'bg-ink-5/70'
                        }`}
                      >
                        {o.team_name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-1">{o.team_name}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          titolare
                            ? 'bg-indigo-400/12 text-indigo-500 dark:text-indigo-300'
                            : 'bg-ink-5/8 text-ink-5'
                        }`}
                      >
                        {titolare ? <PitchGlyph className="text-indigo-500/80 dark:text-indigo-300/80" /> : <BenchGlyph className="text-ink-5" />}
                        {titolare ? 'titolare' : 'panchina'}
                      </span>
                    </div>
                    {showBenchRisk && (
                      <div className="ml-[30px] mt-1 rounded-lg bg-ink-5/8 px-2.5 py-1.5 text-[12px] leading-snug text-ink-4">
                        Se entra: P.P. <span className="font-bold text-rose-600 dark:text-rose-300">−{fmt(potentialPenalty, 1)}</span>
                        {cardMalusIfSub > 0.005 && (
                          <>
                            {' '}e Immunità persa: cartellino <span className="font-bold text-amber-600 dark:text-amber-300">−{fmt(cardMalusIfSub, 1)}</span>:
                          </>
                        )}
                        {' '}Voto eventuale <span className={`font-bold tabular-nums ${totalVotoColor(eventualScore)}`}>{fmt(eventualScore, 1)}</span>.
                      </div>
                    )}
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
  const penalty = popularityPenaltyState(p)
  const showPen = penalty.hasPotentialPenalty
  const showMvp = p.mvp_bonus > 0.005
  const pctNow = entry ? Math.round(entry.pct_now) : null
  const pctMax = entry ? Math.round(entry.pct_potential) : null

  const v = computeVoto(p)
  const flash = useFlash(p.player_id)
  const flashClass = flashTintClass(flash)

  return (
    <div
      className={`relative flex min-h-[54px] items-center gap-2 overflow-hidden rounded-md border border-hairline bg-glass-2 py-1.5 pl-5 pr-2 ${
        muted ? 'opacity-55' : ''
      } ${flashClass}`}
    >
      <RoleNail role={p.role} />
      <TeamCrest
        name={p.national_team?.name ?? ''}
        logoUrl={p.national_team?.logo_url ?? null}
        flagUrl={p.national_team?.flag_url ?? null}
        fifaCode={p.national_team?.fifa_code ?? ''}
        size={16}
        className="w-4 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-ink-1">{p.name}</span>
          {p.via === 'sub' && (
            <span
              className="shrink-0 rounded bg-emerald-400/15 px-1 py-px text-[8px] font-bold uppercase text-emerald-600 dark:text-emerald-300"
              title={p.sub_for ? `Subentrato per ${p.sub_for.name}` : 'Subentrato'}
            >
              ↑ sub{p.sub_for ? ` · ${shortPlayerName(p.sub_for.name)}` : ''}
            </span>
          )}
          {p.via === 'starter' && !p.counts && (
            <span
              className="shrink-0 rounded bg-rose-400/15 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300"
              title={
                p.replaced_by
                  ? `Non ha giocato — sostituito da ${p.replaced_by.name}`
                  : p.replacement_pending
                    ? `Non ha giocato — ${p.replacement_candidate ? `se gioca entra ${p.replacement_candidate.name}` : 'in attesa di un subentrante di ruolo'}`
                    : 'Non ha giocato — nessun subentrante di ruolo, si gioca in inferiorità'
              }
            >
              ✕ Non ha giocato
              {p.replaced_by
                ? ` → ${shortPlayerName(p.replaced_by.name)}`
                : p.replacement_pending
                  ? ` · ${p.replacement_candidate ? `se gioca ${shortPlayerName(p.replacement_candidate.name)}` : 'in attesa subentro'}`
                  : ' · in inferiorità'}
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
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  penalty.hasActivePenalty
                    ? 'bg-rose-400/12 text-rose-500 dark:text-rose-300'
                    : 'bg-ink-5/10 text-ink-5'
                }`}
                title={
                  (penalty.hasActivePenalty ? `Penalità di Popolarità ${penalty.label}` : `Rischio Penalità di Popolarità ${penalty.label}`) +
                  (pctNow != null ? ` · popolarità ${pctNow}%${pctMax != null && pctMax > pctNow ? ` → ${pctMax}%` : ''} della lega` : '') +
                  (penalty.hasActivePenalty ? ` · malus −${fmt(penNow)} → −${fmt(penPot)}` : '')
                }
              >
                <UsersGlyph className={penalty.hasActivePenalty ? 'text-rose-500 dark:text-rose-300' : 'text-ink-5'} />
                <span className={`font-bold ${penalty.hasActivePenalty ? 'text-rose-600 dark:text-rose-300' : 'text-ink-5'}`}>
                  {penalty.label}
                </span>
                {pctNow != null && <span className="text-ink-5">· {pctNow}% lega</span>}
                {penalty.hasActivePenalty && <span className="text-indigo-500 dark:text-indigo-300">· −{fmt(penNow)}</span>}
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
  onInk = false,
}: {
  owners: LiveOwnerRef[]
  totalTeams?: number
  compact?: boolean
  // `onInk` = rendered on the solid inverted owned-titolare panel, where the
  // glass-tuned indigo loses contrast; switch to surface-0-based chips that read
  // on both the black (light) and white (dark) panel.
  onInk?: boolean
}) {
  const [revealed, setRevealed] = useState(false)
  if (!owners.length) return null
  // Exclusive ownership — rostered by exactly one team in the whole lega AND
  // fielded as a starter (titolare). The trademark moment of the format, so the
  // "in 1/N" badge glows magenta. A lone owner who only benched him stays grey
  // until he's actually on the field.
  const isExclusiveStarter =
    totalTeams != null && owners.length === 1 && owners[0]?.status === 'titolare'
  // Space management: in the ultra-narrow 2-column match rows we can't fit two
  // team names. For 2+ owners we show the count + one role glyph per owner
  // (titolare = pitch, panchina = bench); tapping the group reveals the full
  // names inline (user-initiated, so the temporary row growth is acceptable).
  // A single owner — or any non-compact context — keeps the named pill.
  const multiOwner = owners.length > 1
  const collapsible = compact && multiOwner
  const showNames = !collapsible || revealed
  return (
    <div
      className={`flex min-w-0 items-center gap-1 ${
        compact ? (collapsible && revealed ? 'mt-0.5 flex-wrap' : 'mt-0.5 flex-nowrap') : 'mt-1 flex-wrap'
      } ${collapsible ? 'cursor-pointer' : ''}`}
      onClick={collapsible ? () => setRevealed((v) => !v) : undefined}
      role={collapsible ? 'button' : undefined}
      tabIndex={collapsible ? 0 : undefined}
      title={collapsible && !revealed ? 'Tocca per i nomi delle squadre' : undefined}
    >
      <span
        className={`shrink-0 ${
          isExclusiveStarter
            ? `font-black text-[#FF0090] ${compact ? 'text-[11px]' : 'text-[12px]'}`
            : `font-bold text-[#6366f1] ${compact ? 'text-[10px]' : 'text-[11px]'}`
        }`}
      >
        {totalTeams ? `in ${owners.length}/${totalTeams}` : 'anche in'}
      </span>
      {owners.map((owner, i) => {
        const isStarter = owner.status === 'titolare'
        const chipCls = onInk
          ? isStarter
            ? 'border-surface-0/30 bg-surface-0/15 text-surface-0'
            : 'border-surface-0/20 bg-surface-0/10 text-surface-0/75'
          : isStarter
            ? 'border-indigo-400/25 bg-indigo-400/12 text-indigo-500 dark:text-indigo-300'
            : 'border-hairline bg-ink-5/8 text-ink-5'
        const glyphCls = onInk
          ? isStarter
            ? 'text-surface-0/85'
            : 'text-surface-0/70'
          : isStarter
            ? 'text-indigo-500/80 dark:text-indigo-300/80'
            : 'text-ink-5'
        const glyph = isStarter ? (
          <PitchGlyph className={`shrink-0 ${glyphCls}`} />
        ) : (
          <BenchGlyph className={`shrink-0 ${glyphCls}`} />
        )
        return (
          <span
            key={`${owner.team_name}-${owner.status}-${i}`}
            className={`inline-flex shrink-0 items-center rounded-full border font-semibold ${chipCls} ${
              showNames
                ? `min-w-0 gap-1 ${compact ? 'max-w-[130px] px-2 py-0.5 text-[10px]' : 'max-w-[190px] px-2.5 py-0.5 text-[11px]'}`
                : 'justify-center px-1.5 py-0.5'
            }`}
            title={`${owner.team_name} — ${isStarter ? 'titolare' : 'panchina'}`}
          >
            {showNames && <span className="truncate">{owner.team_name}</span>}
            {glyph}
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
