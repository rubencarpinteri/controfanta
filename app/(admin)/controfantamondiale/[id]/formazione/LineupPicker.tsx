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
  allowedFormations,
  isReadOnly,
}: Props) {
  const [formation, setFormation] = useState(allowedFormations[0] ?? '4-3-3')
  const [lineup, setLineup] = useState<Set<string>>(initialLineup)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const required = useMemo(() => parseFormation(formation), [formation])

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

  function togglePlayer(player: Player) {
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
    isIn ? next.delete(player.id) : next.add(player.id)
    setLineup(next)
  }

  function handleSave() {
    if (!fantasyTeamId) return
    const starterIds = Array.from(lineup)
    if (starterIds.length !== 11) {
      setError(`Seleziona esattamente 11 giocatori (selezionati: ${starterIds.length})`)
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('round_id', roundId)
    fd.set('fantasy_team_id', fantasyTeamId)
    fd.set('formation', formation)
    for (const pid of starterIds) fd.append('starter_ids', pid)
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
              disabled={!isComplete || pending}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                saved
                  ? 'bg-emerald-600/80 text-white'
                  : isComplete
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

      {/* Role sections */}
      {(['P', 'D', 'C', 'A'] as const).map((role) => {
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
                const roleCount = lineupByRole[role]?.length ?? 0
                const canAdd = !isIn && lineup.size < 11 && roleCount < roleRequired
                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player)}
                    disabled={isReadOnly || pending || (!isIn && !canAdd)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isIn
                        ? 'bg-indigo-500/10 hover:bg-indigo-500/15'
                        : canAdd
                        ? 'hover:bg-glass-1'
                        : 'opacity-40'
                    } ${isReadOnly ? 'cursor-default' : ''}`}
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
                    <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isIn ? 'border-indigo-500 bg-indigo-500' : 'border-ink-5'
                    }`}>
                      {isIn && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
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
