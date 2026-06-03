import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Competition } from '@/types/database.types'

const TYPE_LABEL: Record<string, string> = {
  campionato:    'Campionato',
  battle_royale: 'Battle Royale',
  coppa:         'Coppa',
}

const TYPE_ICON: Record<string, string> = {
  campionato:    '🏟',
  battle_royale: '⚔',
  coppa:         '🏆',
}

const STATUS_LABEL: Record<string, string> = {
  setup:     'Setup',
  active:    'Attiva',
  completed: 'Conclusa',
  cancelled: 'Annullata',
}

const STATUS_COLOR: Record<string, string> = {
  setup:     'text-ink-4 bg-glass-2',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}

export default async function CompetitionsPage() {
  await requireLeagueAdmin()
  const ctx = await import('@/lib/league').then((m) => m.requireLeagueAdmin())
  const supabase = await createClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('created_at', { ascending: true })

  const list = (competitions ?? []) as Competition[]

  // Per-competition team counts
  const compIds = list.map((c) => c.id)
  const { data: teamCounts } = compIds.length > 0
    ? await supabase
        .from('competition_teams')
        .select('competition_id')
        .in('competition_id', compIds)
    : { data: [] }

  const teamCountMap = new Map<string, number>()
  for (const t of teamCounts ?? []) {
    teamCountMap.set(t.competition_id, (teamCountMap.get(t.competition_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">Competizioni</span>
            <span className="serif font-normal text-ink-3">— Campionato · Battle Royale · Coppa</span>
          </h1>
        </div>
        <a
          href="/competitions/new"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-[13px] font-medium tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
        >
          + Nuova competizione
        </a>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-ink-4">
              Nessuna competizione creata. Crea il Campionato, il Battle Royale e la Coppa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((comp) => (
            <a
              key={comp.id}
              href={`/competitions/${comp.slug ?? comp.id}`}
              className="group rounded-xl border border-hairline bg-glass-1 p-5 transition-colors hover:border-indigo-500/40 hover:bg-glass-2"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{TYPE_ICON[comp.type] ?? '🏆'}</span>
                  <div>
                    <p className="font-semibold text-ink-1 group-hover:text-indigo-300 transition-colors">
                      {comp.name}
                    </p>
                    <p className="text-xs text-ink-4">
                      {TYPE_LABEL[comp.type] ?? comp.type}
                      {comp.season ? ` · ${comp.season}` : ''}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[comp.status] ?? ''}`}
                >
                  {STATUS_LABEL[comp.status] ?? comp.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-4">
                <span>{teamCountMap.get(comp.id) ?? 0} squadre</span>
                <span>→ Gestisci</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
