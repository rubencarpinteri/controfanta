import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { optLegaIntoFMCompetitionAction } from '../../../dashboard/actions'

export const metadata = { title: 'Nuova competizione · Internazionale' }

const STATUS_LABEL: Record<string, string> = {
  open:        'Iscrizioni aperte',
  in_progress: 'In corso',
}

const STATUS_CLS: Record<string, string> = {
  open:        'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10',
  in_progress: 'text-amber-600 dark:text-amber-300 bg-amber-500/10',
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function NewInternationalCompetitionPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const [fmRes, legaInstancesRes] = await Promise.all([
    supabase
      .from('fm_competition')
      .select('id, name, edition, starts_at, ends_at, status')
      .in('status', ['open', 'in_progress'])
      .order('starts_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('fm_league_competition')
      .select('fm_competition_id')
      .eq('league_id', ctx.league.id),
  ])

  const enrolled = new Set(
    (legaInstancesRes.data ?? []).map((r) => r.fm_competition_id),
  )
  const eligible = (fmRes.data ?? []).filter((c) => !enrolled.has(c.id))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/competitions/new" className="text-sm text-ink-4 hover:text-indigo-400">
          ← Scegli livello
        </a>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
          Livello internazionale
        </p>
        <h1 className="mt-1 text-xl font-bold text-ink-1">Iscrivi la Lega a un torneo</h1>
        <p className="text-sm text-ink-4">
          Le competizioni internazionali sono tornei reali (Mondiali, Europei, Nations League)
          condivisi sulla piattaforma: calendario, nazionali e rose vengono dai dati ufficiali. La
          tua Lega gioca la sua versione privata — formato Battle Royal, classifica e squadre solo
          tra i tuoi manager.
        </p>
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-strong bg-glass-1 px-5 py-10 text-center backdrop-blur-xl">
          <p className="text-[13px] text-ink-4">
            Nessun torneo internazionale disponibile al momento.
          </p>
          <p className="mt-1 text-[11px] text-ink-5">
            I tornei internazionali (Mondiali, Europei, Nations League) vengono allestiti sulla
            piattaforma a ridosso dell&apos;evento reale — es. Mondiali 2026 a giugno. Quando un
            torneo apre le iscrizioni comparirà qui, pronto per iscrivere la tua Lega.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {eligible.map((c) => {
            const optIn = optLegaIntoFMCompetitionAction.bind(null, c.id)
            const startsLabel = formatDate(c.starts_at)
            const endsLabel = formatDate(c.ends_at)
            return (
              <div
                key={c.id}
                className="flex items-center gap-4 rounded-2xl border border-hairline bg-glass-1 px-5 py-4 backdrop-blur-xl"
              >
                <span className="text-2xl" aria-hidden>🌍</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                      {c.edition}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CLS[c.status] ?? ''}`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[14.5px] font-semibold tracking-tight text-ink-1">
                    {c.name}
                  </p>
                  {(startsLabel || endsLabel) && (
                    <p className="mt-1 text-[11.5px] text-ink-4">
                      {startsLabel ?? '—'}
                      {endsLabel ? ` → ${endsLabel}` : ''}
                    </p>
                  )}
                </div>
                <form action={optIn} className="shrink-0">
                  <button
                    type="submit"
                    className="rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
                  >
                    Iscrivi la Lega
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
