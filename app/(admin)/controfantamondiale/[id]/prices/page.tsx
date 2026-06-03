import { requireFMContext, assertSuperAdmin, getFMPhases, getFMTeams, getFMPlayers } from '@/lib/fantamondiale/server'
import { createClient } from '@/lib/supabase/server'
import { bulkImportPricesAction, copyPhasePricesAction } from './actions'
import { PriceGrid } from './PriceGrid'

export default async function PricesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)

  const [phases, teams, players] = await Promise.all([
    getFMPhases(ctx.competition.id),
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id),
  ])

  const supabase = await createClient()
  const { data: priceRows } = await supabase
    .from('fm_phase_player_price')
    .select('phase_id, player_id, price, source')
    .in('phase_id', phases.map((p) => p.id))

  const priceMap = new Map<string, number>(
    (priceRows ?? []).map((r) => [`${r.phase_id}:${r.player_id}`, r.price])
  )

  const pricedCounts = phases.map((phase) => ({
    phaseId: phase.id,
    count: players.filter((p) => priceMap.has(`${phase.id}:${p.id}`)).length,
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-ink-1">Prezzi</h2>
        <p className="text-[11px] text-ink-4">{players.length} giocatori</p>
      </div>

      {/* ── Bulk CSV import ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-4">Importa prezzi da CSV</p>
        <p className="mb-3 text-[10px] text-ink-5">
          Formato: <code className="font-mono text-ink-4">sportmonks_player_id, prezzo</code> — una riga per giocatore.
        </p>
        <form action={bulkImportPricesAction} className="space-y-3">
          <input type="hidden" name="competition_id" value={id} />
          <div className="grid grid-cols-2 gap-3">
            <select
              name="phase_id" required
              className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Seleziona fase —</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              name="source" placeholder="Fonte (es. fantacalcio.it)" defaultValue="csv_import"
              className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <textarea
            name="price_lines"
            rows={5}
            placeholder={'345678, 35\n901234, 18\n567890, 22'}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 font-mono text-[12px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
          />
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
            Importa prezzi
          </button>
        </form>
      </div>

      {/* ── Copy between phases ─────────────────────────────────────────────── */}
      {phases.length > 1 && (
        <div className="rounded-xl border border-hairline bg-glass-1 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-4">Copia prezzi da una fase</p>
          <form action={async (fd: FormData) => {
            'use server'
            const from = fd.get('from_phase_id') as string
            const to = fd.get('to_phase_id') as string
            await copyPhasePricesAction(from, to, id)
          }} className="flex gap-2">
            <select name="from_phase_id" className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="flex items-center text-ink-5 text-sm">→</span>
            <select name="to_phase_id" className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-surface-2 border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-glass-2 transition-colors">
              Copia
            </button>
          </form>
        </div>
      )}

      {/* ── Phase coverage summary ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pricedCounts.map(({ phaseId, count }) => {
          const phase = phases.find((p) => p.id === phaseId)
          if (!phase) return null
          const pct = players.length > 0 ? Math.round((count / players.length) * 100) : 0
          return (
            <div key={phaseId} className="rounded-xl border border-hairline bg-glass-1 p-3">
              <p className="text-[10px] font-semibold text-ink-4 truncate">{phase.name}</p>
              <p className="text-[18px] font-light tabular-nums text-ink-1 mt-0.5">{count}</p>
              <div className="mt-1 h-1 rounded-full bg-glass-3 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[9px] text-ink-5 mt-1">{pct}% dei giocatori prezzati</p>
            </div>
          )
        })}
      </div>

      {/* ── Editable price grid per phase ─────────────────────────────────── */}
      {phases.map((phase) => (
        <PriceGrid
          key={phase.id}
          competitionId={id}
          phase={phase}
          teams={teams}
          players={players}
          priceMap={priceMap}
        />
      ))}
    </div>
  )
}
