import { NextResponse } from 'next/server'
import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { computeLiveRoundSnapshot, type LiveRoundSnapshot } from '@/domain/fantamondiale/engine/liveSnapshot'

function needsLiveSnapshotShapeRefresh(snapshot: LiveRoundSnapshot | null): boolean {
  return Boolean(
    snapshot?.matches.some((match) =>
      match.players.some((player) => !Object.hasOwn(player, 'display_voto_base')),
    ) ||
      snapshot?.teams.some((team) =>
        team.players.some(
          (player) =>
            !Object.hasOwn(player, 'replacement_pending') ||
            !Object.hasOwn(player, 'replacement_candidate') ||
            !Object.hasOwn(player, 'bench_order'),
        ),
      ),
  )
}

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

  let snapshot = (data?.snapshot as LiveRoundSnapshot | null) ?? null
  if (needsLiveSnapshotShapeRefresh(snapshot)) {
    snapshot = await computeLiveRoundSnapshot(activeRound.id, ctx.legaCompetition.id, supabase)
  }

  return NextResponse.json({
    snapshot,
    computed_at: data?.computed_at ?? null,
  })
}
