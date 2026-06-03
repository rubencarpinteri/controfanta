'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

const PlayerRowSchema = z.object({
  sportmonks_player_id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(120),
  shirt_number: z.coerce.number().int().min(1).max(99).optional(),
  role: z.enum(['P', 'D', 'C', 'A']),
  base_price: z.coerce.number().int().min(0).default(0),
})

export async function addPlayersAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const competitionId = fd.get('competition_id') as string
  const nationalTeamId = fd.get('national_team_id') as string
  const rawLines = (fd.get('bulk_lines') as string ?? '').trim()

  if (!rawLines) throw new Error('Nessun dato inserito')

  const rows = rawLines
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      return {
        sportmonks_player_id: parts[0],
        name: parts[1],
        shirt_number: parts[2] || undefined,
        role: parts[3],
        base_price: parts[4] || 0,
      }
    })

  const errors: string[] = []
  const valid: Array<{
    competition_id: string
    national_team_id: string
    sportmonks_player_id: number
    name: string
    shirt_number?: number
    role: 'P' | 'D' | 'C' | 'A'
    base_price: number
  }> = []

  for (const [i, row] of rows.entries()) {
    const parsed = PlayerRowSchema.safeParse(row)
    if (!parsed.success) {
      errors.push(`Riga ${i + 1}: ${parsed.error.issues[0]?.message}`)
      continue
    }
    valid.push({ competition_id: competitionId, national_team_id: nationalTeamId, ...parsed.data })
  }

  if (errors.length > 0 && valid.length === 0) {
    throw new Error(errors.join('\n'))
  }

  if (valid.length > 0) {
    const { error } = await supabase.from('fm_player').upsert(valid, {
      onConflict: 'competition_id,sportmonks_player_id',
      ignoreDuplicates: false,
    })
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/controfantamondiale/${competitionId}/players`)
}

export async function updatePlayerAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const id = fd.get('id') as string
  const competitionId = fd.get('competition_id') as string
  const role = fd.get('role') as 'P' | 'D' | 'C' | 'A'
  const base_price = Number(fd.get('base_price') ?? 0)
  const name = fd.get('name') as string

  await supabase
    .from('fm_player')
    .update({ role, base_price, name })
    .eq('id', id)

  revalidatePath(`/controfantamondiale/${competitionId}/players`)
}

export async function deletePlayerAction(playerId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_player').delete().eq('id', playerId)
  revalidatePath(`/controfantamondiale/${competitionId}/players`)
}
