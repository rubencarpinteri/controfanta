'use client'

import { useState, useTransition, useMemo } from 'react'
import { toggleSquadPlayerAction, setSquadCoachAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'
import type { FMPhase, FMNationalTeam, FMPlayer, FMCoach } from '@/types/database.types'
import type { FMRoleQuota, FMPlayerRole } from '@/domain/fantamondiale/config/schema'

const ROLE_COLORS: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}

const ROLE_BG: Record<string, string> = {
  P: 'border-amber-500/40 bg-amber-500/10',
  D: 'border-emerald-500/40 bg-emerald-500/10',
  C: 'border-indigo-500/40 bg-indigo-500/10',
  A: 'border-rose-500/40 bg-rose-500/10',
}

type PlayerWithTeam = FMPlayer & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}
type CoachWithTeam = FMCoach & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}

interface Props {
  competitionId: string
  phase: FMPhase
  teams: FMNationalTeam[]
  players: PlayerWithTeam[]
  coaches: CoachWithTeam[]
  priceMap: Map<string, number>
  selectedPlayerIds: Set<string>
  selectedCoachId: string | null
  budgetTotal: number
  budgetSpent: number
  poolSize: number
  roleQuotas: FMRoleQuota
  isReadOnly: boolean
  isSuperAdmin: boolean
}

