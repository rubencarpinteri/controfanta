'use client'

import { useState, useTransition, useMemo } from 'react'
import { saveLineupAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'

const ROLE_COLORS: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}

const ROLE_ORDER = ['P', 'D', 'C', 'A'] as const

// Parse formation string like "4-3-3" into role counts { P:1, D:4, C:3, A:3 }
function parseFormation(f: string) {
  const parts = f.split('-').map(Number)
  return {
    P: 1,
    D: parts[0] ?? 4,
    C: parts[1] ?? 3,
    A: parts[2] ?? 3,
  }
}

interface Player {
  id: string
  name: string
  role: string
  fm_national_team: { name: string; fifa_code: string; flag_emoji: string | null; logo_url: string | null; flag_url: string | null }
}

interface Props {
  competitionId: string
  roundId: string
  fantasyTeamId: string | null
  players: Player[]
  selectedLineupIds: Set<string>
  initialBenchIds: string[]
  initialFormation: string | null
  lineupId: string | null
  allowedFormations: string[]
  isReadOnly: boolean
}

export function LineupPicker({
  competitionId,
  roundId,
  fantasyTeamId,
  players,
  selectedLineupIds: initialLineup,
  initialBenchIds,
  initialFormation,
  allowedFormations,
  isReadOnly,
}: Props) {
  const [formation, setFormation] = useState(
    initialFormation && allowedFormations.includes(initialFormation)
      ? initialFormation
      : allowedFormations[0] ?? '4-3-3'
  )
  const [lineup, setLineup] = useState<Set<string>>(initialLineup)
  const [bench, setBench] = useState<string[]>(initialBenchIds)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const required = useMemo(() => parseFormation(formation), [formation])

  const playerById = useMemo(() => {
    const m = new Map<string, Player>()
    for (const p of players) m.set(p.id, p)
    return m
  }, [players])

  const byRole = useMemo(() => {
    const groups: Record<string, Player[]> = { P: [], D: [], C: [], A: [] }
    for (const p of players) {
      ;(groups[p.role] ?? (groups['A'] = [])).push(p)
    }
    return groups
  }, [players])

  const lineupByRole = useMemo(() => {
    const groups: Record<string, Player[]> = { P: [], D: [], C: [], A: [] }
    for (const p of players) {
      if (lineup.has(p.id)) (groups[p.role] ?? (groups['A'] = [])).push(p)
    }
    return groups
  }, [players, lineup])

  const benchSet = useMemo(() => new Set(bench), [bench])

  const benchRoleCounts = useMemo(() => {
    const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
    for (const id of bench) {
      const role = playerById.get(id)?.role
      if (role && role in counts) counts[role] = (counts[role] ?? 0) + 1
    }
    return counts
  }, [bench, playerById])

  const benchRoleComplete = ROLE_ORDER.every((r) => (benchRoleCounts[r] ?? 0) >= 1)

  function toggleStarter(player: Player) {
    if (isReadOnly) return
    const isIn = lineup.has(player.id)
    const role = player.role as 'P' | 'D' | 'C' | 'A'
    const roleCount = lineupByRole[role]?.length ?? 0
    const roleRequired = required[role] ?? 0

    if (!isIn) {
      if (lineup.size >= 11) {
        setError('Hai già 11 titolari')
        return
      }
      if (roleCount >= roleRequired) {
        setError(`Hai già ${roleRequired} ${role} nella formazione ${formation}`)
        return
      }
    }
    setError(null)
    setSaved(false)
    const next = new Set(lineup)
    if (isIn) {
      next.delete(player.id)
    } else {
      next.add(player.id)
      // A starter can't simultaneously sit on the bench.
      if (benchSet.has(player.id)) setBench((b) => b.filter((id) => id !== player.id))
    }
    setLineup(next)
  }

  function toggleBench(player: Player) {
    if (isReadOnly) return
    if (lineup.has(player.id)) return // starters can't be benched
    setError(null)
    setSaved(false)
    setBench((b) => (b.includes(player.id) ? b.filter((id) => id !== player.id) : [...b, player.id]))
  }

  function moveBench(id: string, dir: -1 | 1) {
    if (isReadOnly) return
    setSaved(false)
    setBench((b) => {
      const i = b.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= b.length) return b
      const next = [...b]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  function handleSave() {
    if (!fantasyTeamId) return
    const starterIds = Array.from(lineup)
    if (starterIds.length !== 11) {
      setError(`Seleziona esattamente 11 titolari (selezionati: ${starterIds.length})`)
      return
    }
    if (!benchRoleComplete) {
      const missing = ROLE_ORDER.filter((r) => (benchRoleCounts[r] ?? 0) < 1)
      setError(`La panchina deve avere almeno un giocatore per ruolo. Manca: ${missing.join(', ')}`)
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('round_id', roundId)
    fd.set('fantasy_team_id', fantasyTeamId)
    fd.set('formation', formation)
    for (const pid of starterIds) fd.append('starter_ids', pid)
    for (const pid of bench) fd.append('bench_ids', pid)
    startTransition(async () => {
      try {
        await saveLineupAction(fd)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore nel salvataggio')
      }
    })
  }

  const lineupCount = lineup.size
  const isComplete = lineupCount === 11
  const canSave = isComplete && benchRoleComplete

  return (
    <div className="space-y-3">
      {/* Formation selector + save bar — sticky on mobile */}
      <div className="sticky top-[44px] z-10 -mx-4 px-4 py-2 bg-surface-0/90 backdrop-blur-lg border-b border-hairline sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
        <div className="flex items-center gap-2">
          <select
            value={formation}
            onChange={(e) => { setFormation(e.target.value); setLineup(new Set()); setSaved(false) }}
            disabled={isReadOnly || pending}
            className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2.5 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {allowedFormations.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <span className={`text-[12px] tabular-nums font-semibold shrink-0 ${isComplete ? 'text-emerald-400' : 'text-ink-4'}`}>
            {lineupCount}/11
          </span>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={!canSave || pending}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                saved
                  ? 'bg-emerald-600/80 text-white'
                  : canSave
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-glass-2 text-ink-4 cursor-not-allowed'
              }`}
            >
              {saved ? 'Salvata ✓' : pending ? '…' : 'Salva'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[12px] text-rose-400">
          {error}
        </div>
      )}

      {/* Bench summary — disclosure + role-minimum status */}
      <div className="rounded-xl border border-hairline overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-glass-2 border-b border-hairline">
          <span className="text-[10px] font-bold text-ink-2 uppercase tracking-wider">Panchina</span>
          <span className="flex-1 text-[10px] text-ink-4">
            almeno 1 per ruolo · resa pubblica al primo calcio d&apos;inizio
          </span>
          <span className={`text-[10px] font-semibold tabular-nums ${benchRoleComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
            {bench.length} in panchina
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-hairline">
          {ROLE_ORDER.map((r) => {
            const ok = (benchRoleCounts[r] ?? 0) >= 1
            return (
              <span
                key={r}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                <span className={ROLE_COLORS[r]}>{r}</span>{benchRoleCounts[r] ?? 0}
              </span>
            )
          })}
        </div>
        {bench.length === 0 ? (
          <div className="px-4 py-3 text-[11px] text-ink-5">
            Nessuna riserva. Aggiungi giocatori dalle sezioni qui sotto (pulsante &quot;Panchina&quot;).
          </div>
        ) : (
          <ol className="divide-y divide-hairline">
            {bench.map((id, i) => {
              const p = playerById.get(id)
              if (!p) return null
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 text-[12px] font-bold tabular-nums text-ink-4">{i + 1}</span>
                  <span className={`text-[10px] font-bold ${ROLE_COLORS[p.role]}`}>{p.role}</span>
                  <TeamCrest
                    name={p.fm_national_team.name}
                    logoUrl={p.fm_national_team.logo_url}
                    flagUrl={p.fm_national_team.flag_url}
                    fifaCode={p.fm_national_team.fifa_code}
                    size={16}
                    className="w-5"
                  />
                  <span className="flex-1 text-[13px] font-medium text-ink-1 truncate">{p.name}</span>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveBench(id, -1)}
                        disabled={i === 0}
                        className="h-6 w-6 rounded border border-hairline text-ink-3 disabled:opacity-30 hover:bg-glass-1"
                        aria-label="Su"
                      >↑</button>
                      <button
                        onClick={() => moveBench(id, 1)}
                        disabled={i === bench.length - 1}
                        className="h-6 w-6 rounded border border-hairline text-ink-3 disabled:opacity-30 hover:bg-glass-1"
                        aria-label="Giù"
                      >↓</button>
                      <button
                        onClick={() => p && toggleBench(p)}
                        className="h-6 w-6 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                        aria-label="Rimuovi"
                      >×</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {/* Role sections */}
      {ROLE_ORDER.map((role) => {
        const rolePlayers = byRole[role] ?? []
        const roleRequired = required[role] ?? 0
        const roleSelected = lineupByRole[role]?.length ?? 0

        return (
          <div key={role} className="rounded-xl border border-hairline overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-glass-2 border-b border-hairline">
              <span className={`text-[10px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
              <span className="flex-1 text-[10px] text-ink-4">{rolePlayers.length} in rosa</span>
              <span className={`text-[10px] font-semibold tabular-nums ${
                roleSelected === roleRequired ? 'text-emerald-400' : 'text-ink-4'
              }`}>
                {roleSelected}/{roleRequired}
              </span>
            </div>
            <div className="divide-y divide-hairline">
              {rolePlayers.map((player) => {
                const isIn = lineup.has(player.id)
                const isBenched = benchSet.has(player.id)
                const roleCount = lineupByRole[role]?.length ?? 0
                const canAdd = !isIn && lineup.size < 11 && roleCount < roleRequired
                return (
                  <div
                    key={player.id}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isIn
                        ? 'bg-indigo-500/10'
                        : isBenched
                        ? 'bg-glass-1'
                        : ''
                    }`}
                  >
                    <TeamCrest
                      name={player.fm_national_team.name}
                      logoUrl={player.fm_national_team.logo_url}
                      flagUrl={player.fm_national_team.flag_url}
                      fifaCode={player.fm_national_team.fifa_code}
                      size={18}
                      className="w-6"
                    />
                    <span className="flex-1 text-[13px] font-medium text-ink-1 truncate">{player.name}</span>
                    <span className="text-[11px] text-ink-4 shrink-0">{player.fm_national_team.fifa_code}</span>
                    {!isReadOnly && !isIn && (
                      <button
                        onClick={() => toggleBench(player)}
                        className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                          isBenched
                            ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                            : 'border-hairline text-ink-4 hover:bg-glass-1'
                        }`}
                      >
                        {isBenched ? `Panchina ${bench.indexOf(player.id) + 1}` : 'Panchina'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleStarter(player)}
                      disabled={isReadOnly || pending || (!isIn && !canAdd)}
                      className={`shrink-0 h-7 px-2 rounded-md border text-[10px] font-semibold flex items-center justify-center transition-colors ${
                        isIn
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : canAdd
                          ? 'border-hairline text-ink-3 hover:bg-glass-1'
                          : 'border-hairline text-ink-5 opacity-40 cursor-not-allowed'
                      }`}
                      aria-label={isIn ? 'Rimuovi titolare' : 'Aggiungi titolare'}
                    >
                      {isIn ? 'Titolare ✓' : 'Titolare'}
                    </button>
                  </div>
                )
              })}
              {rolePlayers.length === 0 && (
                <div className="px-4 py-3 text-[11px] text-ink-5">Nessun {role} nella rosa</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
