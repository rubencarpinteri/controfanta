'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toggleSquadPlayerAction, setSquadCoachAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'
import { NationSelect } from '@/components/fm/NationSelect'
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

// Solid-ish role chip — the whole pill is colored, not just the glyph.
const ROLE_TAG: Record<string, string> = {
  P: 'border-role-por/55 bg-role-por/25 text-role-por',
  D: 'border-role-def/55 bg-role-def/25 text-role-def',
  C: 'border-role-mid/55 bg-role-mid/25 text-role-mid',
  A: 'border-role-att/55 bg-role-att/25 text-role-att',
}

const ROLE_ORDER: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 }

// Role tag chip — colored pill (border + tinted fill + bold glyph).
function RoleTag({ role, size = 'md' }: { role: string; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-7 min-w-[30px] text-[13px]' : 'h-6 min-w-[26px] text-[11px]'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border px-1.5 font-bold uppercase ${dims} ${ROLE_TAG[role] ?? 'border-hairline text-ink-3'}`}
    >
      {role}
    </span>
  )
}

// Big, prominent credit value for a player row.
function PriceTag({ value }: { value: number }) {
  return (
    <span className="shrink-0 whitespace-nowrap text-right">
      <span className="mono text-[17px] font-bold tabular-nums text-ink-1">{value > 0 ? value : '—'}</span>
      {value > 0 && <span className="ml-0.5 text-[10px] font-medium text-ink-5">cr</span>}
    </span>
  )
}

type PlayerWithTeam = FMPlayer & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}
type CoachWithTeam = FMCoach & {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}

