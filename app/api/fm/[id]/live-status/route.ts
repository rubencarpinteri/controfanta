import { NextResponse } from 'next/server'
import { requireFMContext, getFMRounds } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/fm/[id]/live-status
 *
 * Lightweight poll for the nav "Live" dot: is any match of the current round
 * actually in progress right now? Green dot when true, red when not.
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

  if (!activeRound) return NextResponse.json({ playing: false })

  const { count } = await supabase
    .from('fm_real_match')
    .select('id', { count: 'exact', head: true })
    .eq('scoring_round_id', activeRound.id)
    .eq('status', 'in_progress')

  return NextResponse.json({ playing: (count ?? 0) > 0 })
}
