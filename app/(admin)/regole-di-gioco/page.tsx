import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EngineConfigForm } from './EngineConfigForm'

export const metadata = { title: 'Regole di gioco — CONTROFANTA' }

export default async function GameRulesPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <a
        href="/league"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink-1 transition-colors"
      >
        ← Impostazioni
      </a>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-1">Regole di gioco</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            Unico punto di configurazione del motore di calcolo, dei bonus/malus,
            delle soglie gol e dei criteri di risultato.
          </p>
        </div>
        <a
          href="/methodology"
          className="shrink-0 rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
        >
          Metodologia →
        </a>
      </div>

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
        <p className="text-[13px] font-semibold text-indigo-300">
          Queste regole valgono per ogni competizione
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3 leading-relaxed">
          Campionato, Battle Royale, Coppa e ControFanta Mondiale (Trial Scottish League, Main FM,
          futuro Mondiale) utilizzano tutti i parametri qui sotto. Ogni modifica si applica
          all&apos;intera lega a partire dal prossimo calcolo.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Parametri motore v3.1 — Pivot + Bonus + Ownership"
          description="Pivot, bonus/malus, popolarità, MVP e soglie gol. Modifica i valori e salva."
        />
        <CardContent>
          <EngineConfigForm current={current ?? null} />
        </CardContent>
      </Card>
    </div>
  )
}
