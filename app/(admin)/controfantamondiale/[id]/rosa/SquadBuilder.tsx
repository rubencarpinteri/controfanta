'use client'

import { useState, useTransition, useMemo } from 'react'
import { toggleSquadPlayerAction, setSquadCoachAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'
import type { FMPhase, FMNationalTeam, FMPlayer, FMCoach } from '@/types/database.types'
import type { FMRoleQuota, FMPlayerRole } from '@/domain/fantamondiale/config/schema'

// Mantra role tints — semantic tokens that flip with the theme (see globals.css).
// P→portiere(gold) D→difesa(blue) C→centrocampo(teal) A→attacco(red).
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

// Role tag chip — currentColor trick: role tint drives border + tinted bg + text.
function RoleTag({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-md border px-1.5 text-[11px] font-bold uppercase ${ROLE_BG[role] ?? ''} ${ROLE_COLORS[role] ?? 'text-ink-3'}`}
    >
      {role}
    </span>
  )
}

type PlayerWithTeam = FMPlayer & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}
type CoachWithTeam = FMCoach & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}

// Frozen competition-level coach tiers (see Allenatori admin page).
const TIER_BADGE: Record<string, { short: string; cls: string }> = {
  tier_1: { short: 'T1', cls: 'text-indigo-400 bg-indigo-400/10' },
  tier_2: { short: 'T2', cls: 'text-emerald-400 bg-emerald-400/10' },
  tier_3: { short: 'T3', cls: 'text-amber-400 bg-amber-400/10' },
  tier_4: { short: 'T4', cls: 'text-rose-400 bg-rose-400/10' },
}

interface Props {
  competitionId: string
  phase: FMPhase
  teams: FMNationalTeam[]
  players: PlayerWithTeam[]
  coaches: CoachWithTeam[]
  coachTiers: Record<string, string>
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
  coachTiers,
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
  const budgetBar =
    remaining < 20 ? 'bg-rose-500' : remaining < 50 ? 'bg-amber-500' : 'bg-gradient-to-r from-accent-soft to-accent'
  const remainingText =
    remaining < 20 ? 'text-rose-500' : remaining < 50 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="space-y-3">
      {/* ── Budget hero ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-glass-2 p-4 shadow-1 backdrop-blur-xl">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">Budget</p>
            <div className="flex items-baseline gap-1.5">
              <span className="mono text-[26px] font-bold leading-none text-ink-1">{spent}</span>
              <span className="mono text-[15px] text-ink-4">/ {budgetTotal}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">Rimangono</p>
            <span className={`mono text-[22px] font-bold leading-none ${remainingText}`}>{remaining}</span>
          </div>
        </div>
        <div className="h-[7px] overflow-hidden rounded-full bg-hairline-strong">
          <div className={`h-full rounded-full transition-all ${budgetBar}`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const count = roleCounts[role]
            const quota = roleQuotas[role]
            const full = count >= quota
            return (
              <div key={role} className="rounded-xl border border-hairline bg-glass-1 py-2">
                <p className={`text-[11px] font-bold ${ROLE_COLORS[role]}`}>{role}</p>
                <p className={`mono mt-0.5 text-[15px] font-semibold ${full ? 'text-emerald-500' : 'text-ink-1'}`}>
                  {count}<span className="text-ink-5">/{quota}</span>
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Coach selector ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-glass-1 p-4 backdrop-blur-xl">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">Allenatore</p>
        {isReadOnly ? (
          <div className="max-h-56 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
            {coaches.map((c) => {
              const isSelected = c.id === coachId
              const tier = TIER_BADGE[coachTiers[c.id] ?? '']
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 ${isSelected ? 'bg-accent-muted' : ''}`}
                >
                  <TeamCrest name={c.fm_national_team.name} logoUrl={c.fm_national_team.logo_url} flagUrl={c.fm_national_team.flag_url} fifaCode={c.fm_national_team.fifa_code} size={18} />
                  <span className={`flex-1 truncate text-[14px] font-medium ${isSelected ? 'text-accent' : 'text-ink-1'}`}>{c.name}</span>
                  {tier && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tier.cls}`}>{tier.short}</span>
                  )}
                  <span className="shrink-0 text-[12px] text-ink-5">{c.fm_national_team.name}</span>
                  {isSelected && <span className="shrink-0 text-[11px] font-semibold text-accent">✓</span>}
                </div>
              )
            })}
            {coaches.length === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-ink-5">Nessun allenatore disponibile</p>
            )}
          </div>
        ) : (
          <select
            value={coachId ?? ''}
            onChange={(e) => handleCoachChange(e.target.value || null)}
            disabled={pending}
            className="w-full rounded-xl border border-hairline-strong bg-glass-2 px-3 py-3 text-[16px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo"
          >
            <option value="">— Nessun allenatore —</option>
            {coaches.map((c) => {
              const tier = TIER_BADGE[coachTiers[c.id] ?? '']
              return (
                <option key={c.id} value={c.id}>
                  {tier ? `[${tier.short}] ` : ''}{c.name} ({c.fm_national_team.name})
                </option>
              )
            })}
          </select>
        )}
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] font-medium text-rose-500">
          {error}
        </div>
      )}

      {/* ── Pool / Rosa segmented control ──────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-hairline bg-glass-1 p-1">
        {(['pool', 'rosa'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
              tab === t ? 'bg-glass-3 text-ink-1 shadow-1' : 'text-ink-4 hover:text-ink-2'
            }`}
          >
            {t === 'pool' ? `Listone · ${filteredPlayers.length}` : `La mia rosa · ${selected.size}/${poolSize}`}
          </button>
        ))}
      </div>

      {tab === 'pool' && (
        <>
          {/* Filters */}
          <div className="space-y-2.5">
            <input
              type="text"
              placeholder="Cerca per nome o nazione…"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full rounded-xl border border-hairline-strong bg-glass-2 px-4 py-3 text-[16px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo"
            />
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-hairline-strong bg-glass-2 px-3 py-3 text-[16px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo"
            >
              <option value="">Tutte le nazioni</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {/* Role chips */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterRole('')}
                className={`flex-1 rounded-lg border py-2 text-[13px] font-semibold transition-colors ${
                  filterRole === '' ? 'border-transparent bg-accent text-white' : 'border-hairline bg-glass-1 text-ink-3 hover:text-ink-1'
                }`}
              >
                Tutti
              </button>
              {(['P', 'D', 'C', 'A'] as const).map((r) => {
                const active = filterRole === r
                return (
                  <button
                    key={r}
                    onClick={() => setFilterRole(active ? '' : r)}
                    className={`flex-1 rounded-lg border py-2 text-[13px] font-bold transition-colors ${
                      active ? `${ROLE_BG[r]} ${ROLE_COLORS[r]}` : `border-hairline bg-glass-1 ${ROLE_COLORS[r]} opacity-70 hover:opacity-100`
                    }`}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Player pool */}
          <div className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
            <div className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
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
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                      isIn
                        ? 'bg-accent-muted hover:bg-accent-muted'
                        : canAdd
                        ? 'hover:bg-glass-2'
                        : 'opacity-40'
                    } ${isReadOnly ? 'cursor-default' : ''}`}
                  >
                    <RoleTag role={player.role} />
                    <TeamCrest name={player.fm_national_team.name} logoUrl={player.fm_national_team.logo_url} flagUrl={player.fm_national_team.flag_url} fifaCode={player.fm_national_team.fifa_code} size={22} className="w-6" />
                    <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-1">{player.name}</span>
                    <span className="mono shrink-0 text-[13px] font-semibold text-ink-3">
                      {price > 0 ? `${price}` : '—'}
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isIn ? 'border-accent bg-accent' : 'border-ink-5'
                    }`}>
                      {isIn && (
                        <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
                )
              })}
              {filteredPlayers.length === 0 && (
                <div className="px-4 py-10 text-center text-[13px] text-ink-5">Nessun giocatore trovato</div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'rosa' && (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
          {/* Coach row */}
          {myCoach && (
            <div className="flex items-center gap-3 border-b border-hairline bg-glass-2 px-3.5 py-3">
              <span className="flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-md border border-hairline text-[10px] font-bold uppercase text-ink-4">CT</span>
              <TeamCrest name={myCoach.fm_national_team.name} logoUrl={myCoach.fm_national_team.logo_url} flagUrl={myCoach.fm_national_team.flag_url} fifaCode={myCoach.fm_national_team.fifa_code} size={22} />
              <span className="flex-1 text-[14.5px] font-semibold text-ink-1">{myCoach.name}</span>
              {TIER_BADGE[coachTiers[myCoach.id] ?? ''] && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIER_BADGE[coachTiers[myCoach.id] ?? '']!.cls}`}>
                  {TIER_BADGE[coachTiers[myCoach.id] ?? '']!.short}
                </span>
              )}
              <span className="shrink-0 text-[12px] text-ink-4">{myCoach.fm_national_team.name}</span>
            </div>
          )}
          {/* Players grouped by role */}
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const rolePlayers = myPlayers.filter((p) => p.role === role)
            if (rolePlayers.length === 0) return null
            return (
              <div key={role}>
                <div className={`flex items-center gap-2 border-b border-hairline px-3.5 py-2 ${ROLE_BG[role]}`}>
                  <span className={`text-[11px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                  <span className="text-[11px] text-ink-4">{rolePlayers.length} giocatori</span>
                </div>
                <div className="divide-y divide-hairline">
                  {rolePlayers.map((player) => {
                    const price = priceMap.get(player.id) ?? 0
                    return (
                      <div key={player.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <TeamCrest name={player.fm_national_team.name} logoUrl={player.fm_national_team.logo_url} flagUrl={player.fm_national_team.flag_url} fifaCode={player.fm_national_team.fifa_code} size={22} className="w-6" />
                        <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-1">{player.name}</span>
                        <span className="mono shrink-0 text-[13px] font-semibold text-ink-3">
                          {price > 0 ? `${price}` : '—'}
                        </span>
                        {!isReadOnly && (
                          <button
                            onClick={() => handleToggle(player)}
                            disabled={pending}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-500 transition-colors hover:bg-rose-500/20"
                          >
                            <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
            <div className="px-4 py-10 text-center text-[13px] text-ink-5">
              Nessun giocatore selezionato — vai al <span className="font-semibold text-ink-3">Listone</span> per costruire la rosa
            </div>
          )}
        </div>
      )}
    </div>
  )
}
