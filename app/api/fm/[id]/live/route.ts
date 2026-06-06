import { NextResponse } from 'next/server'
import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import type { LiveRoundSnapshot } from '@/domain/fantamondiale/engine/liveSnapshot'

/**
 * GET /api/fm/[id]/live
 *
 * Returns the precomputed live snapshot for the lega's current round, for
 * client polling. Pure read — the snapshot is computed by the ratings-tick
 * cron, never here. Access is gated by requireFMContext.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  const supabase = await createClient()

  const rounds = await getFMRounds(ctx.competition.id)
  const activeRound =
    rounds.find((r) => r.status === 'locked') ??
    rounds.find((r) => r.status === 'scoring') ??
    rounds.find((r) => r.status === 'open') ??
    rounds.find((r) => r.status === 'published') ??
    null

  if (!activeRound) {
    return NextResponse.json({ snapshot: null, computed_at: null })
  }

  const { data } = await supabase
    .from('fm_live_round_snapshot')
    .select('snapshot, computed_at')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .eq('scoring_round_id', activeRound.id)
    .maybeSingle()

  return NextResponse.json({
    snapshot: (data?.snapshot as LiveRoundSnapshot | null) ?? null,
    computed_at: data?.computed_at ?? null,
  })
}
