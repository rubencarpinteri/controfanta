'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireFMContext, assertLeagueAdmin } from '@/lib/fantamondiale/server'

// Prices are part of the per-league fantasy layer: each Lega owns its own price
// table (fm_league_phase_player_price), editable by its league_admin. The URL
// [id] segment is the Lega competition ref (slug or UUID); requireFMContext
// resolves it to both the Lega instance id and the global competition id (the
// latter is needed to look players up from the shared pool).

const PriceSchema = z.object({
  phase_id: z.string().uuid(),
  player_id: z.string().uuid(),
  price: z.coerce.number().int().min(0),
  competition_id: z.string(), // URL ref (slug or UUID)
})

export async function setPriceAction(fd: FormData) {
  const parsed = PriceSchema.safeParse({
    phase_id: fd.get('phase_id'),
    player_id: fd.get('player_id'),
    price: fd.get('price'),
    competition_id: fd.get('competition_id'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi')

  const { competition_id: ref, ...rest } = parsed.data
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  await supabase.from('fm_league_phase_player_price').upsert(
    { ...rest, league_competition_id: ctx.legaCompetition.id, source: 'manual' },
    { onConflict: 'league_competition_id,phase_id,player_id' }
  )

  revalidatePath(`/controfantamondiale/${ref}/prices`)
}

export async function bulkImportPricesAction(fd: FormData) {
  const ref = fd.get('competition_id') as string
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  const phaseId = fd.get('phase_id') as string
  const rawLines = (fd.get('price_lines') as string ?? '').trim()
  const source = (fd.get('source') as string) || 'csv_import'

  if (!rawLines) throw new Error('Nessun dato')

  const rows = rawLines
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      return { sportmonks_player_id: Number(parts[0]), price: Number(parts[1]) }
    })
    .filter((r) => !isNaN(r.sportmonks_player_id) && !isNaN(r.price))

  if (rows.length === 0) throw new Error('Nessuna riga valida')

  const sportmonksIds = rows.map((r) => r.sportmonks_player_id)
  // Players come from the shared global pool, keyed by the global competition id.
  const { data: players } = await supabase
    .from('fm_player')
    .select('id, sportmonks_player_id')
    .eq('competition_id', ctx.competition.id)
    .in('sportmonks_player_id', sportmonksIds)

  if (!players || players.length === 0) throw new Error('Nessun giocatore trovato con i SportMonks ID indicati')

  const idMap = new Map(players.map((p) => [p.sportmonks_player_id, p.id]))

  const upsertRows = rows.flatMap((r) => {
    const playerId = r.sportmonks_player_id !== null ? idMap.get(r.sportmonks_player_id) : undefined
    if (!playerId) return []
    return [{
      league_competition_id: ctx.legaCompetition.id,
      phase_id: phaseId,
      player_id: playerId,
      price: r.price,
      source,
    }]
  })

  if (upsertRows.length > 0) {
    await supabase
      .from('fm_league_phase_player_price')
      .upsert(upsertRows, { onConflict: 'league_competition_id,phase_id,player_id' })
  }

  revalidatePath(`/controfantamondiale/${ref}/prices`)
}

export async function copyPhasePricesAction(
  fromPhaseId: string,
  toPhaseId: string,
  ref: string
) {
  const ctx = await requireFMContext(ref)
  assertLeagueAdmin(ctx)
  const supabase = await createClient()

  const { data: from } = await supabase
    .from('fm_league_phase_player_price')
    .select('player_id, price')
    .eq('league_competition_id', ctx.legaCompetition.id)
    .eq('phase_id', fromPhaseId)

  if (!from || from.length === 0) return

  await supabase.from('fm_league_phase_player_price').upsert(
    from.map((r) => ({
      league_competition_id: ctx.legaCompetition.id,
      phase_id: toPhaseId,
      player_id: r.player_id,
      price: r.price,
      source: 'copied',
    })),
    { onConflict: 'league_competition_id,phase_id,player_id' }
  )

  revalidatePath(`/controfantamondiale/${ref}/prices`)
}
