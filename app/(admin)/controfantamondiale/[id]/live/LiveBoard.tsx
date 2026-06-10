'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import type {
  LiveRoundSnapshot,
  LiveSnapshotTeam,
  LiveSnapshotPlayer,
  LiveSnapshotMatch,
  LiveSnapshotRealPlayer,
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

function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
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
}: {
  legaCompRef: string
  roundName: string
  myTeamId: string | null
  initialSnapshot: LiveRoundSnapshot | null
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
      <div className="hidden lg:grid lg:grid-cols-[200px_1fr_240px] lg:gap-3">
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
          onSelectTeam={handleSelectTeam}
        />
        <StandingsPanel
          teams={snapshot.teams}
          standings={snapshot.standings}
          myTeamId={myTeamId}
          selectedTeamId={selectedTeamId}
          onSelect={handleSelectTeam}
        />
      </div>

      {/* ── Mobile: tab bar ── */}
      <div className="lg:hidden">
        <div className="mb-3 flex rounded-lg border border-hairline bg-glass-1 p-0.5">
          {(['partite', 'squadre', 'classifica'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-surface-2 text-ink-1 shadow-sm'
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
            myTeamId={myTeamId}
            selectedTeamId={selectedTeamId}
            onSelect={handleSelectTeam}
            fullWidth
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
          className={`w-full border-t border-hairline px-3 py-2 text-left transition-colors hover:bg-glass-2 ${
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
  const fantasyCount = m.players.filter((p) => p.ownership_signal !== null).length

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <MatchStatusBadge status={m.status} minute={m.minute} />
        {m.status === 'scheduled' && (
          <span className="text-[9px] text-ink-5 tabular-nums">{fmtKickoff(m.kickoff_at)}</span>
        )}
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        <span className={`font-medium ${selected ? 'text-ink-1' : 'text-ink-2'} truncate max-w-[60px]`}>
          {m.home_team.name}
        </span>
        <span className="font-bold tabular-nums text-ink-1 shrink-0">
          {m.status !== 'scheduled'
            ? `${m.home_score ?? 0}–${m.away_score ?? 0}`
            : '–'}
        </span>
        <span className={`font-medium ${selected ? 'text-ink-1' : 'text-ink-2'} truncate max-w-[60px] text-right`}>
          {m.away_team.name}
        </span>
      </div>
      {fantasyCount > 0 && (
        <div className="flex gap-0.5" title={`${fantasyCount} giocatori di questa partita in almeno una formazione`}>
          {Array.from({ length: Math.min(fantasyCount, 6) }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-indigo-400/50" />
          ))}
          {fantasyCount > 6 && <span className="text-[8px] text-ink-5">+{fantasyCount - 6}</span>}
        </div>
      )}
    </div>
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
  onSelectTeam,
}: {
  match: LiveSnapshotMatch | null
  team: LiveSnapshotTeam | null
  activeView: 'match' | 'team'
  myTeamId: string | null
  totalTeams: number
  onSelectTeam: (id: string) => void
}) {
  if (activeView === 'team' && team) {
    return <TeamDetailPanel team={team} isMine={team.fantasy_team_id === myTeamId} />
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
  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      {/* header */}
      <div className="bg-glass-2 px-4 py-3 border-b border-hairline">
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamCrest
              name={m.home_team.name}
              logoUrl={m.home_team.logo_url}
              flagUrl={m.home_team.flag_url}
              fifaCode={m.home_team.fifa_code}
              size={28}
            />
            <span className="text-[12px] font-semibold text-ink-1">{m.home_team.name}</span>
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
          <div className="flex flex-col items-center gap-1 flex-1">
            <TeamCrest
              name={m.away_team.name}
              logoUrl={m.away_team.logo_url}
              flagUrl={m.away_team.flag_url}
              fifaCode={m.away_team.fifa_code}
              size={28}
            />
            <span className="text-[12px] font-semibold text-ink-1">{m.away_team.name}</span>
          </div>
        </div>
      </div>

      {/* players */}
      {m.players.length > 0 ? (
        <div className="p-3 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-ink-5 px-1">
            Giocatori nel pool
          </p>

          {/* two columns: home / away */}
          <div className="grid grid-cols-2 gap-2">
            {(['home', 'away'] as const).map((side) => {
              const teamRef = side === 'home' ? m.home_team : m.away_team
              const sidePlayers = m.players.filter((p) => {
                // We don't have side info directly; use ownership signal presence as proxy.
                // Actually we need to know which team the player belongs to.
                // This is derived from national_team_id — stored in the player but not in LiveSnapshotRealPlayer.
                // We show all players in one list for now and split by first/second half alphabetically.
                return true
              })
              if (side === 'away') return null // render both sides together below
              return null
            })}
          </div>

          {/* single list sorted alphabetically */}
          <div className="space-y-1">
            {m.players.map((p) => (
              <RealPlayerRow key={p.player_id} p={p} totalTeams={totalTeams} />
            ))}
          </div>

          {/* legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-hairline text-[9px] text-ink-5">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-0.5 rounded bg-amber-400/60" />esclusiva certa
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-0.5 rounded bg-amber-400/25" />esclusiva a rischio
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-0.5 rounded bg-indigo-400/40" />in più squadre
            </span>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-[12px] text-ink-5">
            {m.status === 'scheduled'
              ? 'I giocatori appariranno dopo il calcio d\'inizio'
              : 'Nessun giocatore del pool in questa partita'}
          </p>
        </div>
      )}
    </div>
  )
}

function RealPlayerRow({ p, totalTeams }: { p: LiveSnapshotRealPlayer; totalTeams: number }) {
  const isExclSafe = p.ownership_signal === 'excl_safe'
  const isExclRisk = p.ownership_signal === 'excl_risk'
  const isShared = p.ownership_signal === 'shared'
  const isBenchOnly = p.ownership_signal === 'bench_only'

  return (
    <div
      className={`relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] overflow-hidden ${
        isExclSafe
          ? 'border-amber-400/25 bg-amber-400/5'
          : isExclRisk
          ? 'border-amber-400/12 bg-amber-400/3'
          : isShared
          ? 'border-indigo-400/20 bg-indigo-400/4'
          : isBenchOnly
          ? 'border-hairline bg-glass-1 opacity-60'
          : 'border-hairline bg-glass-1'
      }`}
    >
      {/* left accent bar */}
      {(isExclSafe || isExclRisk) && (
        <span
          className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l ${
            isExclSafe ? 'bg-amber-400/60' : 'bg-amber-400/25'
          }`}
        />
      )}
      {isShared && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l bg-indigo-400/40" />
      )}

      <span className={`text-[9px] font-bold ${ROLE_COLOR[p.role] ?? 'text-ink-4'}`}>{p.role}</span>
      <span className="flex-1 font-medium text-ink-1 truncate">{p.name}</span>

      {p.rating != null && (
        <span
          className={`tabular-nums text-[10px] ${
            p.rating >= 7.5 ? 'text-emerald-400' : p.rating < 6 ? 'text-rose-400' : 'text-ink-3'
          }`}
        >
          {fmt(p.rating, 1)}
        </span>
      )}

      {p.ownership_signal && (
        <span className="text-[8px] text-ink-5 tabular-nums shrink-0">
          {p.fielded_now}/{totalTeams}
          {p.ownership_signal === 'excl_risk' && (
            <span className="text-amber-400/60"> ▸{p.max_possible}</span>
          )}
        </span>
      )}
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
          <span className="text-[10px] text-ink-5">{team.formation ?? '—'}</span>
        </div>
        <span className="text-[22px] font-black tabular-nums text-emerald-400">
          {fmt(team.live_total, 1)}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* coach */}
        {team.coach && <CoachRow coach={team.coach} />}

        {/* col headers */}
        <div className="flex items-center gap-1.5 px-2 text-[8px] font-bold uppercase tracking-wider text-ink-5">
          <span className="w-4" />
          <span className="flex-1">Giocatore</span>
          <span className="w-8 text-right">Voto</span>
          <span className="w-16 text-right">Pen ora▸max</span>
          <span className="w-10 text-right">Ptg</span>
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
    </div>
  )
}