export function SquadBuilder({
  competitionId,
  phase,
  teams,
  players,
  coaches,
  priceMap,
  selectedPlayerIds: initialSelected,
  selectedCoachId: initialCoach,
  budgetTotal,
  budgetSpent: initialSpent,
  poolSize,
  roleQuotas,
  isReadOnly,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(initialSelected)
  const [coachId, setCoachId] = useState<string | null>(initialCoach)
  const [spent, setSpent] = useState(initialSpent)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [tab, setTab] = useState<'pool' | 'rosa'>('pool')

  const ROLE_ORDER: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 }

  const filteredPlayers = useMemo(() => {
    return players
      .filter((p) => {
        if (filterTeam && p.national_team_id !== filterTeam) return false
        if (filterRole && p.role !== filterRole) return false
        if (filterSearch) {
          const q = filterSearch.toLowerCase()
          if (!p.name.toLowerCase().includes(q) && !p.fm_national_team.name.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const rDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return rDiff !== 0 ? rDiff : a.name.localeCompare(b.name, 'it')
      })
  }, [players, filterTeam, filterRole, filterSearch])

  const myPlayers = useMemo(() => players.filter((p) => selected.has(p.id)), [players, selected])
  const myCoach = coaches.find((c) => c.id === coachId) ?? null

  const roleCounts = useMemo(() => {
    const counts: Record<FMPlayerRole, number> = { P: 0, D: 0, C: 0, A: 0 }
    for (const p of myPlayers) counts[p.role as FMPlayerRole]++
    return counts
  }, [myPlayers])

  function handleToggle(player: PlayerWithTeam) {
    if (isReadOnly) return
    const price = priceMap.get(player.id) ?? 0
    const isIn = selected.has(player.id)

    if (!isIn && selected.size >= poolSize) {
      setError(`Rosa piena (massimo ${poolSize} giocatori)`)
      return
    }
    if (!isIn) {
      const role = player.role as FMPlayerRole
      if (roleCounts[role] >= roleQuotas[role]) {
        setError(`Quota ${role} piena (${roleQuotas[role]} massimo)`)
        return
      }
    }
    if (!isIn && spent + price > budgetTotal) {
      setError(`Budget insufficiente (rimasti ${budgetTotal - spent} cr)`)
      return
    }

    setError(null)
    const next = new Set(selected)
    if (isIn) {
      next.delete(player.id)
      setSpent((s) => s - price)
    } else {
      next.add(player.id)
      setSpent((s) => s + price)
    }
    setSelected(next)

    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('phase_id', phase.id)
    fd.set('player_id', player.id)
    fd.set('player_price', price.toString())
    fd.set('budget_total', budgetTotal.toString())
    startTransition(async () => {
      try {
        await toggleSquadPlayerAction(fd)
      } catch (e) {
        // Revert optimistic update
        const revert = new Set(selected)
        setSelected(revert)
        setSpent(initialSpent)
        setError(e instanceof Error ? e.message : 'Errore')
      }
    })
  }

  function handleCoachChange(newCoachId: string | null) {
    if (isReadOnly) return
    setCoachId(newCoachId)
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('phase_id', phase.id)
    if (newCoachId) fd.set('coach_id', newCoachId)
    startTransition(async () => {
      try {
        await setSquadCoachAction(fd)
      } catch (e) {
        setCoachId(coachId)
        setError(e instanceof Error ? e.message : 'Errore allenatore')
      }
    })
  }

  const remaining = budgetTotal - spent
  const budgetPct = Math.min(100, (spent / budgetTotal) * 100)
  const budgetColor = remaining < 20 ? 'bg-rose-500' : remaining < 50 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="space-y-3">
      {/* ── Budget bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-ink-4">Budget</span>
          <span className="text-[11px] font-semibold tabular-nums text-ink-1">
            {remaining} cr <span className="font-normal text-ink-5">/ {budgetTotal}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-glass-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${budgetColor}`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const count = roleCounts[role]
            const quota = roleQuotas[role]
            const full = count >= quota
            return (
              <div key={role} className="rounded-lg bg-glass-2 py-1">
                <p className={`text-[10px] font-bold ${ROLE_COLORS[role]}`}>{role}</p>
                <p className={`text-[13px] font-light tabular-nums ${full ? 'text-emerald-400' : 'text-ink-1'}`}>
                  {count}<span className="text-ink-5">/{quota}</span>
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Coach selector ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-4">Allenatore</p>
        {isReadOnly ? (
          <div className="max-h-48 overflow-y-auto divide-y divide-hairline rounded-lg border border-hairline">
            {coaches.map((c) => {
              const isSelected = c.id === coachId
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2.5 px-3 py-2 ${isSelected ? 'bg-indigo-500/10' : ''}`}
                >
                  <TeamCrest name={c.fm_national_team.name} logoUrl={c.fm_national_team.logo_url} flagUrl={c.fm_national_team.flag_url} fifaCode={c.fm_national_team.fifa_code} size={16} />
                  <span className={`flex-1 text-[12px] font-medium truncate ${isSelected ? 'text-indigo-400' : 'text-ink-1'}`}>{c.name}</span>
                  <span className="text-[11px] text-ink-5 shrink-0">{c.fm_national_team.name}</span>
                  {isSelected && <span className="text-[10px] font-semibold text-indigo-400 shrink-0">✓</span>}
                </div>
              )
            })}
            {coaches.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-ink-5">Nessun allenatore disponibile</p>
            )}
          </div>
        ) : (
          <select
            value={coachId ?? ''}
            onChange={(e) => handleCoachChange(e.target.value || null)}
            disabled={pending}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">— Nessun allenatore —</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.fm_national_team.name})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[12px] text-rose-400">
          {error}
        </div>
      )}

      {/* ── Tab toggle ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-hairline bg-glass-1 p-1">
        {(['pool', 'rosa'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${
              tab === t
                ? 'bg-indigo-600 text-white'
                : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            {t === 'pool' ? `Database Giocatori (${filteredPlayers.length})` : `La Mia Rosa (${selected.size}/${poolSize})`}
          </button>
        ))}
      </div>

      {tab === 'pool' && (
        <>
          {/* Filters */}
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Cerca giocatore…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2.5 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-hairline bg-glass-2 px-2 py-2.5 text-[12px] text-ink-1 focus:outline-none"
              >
                <option value="">Tutte le nazioni</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-20 shrink-0 rounded-lg border border-hairline bg-glass-2 px-2 py-2.5 text-[12px] text-ink-1 focus:outline-none"
              >
                <option value="">Ruolo</option>
                {['P', 'D', 'C', 'A'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Player pool */}
          <div className="rounded-xl border border-hairline overflow-hidden">
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-hairline">
              {filteredPlayers.map((player) => {
                const price = priceMap.get(player.id) ?? 0
                const isIn = selected.has(player.id)
                const role = player.role as FMPlayerRole
                const roleFull = roleCounts[role] >= roleQuotas[role]
                const canAdd = !isIn && selected.size < poolSize && !roleFull && spent + price <= budgetTotal
                return (
                  <button
                    key={player.id}
                    onClick={() => handleToggle(player)}
                    disabled={isReadOnly || pending || (!isIn && !canAdd)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isIn
                        ? 'bg-indigo-500/10 hover:bg-indigo-500/15'
                        : canAdd
                        ? 'hover:bg-glass-1'
                        : 'opacity-40'
                    } ${isReadOnly ? 'cursor-default' : ''}`}
                  >
                    <span className={`w-5 shrink-0 text-center text-[10px] font-bold ${ROLE_COLORS[player.role] ?? ''}`}>
                      {player.role}
                    </span>
                    <TeamCrest name={player.fm_national_team.name} logoUrl={player.fm_national_team.logo_url} flagUrl={player.fm_national_team.flag_url} fifaCode={player.fm_national_team.fifa_code} size={18} className="w-6" />
                    <span className="flex-1 text-[13px] font-medium text-ink-1 truncate">{player.name}</span>
                    <span className="text-[11px] tabular-nums text-ink-4 shrink-0">
                      {price > 0 ? `${price} cr` : '—'}
                    </span>
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
              {filteredPlayers.length === 0 && (
                <div className="px-4 py-8 text-center text-[12px] text-ink-5">Nessun giocatore trovato</div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'rosa' && (
        <div className="rounded-xl border border-hairline overflow-hidden">
          {/* Coach row */}
          {myCoach && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-glass-2 border-b border-hairline">
              <span className="w-5 shrink-0 text-center text-[10px] font-bold text-ink-4">CT</span>
              <TeamCrest name={myCoach.fm_national_team.name} logoUrl={myCoach.fm_national_team.logo_url} flagUrl={myCoach.fm_national_team.flag_url} fifaCode={myCoach.fm_national_team.fifa_code} size={18} />
              <span className="flex-1 text-[13px] font-medium text-ink-1">{myCoach.name}</span>
              <span className="text-[11px] text-ink-4">{myCoach.fm_national_team.name}</span>
            </div>
          )}
          {/* Players grouped by role */}
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const rolePlayers = myPlayers.filter((p) => p.role === role)
            if (rolePlayers.length === 0) return null
            return (
              <div key={role}>
                <div className={`flex items-center gap-2 px-4 py-1.5 border-b border-hairline ${ROLE_BG[role]}`}>
                  <span className={`text-[10px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                  <span className="text-[10px] text-ink-4">{rolePlayers.length} giocatori</span>
                </div>
                <div className="divide-y divide-hairline">
                  {rolePlayers.map((player) => {
                    const price = priceMap.get(player.id) ?? 0
                    return (
                      <div key={player.id} className="flex items-center gap-3 px-4 py-2">
                        <TeamCrest name={player.fm_national_team.name} logoUrl={player.fm_national_team.logo_url} flagUrl={player.fm_national_team.flag_url} fifaCode={player.fm_national_team.fifa_code} size={18} className="w-6" />
                        <span className="flex-1 text-[13px] font-medium text-ink-1 truncate">{player.name}</span>
                        <span className="text-[11px] tabular-nums text-ink-4 shrink-0">
                          {price > 0 ? `${price} cr` : '—'}
                        </span>
                        {!isReadOnly && (
                          <button
                            onClick={() => handleToggle(player)}
                            disabled={pending}
                            className="h-6 w-6 shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {myPlayers.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-ink-5">
              Nessun giocatore selezionato — vai al Pool per scegliere la tua rosa
            </div>
          )}
        </div>
      )}
    </div>
  )
}
