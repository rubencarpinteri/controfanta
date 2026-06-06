'use client'

import { useEffect, useRef, useState } from 'react'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { CoachTierBadge } from '@/components/fm/CoachTierBadge'
import type {
  LiveRoundSnapshot,
  LiveSnapshotTeam,
  LiveSnapshotPlayer,
} from '@/domain/fantamondiale/engine/liveSnapshot'

const POLL_MS = 35_000

const ROLE_COLORS: Record<string, string> = {
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

export function LiveBoard({
  legaCompRef,
  roundName,
  myTeamId,
  initialSnapshot,
  initialComputedAt,
}: {
  legaCompRef: string
  roundName: string
  myTeamId: string | null
  initialSnapshot: LiveRoundSnapshot | null
  initialComputedAt: string | null
}) {
  const [snapshot, setSnapshot] = useState<LiveRoundSnapshot | null>(initialSnapshot)
  const [computedAt, setComputedAt] = useState<string | null>(
    initialSnapshot?.computed_at ?? initialComputedAt,
  )
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(`/api/fm/${legaCompRef}/live`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as {
          snapshot: LiveRoundSnapshot | null
          computed_at: string | null
        }
        if (cancelled) return
        if (json.snapshot) {
          setSnapshot(json.snapshot)
          setComputedAt(json.snapshot.computed_at ?? json.computed_at)
        }
      } catch {
        /* transient — keep last good snapshot */
      }
    }
    timer.current = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [legaCompRef])

  const updated = computedAt
    ? new Date(computedAt).toLocaleTimeString('it-IT', {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-ink-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live — {snapshot.round.name}
        </span>
        {updated && <span className="tabular-nums">Aggiornato {updated}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {snapshot.teams.map((team, i) => (
          <TeamCard key={team.fantasy_team_id} team={team} rank={i + 1} isMine={team.fantasy_team_id === myTeamId} />
        ))}
      </div>
    </div>
  )
}

function TeamCard({ team, rank, isMine }: { team: LiveSnapshotTeam; rank: number; isMine: boolean }) {
  const fielded = team.players.filter((p) => p.counts)
  const bench = team.players.filter((p) => !p.counts)

  const fieldedByRole = ROLE_ORDER.map((role) => ({
    role,
    players: fielded.filter((p) => p.role === role),
  }))

  return (
    <div
      className={`rounded-xl border bg-glass-1 overflow-hidden ${
        isMine ? 'border-indigo-500/40' : 'border-hairline'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-glass-2 border-b border-hairline">
        <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-ink-4">{rank}</span>
        <span className="flex-1 text-[13px] font-semibold text-ink-1 truncate">{team.name}</span>
        {isMine && (
          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
            Tu
          </span>
        )}
        <span className="text-[11px] font-mono text-ink-4">{team.formation ?? '—'}</span>
        <span className="ml-1 rounded-md bg-emerald-400/10 px-2 py-0.5 text-[13px] font-bold tabular-nums text-emerald-300">
          {fmt(team.live_total)}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {team.coach && (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-glass-2 px-2 py-1.5">
            <span className="w-4 text-[10px] font-bold text-ink-4">CT</span>
            <TeamCrest
              name={team.coach.team?.name ?? ''}
              logoUrl={team.coach.team?.logo_url ?? null}
              flagUrl={team.coach.team?.flag_url ?? null}
              fifaCode={team.coach.team?.fifa_code ?? ''}
              size={14}
              className="w-4"
            />
            <span className="flex-1 text-[11px] font-medium text-ink-1 truncate">{team.coach.name}</span>
            <CoachTierBadge tier={team.coach.tier} />
          </div>
        )}

        {/* Schierati */}
        <div className="space-y-1.5">
          {fieldedByRole.map(({ role, players }) =>
            players.length === 0 ? null : (
              <div key={role} className="flex items-start gap-2">
                <span className={`mt-2 w-4 text-[10px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                <div className="flex flex-1 flex-col gap-1">
                  {players.map((p) => (
                    <PlayerRow key={p.player_id} p={p} />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Panchina */}
        <div className="border-t border-hairline pt-2.5">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-5">Panchina</p>
          <div className="flex flex-col gap-1">
            {bench.length === 0 && <span className="text-[11px] text-ink-5">—</span>}
            {bench.map((p) => (
              <PlayerRow key={p.player_id} p={p} muted />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ p, muted }: { p: LiveSnapshotPlayer; muted?: boolean }) {
  const penaltyNow = p.popularity_penalty_now
  const penaltyPot = p.popularity_penalty_potential
  const showPenalty = penaltyNow > 0.005 || penaltyPot > 0.005
  const penaltyRises = penaltyPot - penaltyNow > 0.005

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border border-hairline bg-glass-2 px-2 py-1 text-[11px] ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <span className={`text-[9px] font-bold ${ROLE_COLORS[p.role]}`}>{p.role}</span>
      <TeamCrest
        name={p.national_team?.name ?? ''}
        logoUrl={p.national_team?.logo_url ?? null}
        flagUrl={p.national_team?.flag_url ?? null}
        fifaCode={p.national_team?.fifa_code ?? ''}
        size={14}
        className="w-4"
      />
      <span className="font-medium text-ink-1 truncate">{p.name}</span>
      {p.via === 'sub' && (
        <span className="shrink-0 rounded bg-emerald-400/15 px-1 text-[8px] font-bold uppercase text-emerald-300">
          ▶ entrato
        </span>
      )}
      {p.status === 'pending' && (
        <span className="shrink-0 rounded bg-ink-5/10 px-1 text-[8px] font-bold uppercase text-ink-5">
          attesa
        </span>
      )}
      {p.status === 'not_played' && !p.counts && (
        <span className="shrink-0 rounded bg-rose-400/10 px-1 text-[8px] font-bold uppercase text-rose-400">
          s.v.
        </span>
      )}

      <span className="ml-auto shrink-0 tabular-nums text-ink-4">{fmt(p.rating, 1)}</span>

      {showPenalty && (
        <span
          className="shrink-0 tabular-nums text-rose-400/90"
          title={`Penalità popolarità — attuale ${fmt(penaltyNow)}${
            penaltyRises ? `, potenziale fino a ${fmt(penaltyPot)}` : ''
          }`}
        >
          −{fmt(penaltyNow)}
          {penaltyRises && <span className="text-rose-400/60"> ▸ −{fmt(penaltyPot)}</span>}
        </span>
      )}

      <span className="shrink-0 w-10 text-right tabular-nums font-semibold text-ink-1">
        {fmt(p.final_score_now)}
      </span>
    </div>
  )
}
