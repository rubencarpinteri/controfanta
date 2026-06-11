'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { saveLineupAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'

// Semantic Mantra role tints (flip with theme) — see globals.css.
const ROLE_COLORS: Record<string, string> = {
  P: 'text-role-por',
  D: 'text-role-def',
  C: 'text-role-mid',
  A: 'text-role-att',
}

// CSS-var equivalents for inline styling (pitch dots, accents).
const ROLE_VAR: Record<string, string> = {
  P: 'var(--color-role-por)',
  D: 'var(--color-role-def)',
  C: 'var(--color-role-mid)',
  A: 'var(--color-role-att)',
}

const ROLE_LABEL: Record<string, string> = { P: 'POR', D: 'DIF', C: 'CEN', A: 'ATT' }
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

interface Slot {
  id: string
  role: 'P' | 'D' | 'C' | 'A'
  index: number
}

// Build the ordered starter slots for a formation: GK first, then D, C, A.
function buildSlots(formation: string): Slot[] {
  const counts = parseFormation(formation)
  const slots: Slot[] = []
  for (const role of ROLE_ORDER) {
    const n = counts[role] ?? 0
    for (let i = 0; i < n; i++) slots.push({ id: `${role}${i}`, role, index: i })
  }
  return slots
}

function surname(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1]! : name
}

interface Player {
  id: string
  name: string
  role: string
  national_team_id: string
  fm_national_team: { name: string; fifa_code: string; flag_emoji: string | null; logo_url: string | null; flag_url: string | null }
}

export interface NextMatch {
  opponent: string
  fifaCode: string
  logoUrl: string | null
  flagUrl: string | null
  home: boolean
  kickoff: string
}

// "ven 14 giu · 21:00" — compact Italian kickoff label.
function formatKickoff(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
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
  nextMatchByTeam: Record<string, NextMatch>
  priceById: Record<string, number>
}

