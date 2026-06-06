import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import type { LiveRoundSnapshot } from '@/domain/fantamondiale/engine/liveSnapshot'
import { LiveBoard } from './LiveBoard'

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const rounds = await getFMRounds(ctx.competition.id)
  // The round currently in play (or most recently scored).
  const activeRound =
    rounds.find((r) => r.status === 'locked') ??
    rounds.find((r) => r.status === 'scoring') ??
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'published') ??
    null

  const header = (
    <div>
      <h2 className="text-[16px] font-semibold text-ink-1">Live</h2>
      <p className="mt-0.5 text-[11px] text-ink-4">
        Punteggi e schieramenti in tempo reale — pubblici dal primo calcio d&apos;inizio.
      </p>
    </div>
  )

  if (!activeRound) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-hairline bg-glass-1 p-8 text-center">
          <p className="text-[14px] text-ink-3">Nessun turno attivo al momento.</p>
        </div>
      </div>
    )
  }

  // ── Reveal gate: only after the first official match has kicked off ──
  const { data: matches } = await supabase
    .from('fm_real_match')
    .select('kickoff_at')
    .eq('scoring_round_id', activeRound.id)

  const kickoffs = (matches ?? [])
    .map((m) => new Date(m.kickoff_at).getTime())
    .filter((n) => !Number.isNaN(n))
  const firstKickoff = kickoffs.length > 0 ? Math.min(...kickoffs) : null
  const revealed = firstKickoff !== null && Date.now() >= firstKickoff

  if (!revealed) {
    const when =
      firstKickoff !== null
        ? new Date(firstKickoff).toLocaleString('it-IT', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
          <p className="text-[14px] font-semibold text-amber-300">Live non ancora disponibile</p>
          <p className="mt-1 text-[12px] text-ink-3">
            Si apre al calcio d&apos;inizio della prima partita ufficiale di {activeRound.name}.
          </p>
          {when && <p className="mt-2 text-[12px] text-ink-2 tabular-nums">Primo fischio: {when}</p>}
        </div>
      </div>
    )
  }

  const { data: snapRow } = await supabase
    .from('fm_live_round_snapshot')
    .select('snapshot, computed_at')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .eq('scoring_round_id', activeRound.id)
    .maybeSingle()

  return (
    <div className="space-y-4">
      {header}
      <LiveBoard
        legaCompRef={id}
        roundName={activeRound.name}
        myTeamId={ctx.fantasyTeamId}
        initialSnapshot={(snapRow?.snapshot as LiveRoundSnapshot | null) ?? null}
        initialComputedAt={snapRow?.computed_at ?? null}
      />
    </div>
  )
}