function CoachRow({ coach }: { coach: LiveSnapshotTeam['coach'] }) {
  if (!coach) return null
  return (
    <div className="flex items-center gap-2 rounded-md border border-hairline bg-glass-2 px-2 py-1.5">
      <span className="w-4 text-[9px] font-bold text-ink-5">CT</span>
      <TeamCrest
        name={coach.team?.name ?? ''}
        logoUrl={coach.team?.logo_url ?? null}
        flagUrl={coach.team?.flag_url ?? null}
        fifaCode={coach.team?.fifa_code ?? ''}
        size={14}
        className="w-4"
      />
      <span className="flex-1 text-[11px] font-medium text-ink-1 truncate">{coach.name}</span>
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

  // exclusive glow: fielded_now from ownership is in the player already via the snapshot
  // We signal exclusivity via a left border if counts && no popularity penalty potential growth
  // (i.e. ownership can't increase → truly exclusive)

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border border-hairline bg-glass-2 px-2 py-1 text-[11px] ${
        muted ? 'opacity-55' : ''
      }`}
    >
      <span className={`text-[9px] font-bold ${ROLE_COLOR[p.role] ?? 'text-ink-4'}`}>{p.role}</span>
      <TeamCrest
        name={p.national_team?.name ?? ''}
        logoUrl={p.national_team?.logo_url ?? null}
        flagUrl={p.national_team?.flag_url ?? null}
        fifaCode={p.national_team?.fifa_code ?? ''}
        size={14}
        className="w-4 shrink-0"
      />
      <span className="flex-1 font-medium text-ink-1 truncate">{p.name}</span>

      {p.via === 'sub' && (
        <span className="shrink-0 rounded bg-emerald-400/15 px-1 text-[7px] font-bold uppercase text-emerald-300">
          ▶
        </span>
      )}
      {p.status === 'pending' && (
        <span className="shrink-0 rounded bg-ink-5/10 px-1 text-[7px] font-bold uppercase text-ink-5">
          att.
        </span>
      )}
      {p.status === 'not_played' && !p.counts && (
        <span className="shrink-0 rounded bg-rose-400/10 px-1 text-[7px] font-bold uppercase text-rose-400">
          s.v.
        </span>
      )}

      {/* rating */}
      <span className="shrink-0 w-8 text-right tabular-nums text-ink-4">{fmt(p.rating, 1)}</span>

      {/* penalty now → potential */}
      <span className="shrink-0 w-16 text-right tabular-nums text-[10px]">
        {showPen ? (
          <span className="text-rose-400/90">
            −{fmt(penNow)}
            {penRises && <span className="text-rose-400/50">▸−{fmt(penPot)}</span>}
          </span>
        ) : (
          <span className="text-ink-5">—</span>
        )}
      </span>

      {/* final score */}
      <span className="shrink-0 w-10 text-right tabular-nums font-semibold text-ink-1">
        {muted ? <span className="text-ink-5">{fmt(p.final_score_now)}</span> : fmt(p.final_score_now)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Standings panel (right column / mobile tab)
// ─────────────────────────────────────────────

function StandingsPanel({
  teams,
  standings,
  myTeamId,
  selectedTeamId,
  onSelect,
  fullWidth = false,
}: {
  teams: LiveSnapshotTeam[]
  standings: LiveRoundSnapshot['standings']
  myTeamId: string | null
  selectedTeamId: string | null
  onSelect: (id: string) => void
  fullWidth?: boolean
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-glass-1 overflow-hidden ${fullWidth ? '' : ''}`}>
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 px-3 pt-2.5 pb-1">
        <span className="text-[8px] font-bold uppercase tracking-wider text-ink-5">#</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-ink-5">Squadra</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-ink-5 text-right">Ptg</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-ink-5 text-right">⚽</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-ink-5 text-right">Gio.</span>
      </div>

      {teams.map((team, i) => {
        const s = standings[team.fantasy_team_id]
        const isMine = team.fantasy_team_id === myTeamId
        const isSelected = team.fantasy_team_id === selectedTeamId

        return (
          <button
            key={team.fantasy_team_id}
            onClick={() => onSelect(team.fantasy_team_id)}
            className={`w-full grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 border-t border-hairline px-3 py-2 text-left transition-colors hover:bg-glass-2 ${
              isSelected ? 'bg-indigo-500/8' : ''
            }`}
          >
            <span className="text-[10px] font-bold text-ink-5 w-4 text-center">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className={`text-[11px] font-medium truncate ${isMine ? 'text-indigo-300' : 'text-ink-1'}`}>
                  {team.name}
                </span>
                {isMine && (
                  <span className="shrink-0 text-[7px] font-bold uppercase text-indigo-400/60">tu</span>
                )}
              </div>
              <span className="text-[9px] text-ink-5">{team.formation ?? '—'}</span>
            </div>
            <span className="text-[12px] font-bold tabular-nums text-ink-1 text-right">
              {fmt(s?.live_total ?? team.live_total, 1)}
            </span>
            <GoalDots goals={s?.goals_scored ?? 0} />
            <span
              className={`text-[12px] font-bold tabular-nums text-right w-7 ${
                (s?.giornata_points ?? 0) > 0 ? 'text-emerald-400' : 'text-ink-4'
              }`}
            >
              {s?.giornata_points ?? 0}
            </span>
          </button>
        )
      })}

      <div className="border-t border-hairline px-3 py-2 text-[9px] text-ink-5 flex gap-3">
        <span>⚽ gol segnati</span>
        <span>Gio. punti giornata (live)</span>
      </div>
    </div>
  )
}