// Warn before leaving with an unsaved lineup in progress (≥1 starter placed
// but not yet schierata). Covers browser tab close/refresh (generic native
// prompt) and in-app link navigation (custom Italian confirm).
function useUnsavedGuard(active: boolean) {
  useEffect(() => {
    if (!active) return
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.target === '_blank') return
      // Same-page anchors / current URL → not a navigation away.
      if (href === window.location.pathname) return
      if (!window.confirm('Formazione non schierata. Sicuro di uscire?')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [active])
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
  nextMatchByTeam,
  priceById,
}: Props) {
  const playerById = useMemo(() => {
    const m = new Map<string, Player>()
    for (const p of players) m.set(p.id, p)
    return m
  }, [players])

  const priceOf = (id: string) => priceById[id] ?? 0

  // Group by role, each group ordered by crediti value (high → low).
  const byRole = useMemo(() => {
    const groups: Record<string, Player[]> = { P: [], D: [], C: [], A: [] }
    for (const p of players) (groups[p.role] ?? (groups['A'] ??= [])).push(p)
    for (const r of ROLE_ORDER) groups[r]?.sort((a, b) => priceOf(b.id) - priceOf(a.id))
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, priceById])

  const startFormation =
    initialFormation && allowedFormations.includes(initialFormation)
      ? initialFormation
      : allowedFormations[0] ?? '4-3-3'

  // Seed the slot→player assignment from the persisted starter set, filling
  // each role's slots in squad order.
  const seedAssign = useMemo(() => {
    const slots = buildSlots(startFormation)
    const pool: Record<string, string[]> = { P: [], D: [], C: [], A: [] }
    for (const p of players) if (initialLineup.has(p.id)) pool[p.role]?.push(p.id)
    const a: Record<string, string> = {}
    for (const s of slots) {
      const next = pool[s.role]?.shift()
      if (next) a[s.id] = next
    }
    return a
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drop any persisted bench ids no longer in the current squad (e.g. a player
  // removed from the rosa after a prior save). Otherwise the stale id — invisible
  // in the UI since it's not in `players` — would be submitted and rejected
  // server-side with "...non è nella tua rosa". Starters are already filtered via
  // seedAssign; the bench needs the same guard.
  const seedBench = useMemo(
    () => initialBenchIds.filter((id) => playerById.has(id)),
    [initialBenchIds, playerById]
  )

  const [formation, setFormation] = useState(startFormation)
  const [assign, setAssign] = useState<Record<string, string>>(seedAssign)
  const [bench, setBench] = useState<string[]>(seedBench)
  const [view, setView] = useState<'pitch' | 'list'>('pitch')
  const [picker, setPicker] = useState<{ slot: Slot } | { bench: true; role?: 'P' | 'D' | 'C' | 'A' } | null>(null)
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const slots = useMemo(() => buildSlots(formation), [formation])
  const starterIds = useMemo(() => Object.values(assign).filter(Boolean), [assign])
  const starterSet = useMemo(() => new Set(starterIds), [starterIds])
  const benchSet = useMemo(() => new Set(bench), [bench])
  const filled = starterIds.length

  const benchRoleCounts = useMemo(() => {
    const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 }
    for (const id of bench) {
      const role = playerById.get(id)?.role
      if (role && role in counts) counts[role] = (counts[role] ?? 0) + 1
    }
    return counts
  }, [bench, playerById])

  const benchRoleComplete = ROLE_ORDER.every((r) => (benchRoleCounts[r] ?? 0) >= 1)
  const isComplete = filled === 11
  const canSave = isComplete && benchRoleComplete

  // Guard against leaving with an in-progress, unsaved lineup.
  useUnsavedGuard(!isReadOnly && (filled >= 1 || bench.length >= 1) && !saved)

  // Rows for the pitch, attack rendered on top → GK at bottom.
  const pitchRows = useMemo(() => {
    const gk = slots.filter((s) => s.role === 'P')
    const rows: Slot[][] = []
    for (const role of ['A', 'C', 'D'] as const) {
      const r = slots.filter((s) => s.role === role)
      if (r.length) rows.push(r)
    }
    return { rows, gk }
  }, [slots])

  function changeFormation(f: string) {
    setFormation(f)
    setAssign({})
    setSaved(false)
    setError(null)
  }

  function assignToSlot(slotId: string, playerId: string) {
    setSaved(false)
    setError(null)
    setAssign((prev) => {
      const next = { ...prev }
      // a player can occupy only one slot
      for (const [sid, pid] of Object.entries(next)) if (pid === playerId) delete next[sid]
      next[slotId] = playerId
      return next
    })
    // a starter can't simultaneously sit on the bench
    if (benchSet.has(playerId)) setBench((b) => b.filter((id) => id !== playerId))
    setPicker(null)
    setSearch('')
  }

  function clearSlot(slotId: string) {
    if (isReadOnly) return
    setSaved(false)
    setAssign((prev) => {
      const n = { ...prev }
      delete n[slotId]
      return n
    })
  }

  function addToBench(playerId: string) {
    setSaved(false)
    setError(null)
    setBench((b) => (b.includes(playerId) ? b : [...b, playerId]))
    setPicker(null)
    setSearch('')
  }

  function removeBench(id: string) {
    if (isReadOnly) return
    setSaved(false)
    setBench((b) => b.filter((x) => x !== id))
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
        const res = await saveLineupAction(fd)
        if (res.ok) {
          setSaved(true)
        } else {
          setError(res.error)
        }
      } catch (e) {
        // Unexpected (network / masked server crash) — validation paths return
        // a result instead of throwing, so reaching here is a genuine failure.
        setError(e instanceof Error ? e.message : 'Errore imprevisto nel salvataggio')
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* View toggle + formation picker */}
      <div className="flex items-center justify-between gap-2.5">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { v: 'pitch', label: 'Campo' },
            { v: 'list', label: 'Lista' },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className={`mono text-[14px] font-bold tabular-nums ${isComplete ? 'text-emerald-500' : 'text-ink-4'}`}>
            {filled}/11
          </span>
          <div className="relative inline-flex items-center">
            <select
              value={formation}
              onChange={(e) => changeFormation(e.target.value)}
              disabled={isReadOnly || pending}
              className="mono cursor-pointer appearance-none rounded-xl border border-hairline-strong bg-glass-2 py-2 pl-3.5 pr-7 text-[13px] font-semibold text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo disabled:opacity-60"
            >
              {allowedFormations.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5">
              <path d="M2 4l4 4 4-4" stroke="var(--ink-4)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] font-medium text-rose-500">
          {error}
        </div>
      )}

      {/* Pitch / List */}
      {view === 'pitch' ? (
        <Pitch
          rows={pitchRows.rows}
          gk={pitchRows.gk}
          assign={assign}
          playerById={playerById}
          activeSlotId={picker && 'slot' in picker ? picker.slot.id : null}
          onSlot={(slot) => !isReadOnly && setPicker({ slot })}
          onClear={clearSlot}
          isReadOnly={isReadOnly}
        />
      ) : (
        <ListView
          slots={slots}
          assign={assign}
          playerById={playerById}
          onSlot={(slot) => !isReadOnly && setPicker({ slot })}
          onClear={clearSlot}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Bench */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
        <div className="flex items-center gap-2 border-b border-hairline bg-glass-2 px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-2">Panchina</span>
          <span className="flex-1 truncate text-[11px] text-ink-4">
            ordine sostituzione · almeno 1 per ruolo
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${benchRoleComplete ? 'text-emerald-500' : 'text-amber-500'}`}>
            {bench.length} in panchina
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-2.5">
          {ROLE_ORDER.map((r) => {
            const ok = (benchRoleCounts[r] ?? 0) >= 1
            return (
              <button
                key={r}
                type="button"
                disabled={isReadOnly}
                onClick={() => setPicker({ bench: true, role: r })}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-semibold tabular-nums transition-colors enabled:hover:brightness-110 enabled:active:translate-y-px disabled:cursor-default ${
                  ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                }`}
                aria-label={`Aggiungi riserva ${ROLE_LABEL[r]}`}
              >
                <span className={`font-bold ${ROLE_COLORS[r]}`}>{r}</span>{benchRoleCounts[r] ?? 0}
                {!isReadOnly && <span className="opacity-60">+</span>}
              </button>
            )
          })}
        </div>
        {bench.length === 0 ? (
          <button
            disabled={isReadOnly}
            onClick={() => setPicker({ bench: true })}
            className="w-full px-4 py-3.5 text-left text-[12.5px] text-ink-5 hover:bg-glass-2 disabled:cursor-not-allowed"
          >
            Tocca per aggiungere una riserva.
          </button>
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
                      <button onClick={() => moveBench(id, -1)} disabled={i === 0} className="h-7 w-7 rounded-md border border-hairline text-ink-3 hover:bg-glass-2 disabled:opacity-30" aria-label="Su">↑</button>
                      <button onClick={() => moveBench(id, 1)} disabled={i === bench.length - 1} className="h-7 w-7 rounded-md border border-hairline text-ink-3 hover:bg-glass-2 disabled:opacity-30" aria-label="Giù">↓</button>
                      <button onClick={() => removeBench(id)} className="h-7 w-7 rounded-md border border-rose-500/30 text-rose-500 hover:bg-rose-500/10" aria-label="Rimuovi">×</button>
                    </div>
                  )}
                </li>
              )
            })}
            {!isReadOnly && (
              <li>
                <button
                  onClick={() => setPicker({ bench: true })}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[12.5px] font-semibold text-accent hover:bg-glass-2"
                >
                  <span className="text-[16px] leading-none">+</span> Aggiungi riserva
                </button>
              </li>
            )}
          </ol>
        )}
      </div>

      {/* Save */}
      {!isReadOnly && (
        <button
          onClick={handleSave}
          disabled={!canSave || pending}
          className={`w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-all active:translate-y-px ${
            saved
              ? 'bg-emerald-600 text-white'
              : canSave
              ? 'bg-gradient-to-b from-accent-soft to-accent text-white shadow-1'
              : 'cursor-not-allowed bg-glass-2 text-ink-4'
          }`}
        >
          {saved ? 'Formazione schierata ✓' : pending ? '…' : !isComplete ? `Mancano ${11 - filled} titolari` : !benchRoleComplete ? 'Completa la panchina' : 'Schiera questa Formazione'}
        </button>
      )}

      {/* Player picker bottom sheet */}
      {picker && (
        <PickerSheet
          title={
            'slot' in picker
              ? `Scegli: ${ROLE_LABEL[picker.slot.role]}`
              : picker.role
              ? `Riserva: ${ROLE_LABEL[picker.role]}`
              : 'Aggiungi riserva'
          }
          players={
            'slot' in picker
              ? (byRole[picker.slot.role] ?? [])
              : picker.role
              ? (byRole[picker.role] ?? []).filter((p) => !starterSet.has(p.id) && !benchSet.has(p.id))
              : ROLE_ORDER.flatMap((r) => byRole[r] ?? []).filter((p) => !starterSet.has(p.id))
          }
          search={search}
          setSearch={setSearch}
          starterSet={starterSet}
          benchSet={benchSet}
          currentInSlot={'slot' in picker ? assign[picker.slot.id] ?? null : null}
          mode={'slot' in picker ? 'starter' : 'bench'}
          nextMatchByTeam={nextMatchByTeam}
          priceById={priceById}
          onPick={(pid) => ('slot' in picker ? assignToSlot(picker.slot.id, pid) : addToBench(pid))}
          onClose={() => { setPicker(null); setSearch('') }}
        />
      )}
    </div>
  )
}

