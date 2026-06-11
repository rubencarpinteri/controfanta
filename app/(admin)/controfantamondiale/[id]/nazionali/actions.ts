'use server'

import { requireFMContext, assertSuperAdmin } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Manual override for the automatic knockout-elimination sweep
// (lib/fantamondiale/autoSchedule.ts). Competition-level — affects every Lega
// enrolled in this FM competition — so it's gated to super-admins, like the
// other nazionali/coaches/rounds surfaces.
export async function setTeamStatusAction(fd: FormData) {
  const ref = fd.get('competition_ref') as string
  const teamId = fd.get('team_id') as string
  const eliminate = fd.get('eliminate') === '1'

  const ctx = await requireFMContext(ref)
  assertSuperAdmin(ctx)

  const supabase = await createClient()
  await supabase
    .from('fm_national_team')
    .update({
      status: eliminate ? 'eliminated' : 'active',
      eliminated_at: eliminate ? new Date().toISOString() : null,
    })
    .eq('id', teamId)
    .eq('competition_id', ctx.competition.id)

  revalidatePath(`/controfantamondiale/${ref}/nazionali`)
}
