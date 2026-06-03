'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

const RoundSchema = z.object({
  competition_id: z.string().uuid(),
  phase_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  display_order: z.coerce.number().int().positive(),
  lineup_open_at: z.string().optional(),
  lock_at: z.string().optional(),
})

export async function createRoundAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const parsed = RoundSchema.safeParse({
    competition_id: fd.get('competition_id'),
    phase_id: fd.get('phase_id'),
    name: fd.get('name'),
    display_order: fd.get('display_order'),
    lineup_open_at: fd.get('lineup_open_at') || undefined,
    lock_at: fd.get('lock_at') || undefined,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi')

  await supabase.from('fm_scoring_round').insert({ ...parsed.data, status: 'draft' as const })
  revalidatePath(`/controfantamondiale/${parsed.data.competition_id}/rounds`)
}

export async function updateRoundAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const id = fd.get('id') as string
  const competitionId = fd.get('competition_id') as string
  const name = fd.get('name') as string
  const lineup_open_at = (fd.get('lineup_open_at') as string) || null
  const lock_at = (fd.get('lock_at') as string) || null

  await supabase.from('fm_scoring_round').update({ name, lineup_open_at, lock_at }).eq('id', id)
  revalidatePath(`/controfantamondiale/${competitionId}/rounds`)
}

export async function setRoundStatusAction(
  roundId: string,
  competitionId: string,
  status: 'draft' | 'open' | 'locked' | 'scoring' | 'published'
) {
  await requireSuperAdmin()
  const supabase = await createClient()

  if (status === 'locked') {
    await snapshotOwnership(supabase, roundId)
  }

  const updates: Record<string, unknown> = { status }
  if (status === 'published') updates.published_at = new Date().toISOString()

  await supabase.from('fm_scoring_round').update(updates).eq('id', roundId)
  revalidatePath(`/controfantamondiale/${competitionId}/rounds`)
}

async function snapshotOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roundId: string
) {
  // Per-Lega ownership: count which players are starters in each Lega's own
  // pool of teams, separately. Same player in two different Leghe can have
  // very different popularity penalties — that's the trademark mechanic.
  const { data: lineups, error: lineupsErr } = await supabase
    .from('fm_matchday_lineup')
    .select('id, fantasy_team_id, fm_matchday_lineup_player(player_id, is_starter)')
    .eq('scoring_round_id', roundId)
    .not('submitted_at', 'is', null)

  if (lineupsErr) throw new Error(`Ownership snapshot failed: ${lineupsErr.message}`)
  if (!lineups || lineups.length === 0) return

  const teamIds = lineups.map((l) => l.fantasy_team_id)
  const { data: teamRows, error: teamErr } = await supabase
    .from('fm_fantasy_team')
    .select('id, league_competition_id')
    .in('id', teamIds)
  if (teamErr) throw new Error(`Ownership snapshot failed: ${teamErr.message}`)

  const legaByTeam = new Map<string, string>(
    (teamRows ?? []).map((t) => [t.id, t.league_competition_id])
  )

  // Group submitted lineups by Lega instance
  type LineupRow = (typeof lineups)[number]
  const lineupsByLega = new Map<string, LineupRow[]>()
  for (const l of lineups) {
    const legaCompId = legaByTeam.get(l.fantasy_team_id)
    if (!legaCompId) continue
    const list = lineupsByLega.get(legaCompId) ?? []
    list.push(l)
    lineupsByLega.set(legaCompId, list)
  }

  const rows: {
    league_competition_id: string
    scoring_round_id: string
    player_id: string
    teams_owning: number
    teams_total: number
    ownership_pct: number
  }[] = []

  for (const [legaCompId, legaLineups] of lineupsByLega) {
    const totalTeams = legaLineups.length
    if (totalTeams === 0) continue

    const counts = new Map<string, number>()
    for (const l of legaLineups) {
      for (const lp of l.fm_matchday_lineup_player) {
        if (!lp.is_starter) continue
        counts.set(lp.player_id, (counts.get(lp.player_id) ?? 0) + 1)
      }
    }

    for (const [player_id, teams_owning] of counts) {
      rows.push({
        league_competition_id: legaCompId,
        scoring_round_id: roundId,
        player_id,
        teams_owning,
        teams_total: totalTeams,
        ownership_pct: parseFloat(((teams_owning / totalTeams) * 100).toFixed(3)),
      })
    }
  }

  if (rows.length === 0) return

  const { error: upsertErr } = await supabase
    .from('fm_round_player_ownership')
    .upsert(rows, { onConflict: 'league_competition_id,scoring_round_id,player_id' })

  if (upsertErr) throw new Error(`Ownership upsert failed: ${upsertErr.message}`)
}

export async function deleteRoundAction(roundId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_scoring_round').delete().eq('id', roundId)
  revalidatePath(`/controfantamondiale/${competitionId}/rounds`)
}
