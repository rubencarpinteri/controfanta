import { requireFMContext, assertSuperAdmin } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { loadFMUnifiedConfig } from '@/lib/fantamondiale/loadUnifiedConfig'
import { FMConfigEditor } from './FMConfigEditor'

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)

  const supabase = await createClient()
  const config = await loadFMUnifiedConfig(supabase, id)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Setup competizione</h2>
        <p className="mt-0.5 text-[11px] text-ink-4">
          Dimensione rosa, budget di default per fase, formazioni consentite e matrice allenatore
          per questa competizione. Le regole di calcolo (motore, bonus/malus, soglie gol) sono globali
          e si modificano in Regole di gioco. Il calendario delle Fasi e dei Turni si configura
          nelle rispettive tab.
        </p>
      </div>

      <FMConfigEditor competitionId={id} initialConfig={config} />
    </div>
  )
}