const PlayerPoolRow = memo(function PlayerPoolRow({
  player,
  price,
  isIn,
  canAdd,
  isReadOnly,
  isPending,
  onToggle,
}: {
  player: PlayerWithTeam
  price: number
  isIn: boolean
  canAdd: boolean
  isReadOnly: boolean
  isPending: boolean
  onToggle: (player: PlayerWithTeam) => void
}) {
  return (
    <button
      onClick={() => onToggle(player)}
      disabled={isReadOnly || isPending || (!isIn && !canAdd)}
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
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-1">{player.name}</span>
      <PriceTag value={price} />
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
})

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
  const [, startTransition] = useTransition()
  const [pendingPlayerIds, setPendingPlayerIds] = useState<Set<string>>(() => new Set())
  const [coachPending, setCoachPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [tab, setTab] = useState<'pool' | 'rosa'>('pool')
  // Listone ordering: by role then name (default), or by price descending.
  const [sortBy, setSortBy] = useState<'role' | 'price'>('role')

  useEffect(() => {
    setSelected(initialSelected)
    setCoachId(initialCoach)
    setSpent(initialSpent)
  }, [initialSelected, initialCoach, initialSpent])

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
        if (sortBy === 'price') {
          const pd = (priceMap.get(b.id) ?? 0) - (priceMap.get(a.id) ?? 0)
          if (pd !== 0) return pd
          return a.name.localeCompare(b.name, 'it')
        }
        const rDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return rDiff !== 0 ? rDiff : a.name.localeCompare(b.name, 'it')
      })
  }, [players, filterTeam, filterRole, filterSearch, sortBy, priceMap])

  const myPlayers = useMemo(() => {
    return players
      .filter((p) => selected.has(p.id))
      .sort((a, b) => {
        const rDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return rDiff !== 0 ? rDiff : a.name.localeCompare(b.name, 'it')
      })
  }, [players, selected])
  const myCoach = coaches.find((c) => c.id === coachId) ?? null

  const roleCounts = useMemo(() => {
    const counts: Record<FMPlayerRole, number> = { P: 0, D: 0, C: 0, A: 0 }
    for (const p of myPlayers) counts[p.role as FMPlayerRole]++
    return counts
  }, [myPlayers])

  const handleToggle = useCallback((player: PlayerWithTeam) => {
    if (isReadOnly) return
    if (pendingPlayerIds.has(player.id)) return
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
    setPendingPlayerIds((prev) => new Set(prev).add(player.id))

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
        setSelected((current) => {
          const reverted = new Set(current)
          if (isIn) {
            reverted.add(player.id)
          } else {
            reverted.delete(player.id)
          }
          return reverted
        })
        setSpent((current) => current + (isIn ? price : -price))
        setError(e instanceof Error ? e.message : 'Errore')
      } finally {
        setPendingPlayerIds((prev) => {
          const nextPending = new Set(prev)
          nextPending.delete(player.id)
          return nextPending
        })
      }
    })
  }, [
    budgetTotal,
    competitionId,
    isReadOnly,
    pendingPlayerIds,
    phase.id,
    poolSize,
    priceMap,
    roleCounts,
    roleQuotas,
    selected,
    spent,
  ])

  function handleCoachChange(newCoachId: string | null) {
    if (isReadOnly) return
    setCoachId(newCoachId)
    setCoachPending(true)
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
      } finally {
        setCoachPending(false)
      }
    })
  }

  const remaining = budgetTotal - spent
  const budgetPct = Math.min(100, (spent / budgetTotal) * 100)
  const budgetBar =
    remaining < 20 ? 'bg-rose-500' : remaining < 50 ? 'bg-amber-500' : 'bg-gradient-to-r from-accent-soft to-accent'
  const remainingText =
    remaining < 20 ? 'text-rose-500' : remaining < 50 ? 'text-amber-500' : 'text-emerald-500'
  const isSaving = pendingPlayerIds.size > 0 || coachPending

  const SORTS: { v: 'role' | 'price'; label: string }[] = [
    { v: 'role', label: 'Ruolo' },
    { v: 'price', label: 'Valore' },
  ]

  // ── Sticky budget bar — shrinks on scroll ──────────────────────────────
  const budgetRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [budgetSticky, setBudgetSticky] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setBudgetSticky(!entry.isIntersecting)
      },
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-3">
      {/* ── Sentinel for sticky budget (watched by IntersectionObserver) ──── */}
      <div ref={sentinelRef} className="h-0" />

      {/* ── Spacer for sticky budget ─────────────────────────────────────── */}
      {budgetSticky && <div style={{ height: budgetRef.current?.offsetHeight ?? 0 }} />}

      {/* ── Budget hero ────────────────────────────────────────────────────── */}
      <div
        ref={budgetRef}

        className={`rounded-2xl border border-hairline bg-glass-2 shadow-1 backdrop-blur-xl transition-all duration-300 ${
          budgetSticky
            ? 'fixed left-1/2 z-40 -translate-x-1/2 px-3 py-2 md:left-[calc(50%+7.5rem)]'
            : 'relative px-4 py-4'
        }`}
        style={{
          width: budgetSticky ? 'min(calc(100vw - 2rem), 42rem)' : '',
          top: budgetSticky ? '0.5rem' : '',
        }}
      >
        <div className={`flex items-end justify-between gap-4 transition-all duration-300 ${
          budgetSticky ? 'mb-1' : 'mb-3'
        }`}>
          <div>
            <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4 transition-all duration-300 ${
              budgetSticky ? 'text-[8px]' : ''
            }`}>Budget speso</p>
            <span className={`mono font-bold leading-none text-ink-1 transition-all duration-300 ${
              budgetSticky ? 'text-[18px]' : 'text-[26px]'
            }`}>{spent}</span>
          </div>
          <div className="text-right">
            <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4 transition-all duration-300 ${
              budgetSticky ? 'text-[8px]' : ''
            }`}>Budget rimasto</p>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className={`mono font-bold leading-none ${remainingText} transition-all duration-300 ${
                budgetSticky ? 'text-[18px]' : 'text-[26px]'
              }`}>{remaining}</span>
              <span className={`mono text-ink-4 transition-all duration-300 ${
                budgetSticky ? 'text-[11px]' : 'text-[13px]'
              }`}>/ {budgetTotal}</span>
            </div>
          </div>
        </div>
        <div className={`overflow-hidden rounded-full bg-hairline-strong transition-all duration-300 ${
          budgetSticky ? 'h-[4px]' : 'h-[7px]'
        }`}>
          <div className={`h-full rounded-full transition-all ${budgetBar}`} style={{ width: `${budgetPct}%` }} />
        </div>
        <div className={`grid grid-cols-4 gap-2 transition-all duration-300 ${
          budgetSticky ? 'mt-1.5' : 'mt-3'
        }`}>
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const count = roleCounts[role]
            const quota = roleQuotas[role]
            const full = count >= quota
            return (
              <div key={role} className={`flex flex-col items-center gap-1 rounded-xl border border-hairline bg-glass-1 transition-all duration-300 ${
                budgetSticky ? 'py-1.5' : 'py-2.5'
              }`}>
                <RoleTag role={role} size={budgetSticky ? 'md' : 'lg'} />
                <p className={`mono font-bold leading-none ${full ? 'text-emerald-500' : 'text-ink-1'} transition-all duration-300 ${
                  budgetSticky ? 'text-[12px]' : 'text-[16px]'
                }`}>
                  {count}<span className="text-ink-5">/{quota}</span>
                </p>
              </div>
            )
          })}
        </div>
        {!isReadOnly && (
          <p className={`mt-2 text-center text-[11px] font-medium transition-colors ${
            isSaving ? 'text-amber-500' : 'text-emerald-500'
          }`}>
            {isSaving ? 'Salvataggio in corso...' : 'Rosa salvata automaticamente'}
          </p>
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
            <NationSelect teams={teams} value={filterTeam} onChange={setFilterTeam} />
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
                      active ? ROLE_TAG[r] : `border-hairline bg-glass-1 ${ROLE_COLORS[r]} opacity-70 hover:opacity-100`
                    }`}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
            {/* Sort toggle — applies to every filter (Tutti, ruolo, nazione) */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Ordina per</span>
              <div className="flex gap-1 rounded-lg border border-hairline bg-glass-1 p-0.5">
                {SORTS.map((s) => (
                  <button
                    key={s.v}
                    onClick={() => setSortBy(s.v)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      sortBy === s.v ? 'bg-glass-3 text-ink-1 shadow-1' : 'text-ink-4 hover:text-ink-2'
                    }`}
                  >
                    {s.label}{s.v === 'price' && sortBy === 'price' ? ' ↓' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Player pool — flows with the page (no nested scroll box) */}
          <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-glass-1">
            {filteredPlayers.map((player) => {
              const price = priceMap.get(player.id) ?? 0
              const isIn = selected.has(player.id)
              const role = player.role as FMPlayerRole
              const roleFull = roleCounts[role] >= roleQuotas[role]
              const canAdd = !isIn && selected.size < poolSize && !roleFull && spent + price <= budgetTotal
              return (
                <PlayerPoolRow
                  key={player.id}
                  player={player}
                  price={price}
                  isIn={isIn}
                  canAdd={canAdd}
                  isReadOnly={isReadOnly}
                  isPending={pendingPlayerIds.has(player.id)}
                  onToggle={handleToggle}
                />
              )
            })}
            {filteredPlayers.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-ink-5">Nessun giocatore trovato</div>
            )}
          </div>
        </>
      )}

      {tab === 'rosa' && (
        <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-glass-1">
          {/* Players grouped by role (first) */}
          {(['P', 'D', 'C', 'A'] as const).map((role) => {
            const rolePlayers = myPlayers.filter((p) => p.role === role)
            if (rolePlayers.length === 0) return null
            return (
              <div key={role}>
                <div className={`flex items-center gap-2 border-b border-hairline px-3.5 py-2 ${ROLE_BG[role]}`}>
                  <span className={`text-[12px] font-bold ${ROLE_COLORS[role]}`}>{role}</span>
                  <span className="text-[11px] text-ink-4">{rolePlayers.length} giocatori</span>
                </div>
                <div className="divide-y divide-hairline">
                  {rolePlayers.map((player) => {
                    const price = priceMap.get(player.id) ?? 0
                    return (
                      <div key={player.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <TeamCrest name={player.fm_national_team.name} logoUrl={player.fm_national_team.logo_url} flagUrl={player.fm_national_team.flag_url} fifaCode={player.fm_national_team.fifa_code} size={22} className="w-6" />
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-1">{player.name}</span>
                        <PriceTag value={price} />
                        {!isReadOnly && (
                          <button
                            onClick={() => handleToggle(player)}
                            disabled={pendingPlayerIds.has(player.id)}
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

          {/* Coach row (after the players) */}
          {myCoach && (
            <div className="flex items-center gap-3 bg-glass-2 px-3.5 py-3">
              <span className="flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-md border border-hairline text-[10px] font-bold uppercase text-ink-4">CT</span>
              <TeamCrest name={myCoach.fm_national_team.name} logoUrl={myCoach.fm_national_team.logo_url} flagUrl={myCoach.fm_national_team.flag_url} fifaCode={myCoach.fm_national_team.fifa_code} size={22} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink-1">{myCoach.name}</span>
              {TIER_BADGE[coachTiers[myCoach.id] ?? ''] && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIER_BADGE[coachTiers[myCoach.id] ?? '']!.cls}`}>
                  {TIER_BADGE[coachTiers[myCoach.id] ?? '']!.short}
                </span>
              )}
            </div>
          )}

          {myPlayers.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-ink-5">
              Nessun giocatore selezionato — vai al <span className="font-semibold text-ink-3">Listone</span> per costruire la rosa
            </div>
          )}
        </div>
      )}

      {/* ── Allenatore selector (after the players) ────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-glass-1 p-4 backdrop-blur-xl">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">Allenatore</p>
        {isReadOnly ? (
          <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {coaches.map((c) => {
              const isSelected = c.id === coachId
              const tier = TIER_BADGE[coachTiers[c.id] ?? '']
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 ${isSelected ? 'bg-accent-muted' : ''}`}
                >
                  <TeamCrest name={c.fm_national_team.name} logoUrl={c.fm_national_team.logo_url} flagUrl={c.fm_national_team.flag_url} fifaCode={c.fm_national_team.fifa_code} size={18} />
                  <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${isSelected ? 'text-accent' : 'text-ink-1'}`}>{c.name}</span>
                  {tier && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tier.cls}`}>{tier.short}</span>
                  )}
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
    </div>
  )
}
