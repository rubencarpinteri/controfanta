import { requireFMContext, assertSuperAdmin, getFMPhases, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { setRoundStatusAction, deleteRoundAction } from './actions'
import { FMRoundEditor } from './FMRoundEditor'
import { FMRoundActions } from './FMRoundActions'
import type { FMScoringRound } from '@/types/database.types'

const STATUS_NEXT: Record<string, { next: string; label: string; cls: string } | null> = {
  draft:     { next: 'open',      label: 'Apri',            cls: 'bg-emerald-600 hover:bg-emerald-500' },
  open:      { next: 'locked',    label: 'Lock formazioni', cls: 'bg-amber-600 hover:bg-amber-500' },
  locked:    { next: 'scoring',   label: 'Calcolo',         cls: 'bg-indigo-600 hover:bg-indigo-500' },
  scoring:   { next: 'published', label: 'Pubblica',        cls: 'bg-emerald-600 hover:bg-emerald-500' },
  published: null,
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'text-ink-4 bg-ink-4/10',
  open:      'text-emerald-400 bg-emerald-400/10',
  locked:    'text-amber-400 bg-amber-400/10',
  scoring:   'text-indigo-400 bg-indigo-400/10',
  published: 'text-emerald-400 bg-emerald-400/15 border border-emerald-500/30',
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dt))
}

export default async function RoundsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)
  const [phases, rounds] = await Promise.all([getFMPhases(ctx.competition.id), getFMRounds(ctx.competition.id)])

  const supabase = await createClient()
  const { data: matchData } = await supabase
    .from('fm_real_match')
    .select('scoring_round_id')
    .in('scoring_round_id', rounds.map((r) => r.id))
  const matchCountByRound = new Map<string, number>()
  for (const m of matchData ?? []) {
    matchCountByRound.set(m.scoring_round_id, (matchCountByRound.get(m.scoring_round_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Turni fantasy</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-4 leading-relaxed">
          Un <strong className="text-ink-2">Turno</strong> è una scadenza per cambiare formazione
          (NON la rosa). La rosa resta fissa per tutta la Fase in cui il turno vive — qui si decidono
          solo titolari e panchina.
        </p>
        <p className="mt-1.5 text-[11.5px] text-ink-4 leading-relaxed">
          Esempio Mondiale: la Fase <span className="font-mono text-ink-2">Gironi</span> contiene 3 turni
          (uno per ogni MD del girone reale); ogni fase a eliminazione (Ottavi, Quarti, Semifinali, Finale)
          contiene tipicamente 1 turno.
        </p>
      </div>

      {phases.map((phase) => {
        const phaseRounds = rounds.filter((r: FMScoringRound) => r.phase_id === phase.id)

        return (
          <div key={phase.id} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">{phase.name}</p>

            {phaseRounds.length === 0 && (
              <div className="rounded-xl border border-hairline bg-glass-1 px-4 py-3 text-[12px] text-ink-5">
                Nessuna giornata per questa fase.
              </div>
            )}

            {phaseRounds.map((round: FMScoringRound) => {
              const statusAction = STATUS_NEXT[round.status]
              const matchCount = matchCountByRound.get(round.id) ?? 0

              return (
                <div key={round.id} className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink-1">{round.name}</p>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-ink-5">
                        <span>Lock: {fmt(round.lock_at)}</span>
                        <span>{matchCount} partite</span>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[round.status] ?? ''}`}>
                      {round.status}
                    </span>
                    <FMRoundActions roundId={round.id} roundStatus={round.status} />
                    {statusAction && (
                      <form action={setRoundStatusAction.bind(null, round.id, id, statusAction.next as 'draft' | 'open' | 'locked' | 'scoring' | 'published')}>
                        <button type="submit" className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-colors ${statusAction.cls}`}>
                          {statusAction.label}
                        </button>
                      </form>
                    )}
                    <form action={deleteRoundAction.bind(null, round.id, id)}>
                      <button type="submit" className="text-[10px] text-ink-5 hover:text-rose-400 transition-colors">✕</button>
                    </form>
                  </div>

                  <div className="border-t border-hairline px-4 py-2.5">
                    <FMRoundEditor round={round} competitionId={id} />
                  </div>
                </div>
              )
            })}

            {/* Add round within this phase */}
            <FMRoundEditor round={null} competitionId={id} phaseId={phase.id} phaseRounds={phaseRounds} />
          </div>
        )
      })}
    </div>
  )
}
