'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import type {
  LiveRoundSnapshot,
  LiveSnapshotTeam,
  LiveSnapshotPlayer,
  LiveSnapshotMatch,
  LiveSnapshotRealPlayer,
  LiveOwnerRef,
} from '@/domain/fantamondiale/engine/liveSnapshot'

const POLL_MS = 35_000

const ROLE_COLOR: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}
const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const

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

// A team that never submitted a lineup arrives in the snapshot with no formation
// and no players — it scores 0 for the giornata (Battle Royale).
function isNotFielded(team: LiveSnapshotTeam): boolean {
  return team.formation === null && team.players.length === 0
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
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    initialSnapshot?.matches[0]?.match_id ?? null,
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
    setSelectedMatchId(matchId)
    setActiveTab('partite')
  }, [])

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
        <div className="mb-3 flex gap-1 rounded-full border border-hairline bg-glass-1 p-1 shadow-sm">
          {(['partite', 'squadre', 'classifica'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-full py-2 text-[13px] font-semibold capitalize tracking-tight transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-surface-2 text-ink-1 shadow-md shadow-black/5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]'
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
      {/* status + time */}
      <div className="flex items-center gap-1.5">
        <MatchStatusBadge status={m.status} minute={m.minute} />
        {m.status === 'scheduled' && (
          <span className="text-[9px] text-ink-5 tabular-nums">{fmtKickoff(m.kickoff_at)}</span>
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

function MatchStatusBadge({ status, minute }: { status: LiveSnapshotMatch['status']; minute: number | null }) {
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-400/12 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
        {minute != null ? `${minute}'` : 'LIVE'}
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
}: {
  match: LiveSnapshotMatch | null
  team: LiveSnapshotTeam | null
  activeView: 'match' | 'team'
  myTeamId: string | null
  totalTeams: number
  previewMode: boolean
}) {
  if (activeView === 'team' && team) {
    const isMine = team.fantasy_team_id === myTeamId
    if (previewMode && !isMine) {
      return <MaskedTeamPanel team={team} />
    }
    return <TeamDetailPanel team={team} isMine={isMine} />
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
            <MatchStatusBadge status={m.status} minute={m.minute} />
            {m.status === 'scheduled' && (
              <span className="text-[10px] text-ink-5 tabular-nums">{fmtKickoff(m.kickoff_at)}</span>
            )}
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
          <RealLineupLegend />
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
  return <div aria-hidden className="min-h-[43px] rounded-md border border-transparent px-2 py-1 opacity-0" />
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

  return (
    <div
      className={`flex min-h-[45px] items-center gap-1 rounded-md border border-hairline bg-glass-2 px-1.5 py-1 sm:gap-1.5 sm:px-2 ${
        muted ? 'opacity-60' : ''
      } ${depth > 0 ? 'ml-2 sm:ml-3' : ''}`}
    >
      {depth > 0 && <span className="text-[10px] text-emerald-500 dark:text-emerald-400">↳</span>}
      <span className={`text-[10px] font-bold ${ROLE_COLOR[p.role] ?? 'text-ink-4'}`}>{p.role}</span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
            <span className="shrink-0 text-[8px] font-semibold text-rose-500 dark:text-rose-400" title="Sostituito">
              ↓{p.subbed_off_minute}&apos;
            </span>
          )}
          {p.subbed_on_minute != null && (
            <span className="shrink-0 text-[8px] font-semibold text-emerald-500 dark:text-emerald-400" title="Entrato">
              ↑{p.subbed_on_minute}&apos;
              {depth > 0 && p.replaced_player_name ? '' : ''}
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

function RealLineupLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[9px] text-ink-5">
      <span className="flex items-center gap-1"><span className="text-emerald-500 dark:text-emerald-400">↑</span>entrato</span>
      <span className="flex items-center gap-1"><span className="text-rose-500 dark:text-rose-400">↓</span>uscito</span>
      <span className="flex items-center gap-1"><span className="font-black text-amber-500 dark:text-amber-300">★ MVP</span></span>
      <span>S.V. = senza voto · ✕ = non entrato · – = in attesa</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Team detail panel (desktop center)
// ─────────────────────────────────────────────

function TeamDetailPanel({
  team,
  isMine,
}: {
  team: LiveSnapshotTeam
  isMine: boolean
}) {
  const fielded = team.players.filter((p) => p.counts)
  const bench = team.players.filter((p) => !p.counts)
  const notFielded = isNotFielded(team)

  return (
    <div
      className={`rounded-xl border bg-glass-1 overflow-hidden ${
        isMine ? 'border-indigo-500/30' : 'border-hairline'
      }`}
    >
      {/* header */}
      <div className="bg-glass-2 border-b border-hairline px-4 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold text-ink-1 truncate">{team.name}</span>
            {isMine && (
              <span className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-300">
                Tu
              </span>
            )}
          </div>
          <span className="text-[10px] text-ink-5">{notFielded ? 'Formazione non schierata' : team.formation ?? '—'}</span>
        </div>
        <span className="text-[22px] font-black tabular-nums text-emerald-400">
          {fmt(team.live_total, 1)}
        </span>
      </div>

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
        {/* legend: what the chips mean */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[9px] text-ink-5">
          <span className="flex items-center gap-1">
            <span className="rounded-full bg-amber-400/15 px-1 text-[8px] font-semibold text-amber-500 dark:text-amber-300">★ MVP</span>
            bonus
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full bg-rose-400/12 px-1 text-[8px] font-semibold text-rose-500 dark:text-rose-300">pop</span>
            malus popolarità (ora ▸ max)
          </span>
        </div>

        {/* starters grouped by role */}
        {ROLE_ORDER.map((role) => {
          const rolePlayers = fielded.filter((p) => p.role === role)
          if (!rolePlayers.length) return null
          return (
            <div key={role} className="space-y-1">
              {rolePlayers.map((p) => (
                <FantasyPlayerRow key={p.player_id} p={p} />
              ))}
            </div>
          )
        })}

        {/* coach */}
        {team.coach && (
          <div className="border-t border-hairline pt-2">
            <CoachRow coach={team.coach} />
          </div>
        )}

        {/* bench */}
        {bench.length > 0 && (
          <div className="border-t border-hairline pt-2.5 space-y-1">
            <p className="text-[8px] font-bold uppercase tracking-wider text-ink-5 px-1">Panchina</p>
            {bench.map((p) => (
              <FantasyPlayerRow key={p.player_id} p={p} muted />
            ))}
          </div>
        )}
      </div>
      )}
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
          {coach.live_result === 'W' ? 'Vince' : coach.live_result === 'L' ? 'Perde' : 'Pari'}
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

function FantasyPlayerRow({ p, muted = false }: { p: LiveSnapshotPlayer; muted?: boolean }) {
  const penNow = p.popularity_penalty_now
  const penPot = p.popularity_penalty_potential
  const showPen = penNow > 0.005 || penPot > 0.005
  const penRises = penPot - penNow > 0.005
  const showMvp = p.mvp_bonus > 0.005

  const played = p.rating != null || p.status === 'played'
  const v = played
    ? {
        kind: 'score' as const,
        base: fmt(p.display_voto_base ?? p.voto_base ?? p.raw_subtotal, 1),
        total: fmt((p.display_voto_total ?? p.final_score_now) + p.mvp_bonus - penNow, 1),
        totalCls: totalVotoColor((p.display_voto_total ?? p.final_score_now) + p.mvp_bonus - penNow),
      }
    : { kind: 'marker' as const, text: p.status === 'pending' ? '–' : '✕', cls: 'text-ink-5' }

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
            {showPen &&
              (penNow > 0.005 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-500 dark:text-rose-300">
                  <span>Penalità</span>
                  <span className="text-indigo-500 dark:text-indigo-300">−{fmt(penNow)}</span>
                  {penRises && (
                    <>
                      <span className="text-ink-5">→</span>
                      <span className="text-ink-5">−{fmt(penPot)}</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/8 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-500/80 dark:text-rose-300/80">
                  <span>Rischio penalità</span>
                  <span className="text-indigo-500 dark:text-indigo-300">0</span>
                  <span className="text-ink-5">→</span>
                  <span className="text-ink-5">−{fmt(penPot)}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      <span className="shrink-0 w-12 overflow-hidden rounded-md border border-hairline bg-surface-2 text-center tabular-nums shadow-sm">
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
  return (
    <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex min-w-0 flex-wrap items-center gap-1`}>
      <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-medium text-ink-5`}>
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
  onToggle,
}: {
  team: LiveSnapshotTeam
  rank: number
  isMine: boolean
  standings: LiveRoundSnapshot['standings'][string] | undefined
  expanded: boolean
  previewMode: boolean
  onToggle: () => void
}) {
  const notFielded = isNotFielded(team)
  return (
    <div
      className={`rounded-xl border bg-glass-1 overflow-hidden ${
        isMine ? 'border-indigo-500/30' : 'border-hairline'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-glass-2 border-b border-hairline"
      >
        <span className="w-5 text-center text-[11px] font-bold text-ink-5">{rank}</span>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink-1 truncate">{team.name}</span>
            {isMine && (
              <span className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-300">
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
              {team.players.filter((p) => p.counts).map((p) => (
                <FantasyPlayerRow key={p.player_id} p={p} />
              ))}
              {team.coach && (
                <div className="border-t border-hairline pt-2">
                  <CoachRow coach={team.coach} />
                </div>
              )}
              {team.players.filter((p) => !p.counts).length > 0 && (
                <>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-ink-5 px-1 pt-1">Panchina</p>
                  {team.players.filter((p) => !p.counts).map((p) => (
                    <FantasyPlayerRow key={p.player_id} p={p} muted />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
