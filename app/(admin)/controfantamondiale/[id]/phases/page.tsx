import { requireFMContext, assertSuperAdmin, getFMPhases, getFMRounds } from '@/lib/fantamondiale/server'
import { setPhaseStatusAction } from './actions'
import { FMPhaseEditor } from './FMPhaseEditor'
import type { FMPhase } from '@/types/database.types'

const STATUS_FLOW: Record<string, { next: string; label: string; cls: string } | null> = {
  draft:     { next: 'open',      label: 'Apri',       cls: 'bg-emerald-600 hover:bg-emerald-500' },
  open:      { next: 'locked',    label: 'Chiudi Rosa', cls: 'bg-amber-600 hover:bg-amber-500' },
  locked:    { next: 'completed', label: 'Completa',   cls: 'bg-indigo-600 hover:bg-indigo-500' },
  completed: null,
}

const PHASE_STATUS_BADGE: Record<string, string> = {
  draft:     'text-ink-4 bg-ink-4/10',
  open:      'text-emerald-400 bg-emerald-400/10',
  locked:    'text-amber-400 bg-amber-400/10',
  completed: 'text-indigo-400 bg-indigo-400/10',
}

const BUDGET_MODE_LABELS: Record<string, string> = {
  fixed:          'Budget fisso',
  comeback:       'Comeback (ultimi → più crediti)',
  reward_leaders: 'Premia i primi',
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dt))
}

export default async function PhasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)
  const [phases, rounds] = await Promise.all([getFMPhases(ctx.competition.id), getFMRounds(ctx.competition.id)])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Fasi fantasy</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-4 leading-relaxed">
          Una <strong className="text-ink-2">Fase</strong> è un blocco in cui la rosa fantasy
          resta fissa. All&apos;inizio di ogni fase ogni manager rifà la rosa con i crediti del momento;
          dentro la fase si può solo cambiare formazione tra un Turno e l&apos;altro.
        </p>
        <p className="mt-1.5 text-[11.5px] text-ink-4 leading-relaxed">
          Esempio Mondiale: 5 fasi che ricalcano il torneo reale —
          <span className="font-mono text-ink-2"> Gironi</span> (3 turni: MD1/MD2/MD3 a rosa fissa),
          <span className="font-mono text-ink-2"> Ottavi</span>,
          <span className="font-mono text-ink-2"> Quarti</span>,
          <span className="font-mono text-ink-2"> Semifinali</span>,
          <span className="font-mono text-ink-2"> Finale</span>.
          Le fasi a eliminazione tipicamente contengono 1 turno ciascuna.
        </p>
      </div>

      {phases.map((phase: FMPhase) => {
        const phaseRounds = rounds.filter((r) => r.phase_id === phase.id)
        const statusAction = STATUS_FLOW[phase.status]

        return (
          <div key={phase.id} className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
              <span className="text-[11px] text-ink-5 tabular-nums w-4">{phase.display_order}</span>
              <p className="flex-1 text-[14px] font-semibold text-ink-1">{phase.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PHASE_STATUS_BADGE[phase.status] ?? ''}`}>
                {phase.status}
              </span>
              {statusAction && (
                <form action={setPhaseStatusAction.bind(null, phase.id, id, statusAction.next as 'draft' | 'open' | 'locked' | 'completed')}>
                  <button
                    type="submit"
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors ${statusAction.cls}`}
                  >
                    {statusAction.label}
                  </button>
                </form>
              )}
            </div>

            {/* ── Dates + settings grid ── */}
            <div className="grid grid-cols-2 gap-3 px-4 py-3 text-[11px] sm:grid-cols-4">
              <div>
                <p className="text-ink-5 uppercase tracking-wider text-[9px] font-semibold mb-0.5">Apertura rosa</p>
                <p className="text-ink-2">{fmt(phase.squad_open_at)}</p>
              </div>
              <div>
                <p className="text-ink-5 uppercase tracking-wider text-[9px] font-semibold mb-0.5">Lock rosa</p>
                <p className="text-ink-2">{fmt(phase.squad_lock_at)}</p>
              </div>
              <div>
                <p className="text-ink-5 uppercase tracking-wider text-[9px] font-semibold mb-0.5">Reveal</p>
                <p className="text-ink-2">{fmt(phase.reveal_at)}</p>
              </div>
              <div>
                <p className="text-ink-5 uppercase tracking-wider text-[9px] font-semibold mb-0.5">Budget</p>
                <p className="text-ink-2">{BUDGET_MODE_LABELS[phase.budget_mode] ?? phase.budget_mode}</p>
              </div>
            </div>

            {/* ── Rounds summary ── */}
            {phaseRounds.length > 0 && (
              <div className="border-t border-hairline px-4 py-2.5">
                <p className="text-[9px] uppercase tracking-wider text-ink-5 mb-1.5 font-semibold">Giornate ({phaseRounds.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {phaseRounds.map((r) => (
                    <span key={r.id} className="rounded-full bg-glass-2 border border-hairline px-2 py-0.5 text-[10px] text-ink-3">
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Inline edit form ── */}
            <div className="border-t border-hairline px-4 py-3">
              <FMPhaseEditor phase={phase} competitionId={id} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