/* ---------- Segmented control ---------- */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { v: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-xl border border-hairline bg-glass-1 p-[3px]">
      {options.map((o) => {
        const active = o.v === value
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all ${
              active ? 'bg-glass-3 text-ink-1 shadow-1' : 'text-ink-4'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Pitch ---------- */
function Pitch({
  rows,
  gk,
  assign,
  playerById,
  activeSlotId,
  onSlot,
  onClear,
  isReadOnly,
}: {
  rows: Slot[][]
  gk: Slot[]
  assign: Record<string, string>
  playerById: Map<string, Player>
  activeSlotId: string | null
  onSlot: (slot: Slot) => void
  onClear: (slotId: string) => void
  isReadOnly: boolean
}) {
  return (
    <div
      className="relative flex flex-col gap-3.5 overflow-hidden rounded-3xl border border-hairline px-2.5 py-5 shadow-1"
      style={{ background: 'linear-gradient(170deg, #3a8f57, #2f7a49)' }}
    >
      {/* mowing stripes */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ background: 'repeating-linear-gradient(180deg, transparent 0 38px, rgba(255,255,255,0.08) 38px 76px)' }}
      />
      {/* field lines */}
      <div className="pointer-events-none absolute left-4 right-4 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.35)' }} />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.35)' }} />
      <div className="pointer-events-none absolute left-1/2 top-2 h-[30px] w-[90px] -translate-x-1/2 rounded-b-[10px] border border-t-0" style={{ borderColor: 'rgba(255,255,255,0.35)' }} />
      <div className="pointer-events-none absolute bottom-2 left-1/2 h-[30px] w-[90px] -translate-x-1/2 rounded-t-[10px] border border-b-0" style={{ borderColor: 'rgba(255,255,255,0.35)' }} />

      {rows.map((row, i) => (
        <div key={i} className="relative z-[1] flex flex-wrap justify-center gap-2">
          {row.map((slot) => (
            <PitchSlot
              key={slot.id}
              slot={slot}
              player={assign[slot.id] ? playerById.get(assign[slot.id]!) ?? null : null}
              active={activeSlotId === slot.id}
              onClick={() => onSlot(slot)}
              onClear={() => onClear(slot.id)}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      ))}
      <div className="relative z-[1] flex justify-center">
        {gk.map((slot) => (
          <PitchSlot
            key={slot.id}
            slot={slot}
            player={assign[slot.id] ? playerById.get(assign[slot.id]!) ?? null : null}
            active={activeSlotId === slot.id}
            onClick={() => onSlot(slot)}
            onClear={() => onClear(slot.id)}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>
    </div>
  )
}

function PitchSlot({
  slot,
  player,
  active,
  onClick,
  onClear,
  isReadOnly,
}: {
  slot: Slot
  player: Player | null
  active: boolean
  onClick: () => void
  onClear: () => void
  isReadOnly: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex w-16 flex-col items-center gap-[3px] rounded-2xl px-1 pb-[7px] pt-2 text-center transition-transform"
      style={{
        background: player ? 'var(--glass-3)' : 'rgba(255,255,255,0.14)',
        border: active ? '1.5px solid var(--color-accent)' : player ? '1px solid var(--hairline)' : '1px dashed rgba(255,255,255,0.5)',
        boxShadow: player ? 'var(--shadow-1, 0 1px 3px rgba(0,0,0,0.12))' : 'none',
        transform: active ? 'scale(1.06)' : 'none',
      }}
    >
      {player ? (
        <>
          <div className="relative">
            <TeamCrest
              name={player.fm_national_team.name}
              logoUrl={player.fm_national_team.logo_url}
              flagUrl={player.fm_national_team.flag_url}
              fifaCode={player.fm_national_team.fifa_code}
              size={28}
            />
            <span
              className="absolute -bottom-[3px] -right-[5px] h-[9px] w-[9px] rounded-full"
              style={{ background: ROLE_VAR[slot.role], border: '1.5px solid var(--glass-3)' }}
            />
          </div>
          <span className="max-w-[60px] truncate text-[11.5px] font-bold leading-[1.05] text-ink-1">{surname(player.name)}</span>
          <span className="mono text-[10px] font-semibold text-ink-4">{player.fm_national_team.fifa_code}</span>
          {!isReadOnly && (
            <span
              onClick={(e) => { e.stopPropagation(); onClear() }}
              className="absolute -right-[7px] -top-[7px] grid h-[19px] w-[19px] place-items-center rounded-full text-[11px] text-white"
              style={{ background: 'var(--color-danger)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
            >×</span>
          )}
        </>
      ) : (
        <>
          <span className="text-[9px] font-extrabold tracking-wider text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>{ROLE_LABEL[slot.role]}</span>
          <span className="text-[22px] leading-[0.9] text-white/85" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>+</span>
        </>
      )}
    </button>
  )
}

/* ---------- List view ---------- */
function ListView({
  slots,
  assign,
  playerById,
  onSlot,
  onClear,
  isReadOnly,
}: {
  slots: Slot[]
  assign: Record<string, string>
  playerById: Map<string, Player>
  onSlot: (slot: Slot) => void
  onClear: (slotId: string) => void
  isReadOnly: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-glass-1">
      {slots.map((slot, i) => {
        const p = assign[slot.id] ? playerById.get(assign[slot.id]!) ?? null : null
        return (
          <button
            key={slot.id}
            onClick={() => onSlot(slot)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i < slots.length - 1 ? 'border-b border-hairline' : ''}`}
          >
            <span className={`w-9 text-[11px] font-bold ${ROLE_COLORS[slot.role]}`}>{ROLE_LABEL[slot.role]}</span>
            {p ? (
              <>
                <TeamCrest
                  name={p.fm_national_team.name}
                  logoUrl={p.fm_national_team.logo_url}
                  flagUrl={p.fm_national_team.flag_url}
                  fifaCode={p.fm_national_team.fifa_code}
                  size={24}
                />
                <span className="flex-1 truncate text-[14.5px] font-semibold text-ink-1">{p.name}</span>
                <span className="mono text-[12px] text-ink-4">{p.fm_national_team.fifa_code}</span>
                {!isReadOnly && (
                  <span onClick={(e) => { e.stopPropagation(); onClear(slot.id) }} className="px-1 text-[18px] text-ink-5">×</span>
                )}
              </>
            ) : (
              <>
                <span className="flex-1 text-[13.5px] text-ink-4">Tocca per scegliere</span>
                <span className="text-[20px] text-accent">+</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Player picker bottom sheet ---------- */
function PickerSheet({
  title,
  players,
  search,
  setSearch,
  starterSet,
  benchSet,
  currentInSlot,
  mode,
  nextMatchByTeam,
  priceById,
  onPick,
  onClose,
}: {
  title: string
  players: Player[]
  search: string
  setSearch: (s: string) => void
  starterSet: Set<string>
  benchSet: Set<string>
  currentInSlot: string | null
  mode: 'starter' | 'bench'
  nextMatchByTeam: Record<string, NextMatch>
  priceById: Record<string, number>
  onPick: (playerId: string) => void
  onClose: () => void
}) {
  const list = players.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.fm_national_team.name.toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" />
      <div
        className="relative flex max-h-[92%] flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-hairline bg-glass-3 backdrop-blur-2xl"
        style={{ boxShadow: '0 -20px 60px -20px rgba(0,0,0,0.4)' }}
      >
        <div className="flex-shrink-0 px-4 pb-2 pt-2">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-hairline-strong" />
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[16px] font-semibold text-ink-1">{title}</h3>
            <span className="text-[12px] text-ink-4">{list.length} disponibili</span>
          </div>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome o nazionale…"
            className="w-full rounded-xl border border-hairline-strong bg-glass-1 px-3.5 py-2 text-[14px] text-ink-1 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-7 pt-1">
          {list.length === 0 && <p className="py-10 text-center text-[14px] text-ink-4">Nessun giocatore</p>}
          {list.map((p) => {
            const isCurrent = currentInSlot === p.id
            const inUse =
              !isCurrent && (mode === 'starter' ? starterSet.has(p.id) : benchSet.has(p.id) || starterSet.has(p.id))
            const nm = nextMatchByTeam[p.national_team_id]
            return (
              <button
                key={p.id}
                disabled={inUse}
                onClick={() => onPick(p.id)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left ${
                  inUse ? 'cursor-not-allowed border-transparent opacity-40' : 'border-hairline bg-glass-1'
                } ${isCurrent ? 'ring-1 ring-accent' : ''}`}
              >
                <TeamCrest
                  name={p.fm_national_team.name}
                  logoUrl={p.fm_national_team.logo_url}
                  flagUrl={p.fm_national_team.flag_url}
                  fifaCode={p.fm_national_team.fifa_code}
                  size={26}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10.5px] font-bold ${ROLE_COLORS[p.role]}`}>{ROLE_LABEL[p.role]}</span>
                    <span className="truncate text-[14px] font-semibold text-ink-1">{p.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-5">
                    <span className="truncate text-ink-4">{p.fm_national_team.name}</span>
                    {nm && (
                      <>
                        <span className="text-ink-5">·</span>
                        <span className="font-semibold text-ink-4">{nm.home ? 'vs' : '@'}</span>
                        <TeamCrest name={nm.opponent} logoUrl={nm.logoUrl} flagUrl={nm.flagUrl} fifaCode={nm.fifaCode} size={12} />
                        <span className="truncate font-medium text-ink-3">{nm.fifaCode}</span>
                        {formatKickoff(nm.kickoff) && <span className="shrink-0 text-ink-5">{formatKickoff(nm.kickoff)}</span>}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end leading-none">
                  <span className="mono text-[14px] font-bold tabular-nums text-ink-1">{priceById[p.id] ?? 0}</span>
                  <span className="text-[9px] uppercase tracking-wider text-ink-5">cr</span>
                </div>
                {inUse && <span className="text-[10px] font-semibold text-ink-5">in uso</span>}
                {isCurrent && <span className="text-[13px] text-accent">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
