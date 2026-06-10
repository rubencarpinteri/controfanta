'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLegaPhaseAction } from '../phases/actions'
import type { FMPhase } from '@/types/database.types'

// ── Per-phase budget, surfaced on the Setup page ───────────────────────────────
//
// The budget that managers actually see when building a rosa is PER-PHASE
// (fm_league_phase.budget_config), not the competition-wide "budget di riserva"
// fallback. The budget legitimately rises as the tournament narrows, so it can't
// be a single number. This editor lets the league admin set each phase's budget
// here — the same place as the rest of the squad setup — instead of hunting for
// the hidden toggle on the Fasi page.
// ───────────────────────────────────────────────────────────────────────────────

export interface PhaseBudgetRow {
  id: string
  name: string
  display_order: number
  status: FMPhase['status']
  budget_mode: FMPhase['budget_mode']
  budget: number
  requires_new_squad: boolean
}

const BUDGET_MODE_LABELS: Record<string, string> = {
  fixed: 'Budget fisso',
  comeback: 'Comeback (ultimi → più crediti)',
  reward_leaders: 'Premia i primi',
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'text-ink-4 bg-ink-4/10',
  open: 'text-emerald-400 bg-emerald-400/10',
  locked: 'text-amber-400 bg-amber-400/10',
  completed: 'text-indigo-400 bg-indigo-400/10',
}

function PhaseRow({ competitionId, phase }: { competitionId: string; phase: PhaseBudgetRow }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [budget, setBudget] = useState(phase.budget)
  const [mode, setMode] = useState<string>(phase.budget_mode)
  const [requiresNewSquad, setRequiresNewSquad] = useState(phase.requires_new_squad)

  const dirty =
    budget !== phase.budget ||
    mode !== phase.budget_mode ||
    requiresNewSquad !== phase.requires_new_squad

  async function save() {
    setPending(true)
    setSaved(false)
    try {
      const fd = new FormData()
      fd.set('competition_id', competitionId)
      fd.set('phase_id', phase.id)
      fd.set('budget', String(budget))
      fd.set('budget_mode', mode)
      fd.set('requires_new_squad', requiresNewSquad ? 'true' : 'false')
      await updateLegaPhaseAction(fd)
      setSaved(true)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-glass-2 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-5 tabular-nums w-4">{phase.display_order}</span>
        <p className="flex-1 text-[13px] font-semibold text-ink-1">{phase.name}</p>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_BADGE[phase.status] ?? ''}`}>
          {phase.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Budget (cr)</label>
          <input
            type="number"
            min={50}
            max={10000}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full rounded-lg border border-hairline bg-glass-1 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Modalità budget</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-lg border border-hairline bg-glass-1 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(BUDGET_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Nuova rosa richiesta?</label>
          <select
            value={requiresNewSquad ? 'true' : 'false'}
            onChange={(e) => setRequiresNewSquad(e.target.value === 'true')}
            className="w-full rounded-lg border border-hairline bg-glass-1 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="true">Sì — nuova rosa</option>
            <option value="false">No — continua rosa precedente</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40"
        >
          {pending ? 'Salvo…' : 'Salva budget fase'}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">✓ Salvato</span>}
        {dirty && !pending && <span className="text-[11px] text-ink-4">Modifiche non salvate</span>}
      </div>
    </div>
  )
}

export function PhaseBudgetEditor({
  competitionId,
  phases,
}: {
  competitionId: string
  phases: PhaseBudgetRow[]
}) {
  if (phases.length === 0) {
    return (
      <p className="text-[12px] text-ink-4">
        Nessuna fase configurata. Le fasi vengono create dalla piattaforma e compaiono qui.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2">
        <p className="text-[11px] text-ink-3 leading-relaxed">
          Questo è il budget che i manager vedono davvero quando costruiscono la rosa.
          Può variare da fase a fase (di solito cresce man mano che il torneo si restringe).
          Il &ldquo;budget di riserva&rdquo; qui sopra vale solo per le fasi che non hanno un budget proprio.
        </p>
      </div>
      {phases.map((phase) => (
        <PhaseRow key={phase.id} competitionId={competitionId} phase={phase} />
      ))}
    </div>
  )
}
