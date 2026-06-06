'use client'

import { useState, useTransition, useMemo } from 'react'
import { saveLineupAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'

// Semantic Mantra role tints (flip with theme) — see globals.css.
const ROLE_COLORS: Record<string, string> = {
  P: 'text-role-por',
  D: 'text-role-def',
  C: 'text-role-mid',
  A: 'text-role-att',
}

const ROLE_BG: Record<string, string> = {
  P: 'border-role-por/40 bg-role-por/10',
  D: 'border-role-def/40 bg-role-def/10',
  C: 'border-role-mid/40 bg-role-mid/10',
  A: 'border-role-att/40 bg-role-att/10',
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
      <div className="sticky top-[44px] z-10 -mx-4 border-b border-hairline bg-surface-0/90 px-4 py-2 backdrop-blur-lg sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <select
            value={formation}
            onChange={(e) => { setFormation(e.target.value); setLineup(new Set()); setSaved(false) }}
            disabled={isReadOnly || pending}
            className="mono flex-1 rounded-xl border border-hairline-strong bg-glass-2 px-3 py-3 text-[16px] font-semibold text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo"
          >
            {allowedFormations.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <span className={`mono shrink-0 text-[14px] font-bold tabular-nums ${isComplete ? 'text-emerald-500' : 'text-ink-4'}`}>
            {lineupCount}/11
          </span>
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={!canSave || pending}
              className={`shrink-0 rounded-xl px-4 py-3 text-[14px] font-semibold transition-all active:translate-y-px ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : canSave
                  ? 'bg-gradient-to-b from-accent-soft to-accent text-white shadow-1'
                  : 'cursor-not-allowed bg-glass-2 text-ink-4'
              }`}
            >
              {saved ? 'Salvata ✓' : pending ? '…' : 'Salva'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] font-medium text-rose-500">
          {error}
        </div>
      )}

      {/* Bench summary — disclosure + role-minimum status */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
        <div className="flex items-center gap-2 border-b border-hairline bg-glass-2 px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-2">Panchina</span>
          <span className="flex-1 text-[11px] text-ink-4">
            almeno 1 per ruolo · pubblica al 1° calcio d&apos;inizio
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${benchRoleComplete ? 'text-emerald-500' : 'text-amber-500'}`}>
            {bench.length} in panchina
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-2.5">
          {ROLE_ORDER.map((r) => {
            const ok = (benchRoleCounts[r] ?? 0) >= 1
            return (
              <span
                key={r}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-semibold tabular-nums ${
                  ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                }`}
              >
                <span className={`font-bold ${ROLE_COLORS[r]}`}>{r}</span>{benchRoleCounts[r] ?? 0}
              </span>
            )
          })}
        </div>
        {bench.length === 0 ? (
          <div className="px-4 py-3.5 text-[12.5px] text-ink-5">
            Nessuna riserva. Aggiungi giocatori dalle sezioni qui sotto (pulsante &quot;Panchina&quot;).
          </div>
        ) : (
          <ol className="divide-y divide-hairline">
            {bench.map((id, i) => {
              const p = playerById.get(id)
              if (!p) return null
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="mono w-5 text-[13px] font-bold tabular-nums text-ink-4">{i + 1}</span>
                  <span className={`text-[11px] font-bold ${ROLE_COLORS[p.role]}`}>{p.role}</span>
                  <TeamCrest
                    name={p.fm_national_team.name}
                    logoUrl={p.fm_national_team.logo_url}
                    flagUrl={p.fm_national_team.flag_url}
                    fifaCode={p.fm_national_team.fifa_code}
                    size={18}
                    className="w-5"
                  />
                  <span className="flex-1 truncate text-[14px] font-semibold text-ink-1">{p.name}</span>
                  {!isReadOnly && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => moveBench(id, -1)}
                        disabled={i === 0}
                        className="h-7 w-7 rounded-md border border-hairline text-ink-3 hover:bg-glass-2 disabled:opacity-30"
                        aria-label="Su"
                      >↑</button>
                      <button
                        onClick={() => moveBench(id, 1)}
                        disabled={i === bench.length - 1}
                        className="h-7 w-7 rounded-md border border-hairline text-ink-3 hover:bg-glass-2 disabled:opacity-30"
                        aria-label="Giù"
                      >↓</button>
                      <button
                        onClick={() => p && toggleBench(p)}
                        className="h-7 w-7 rounded-md border border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
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
          <div key={role} className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
            <div className={`flex items-center gap-2 border-b border-hairline px-4 py-2 ${ROLE_BG[role]}`}>
              <span className={`text-[11px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
              <span className="flex-1 text-[11px] text-ink-4">{rolePlayers.length} in rosa</span>
              <span className={`mono text-[12px] font-semibold tabular-nums ${
                roleSelected === roleRequired ? 'text-emerald-500' : 'text-ink-4'
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
                        ? 'bg-accent-muted'
                        : isBenched
                        ? 'bg-glass-2'
                        : ''
                    }`}
                  >
                    <TeamCrest
                      name={player.fm_national_team.name}
                      logoUrl={player.fm_national_team.logo_url}
                      flagUrl={player.fm_national_team.flag_url}
                      fifaCode={player.fm_national_team.fifa_code}
                      size={22}
                      className="w-6"
                    />
                    <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-1">{player.name}</span>
                    <span className="mono shrink-0 text-[12px] text-ink-4">{player.fm_national_team.fifa_code}</span>
                    {!isReadOnly && !isIn && (
                      <button
                        onClick={() => toggleBench(player)}
                        className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                          isBenched
                            ? 'border-accent/40 bg-accent-muted text-accent'
                            : 'border-hairline text-ink-4 hover:bg-glass-2'
                        }`}
                      >
                        {isBenched ? `Panch. ${bench.indexOf(player.id) + 1}` : 'Panchina'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleStarter(player)}
                      disabled={isReadOnly || pending || (!isIn && !canAdd)}
                      className={`flex h-8 shrink-0 items-center justify-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                        isIn
                          ? 'border-accent bg-accent text-white'
                          : canAdd
                          ? 'border-hairline text-ink-3 hover:bg-glass-2'
                          : 'cursor-not-allowed border-hairline text-ink-5 opacity-40'
                      }`}
                      aria-label={isIn ? 'Rimuovi titolare' : 'Aggiungi titolare'}
                    >
                      {isIn ? 'Titolare ✓' : 'Titolare'}
                    </button>
                  </div>
                )
              })}
              {rolePlayers.length === 0 && (
                <div className="px-4 py-3.5 text-[12.5px] text-ink-5">Nessun {role} nella rosa</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