function GoalDots({ goals }: { goals: number }) {
  return (
    <div className="flex items-center gap-0.5 w-8 justify-end">
      {goals === 0 ? (
        <span className="text-[9px] text-ink-5">0</span>
      ) : (
        Array.from({ length: Math.min(goals, 5) }).map((_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
        ))
      )}
      {goals > 5 && <span className="text-[8px] text-emerald-400/70">+{goals - 5}</span>}
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
  onToggle,
}: {
  team: LiveSnapshotTeam
  rank: number
  isMine: boolean
  standings: LiveRoundSnapshot['standings'][string] | undefined
  expanded: boolean
  onToggle: () => void
}) {
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
        <span className="flex-1 text-left text-[13px] font-semibold text-ink-1 truncate">{team.name}</span>
        {isMine && (
          <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-300">
            Tu
          </span>
        )}
        <GoalDots goals={standings?.goals_scored ?? 0} />
        <span className={`text-[11px] font-bold tabular-nums ${(standings?.giornata_points ?? 0) > 0 ? 'text-emerald-400' : 'text-ink-4'}`}>
          {standings?.giornata_points ?? 0} pt
        </span>
        <span className="text-[14px] font-bold tabular-nums text-ink-1 w-12 text-right">
          {fmt(team.live_total, 1)}
        </span>
        <span className="text-[10px] text-ink-4">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {team.coach && <CoachRow coach={team.coach} />}
          {team.players.filter((p) => p.counts).map((p) => (
            <FantasyPlayerRow key={p.player_id} p={p} />
          ))}
          {team.players.filter((p) => !p.counts).length > 0 && (
            <>
              <p className="text-[8px] font-bold uppercase tracking-wider text-ink-5 px-1 pt-1">Panchina</p>
              {team.players.filter((p) => !p.counts).map((p) => (
                <FantasyPlayerRow key={p.player_id} p={p} muted />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
