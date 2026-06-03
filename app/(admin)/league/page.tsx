import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LeagueSettingsForm } from './LeagueSettingsForm'

export const metadata = { title: 'Impostazioni Lega' }

const FM_STATUS_LABEL: Record<string, string> = {
  draft:     'Bozza',
  active:    'Attiva',
  completed: 'Conclusa',
}

const FM_STATUS_COLOR: Record<string, string> = {
  draft:     'text-ink-4 bg-glass-2',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
}

export default async function LeagueSettingsPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // All competitions across both sides: Serie A (campionato/battle_royale/coppa)
  // and FantaMondiale. Used to render the per-competition setup links so
  // every active competition appears explicitly in Impostazioni.
  //
  // FM is listed via this Lega's INSTANCES (fm_league_competition), not the
  // global templates — the setup route resolves the URL [id] as the Lega
  // instance id, so linking the template id would dead-end on /dashboard.
  const [{ data: serieAComps }, { data: fmInstances }] = await Promise.all([
    supabase
      .from('competitions')
      .select('id, slug, name, type, status, season')
      .eq('league_id', ctx.league.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('fm_league_competition')
      .select('id, slug, fm_competition(name, edition, status)')
      .eq('league_id', ctx.league.id)
      .order('created_at', { ascending: true }),
  ])

  // Normalize the embedded template join (PostgREST may type it as array).
  const fmComps = (fmInstances ?? []).map((row) => {
    const tpl = Array.isArray(row.fm_competition) ? row.fm_competition[0] : row.fm_competition
    return {
      legaCompId: row.slug ?? row.id,
      name: tpl?.name ?? 'FantaMondiale',
      edition: tpl?.edition ?? '',
      status: tpl?.status ?? 'draft',
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Impostazioni</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Identità della lega, regole di gioco condivise, e impostazioni specifiche di ogni
          competizione. Ogni sezione indica chiaramente il suo ambito.
        </p>
      </div>

      {/* ── Identità + Serie A draft ── */}
      <LeagueSettingsForm league={ctx.league} />

      {/* ── Regole di gioco ── */}
      <Card>
        <CardHeader
          title="Regole di gioco"
          description="Motore di calcolo, bonus/malus, soglie gol, popolarità, MVP. Valide per OGNI competizione (Campionato, Battle Royale, Coppa, Fantamondiale)."
        />
        <CardContent>
          <a
            href="/regole-di-gioco"
            className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-3 transition-colors hover:bg-indigo-500/10"
          >
            <div>
              <p className="text-[13px] font-semibold text-indigo-300">Apri Regole di gioco →</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                Pivot, bonus/malus, soglie gol, smussamento, punti W/D/L, fasce popolarità e MVP.
              </p>
            </div>
            <span className="text-indigo-300">→</span>
          </a>
        </CardContent>
      </Card>

      {/* ── Competizioni: una riga per ogni competizione attiva ── */}
      <Card>
        <CardHeader
          title="Competizioni"
          description="Ogni competizione ha il proprio Setup: rosa, formazioni, struttura del calendario. Le regole di calcolo restano globali (vedi sopra)."
        />
        <CardContent>
          <div className="space-y-2">
            {(serieAComps ?? []).length === 0 && fmComps.length === 0 && (
              <p className="text-[12px] text-ink-4">Nessuna competizione configurata.</p>
            )}

            {(serieAComps ?? []).map((c) => (
              <a
                key={c.id}
                href={`/competitions/${c.slug ?? c.id}`}
                className="flex items-center justify-between rounded-lg border border-hairline bg-glass-1 px-4 py-3 transition-colors hover:bg-glass-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold">Serie A</span>
                    <p className="text-[13px] font-semibold text-ink-1">{c.name}</p>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    {c.type === 'campionato' ? 'Campionato (testa a testa)'
                     : c.type === 'battle_royale' ? 'Battle Royale (tutti contro tutti)'
                     : 'Coppa (a eliminazione)'}
                    {c.season ? ` · ${c.season}` : ''}
                    {' · '}usa il draft settimanale Serie A configurato sopra
                  </p>
                </div>
                <span className="text-ink-4">→</span>
              </a>
            ))}

            {fmComps.map((c) => (
              <a
                key={c.legaCompId}
                href={`/fantamondiale/${c.legaCompId}/config`}
                className="flex items-center justify-between rounded-lg border border-hairline bg-glass-1 px-4 py-3 transition-colors hover:bg-glass-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-widest text-indigo-300 font-semibold">Fantamondiale</span>
                    <p className="text-[13px] font-semibold text-ink-1">{c.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${FM_STATUS_COLOR[c.status] ?? 'text-ink-4 bg-glass-2'}`}>
                      {FM_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    Edizione {c.edition} · Setup rosa, formazioni e matrice allenatore.
                    Rosa rigenerata a ogni nuova Fase (es. Mondiale: Gironi → Ottavi → Quarti →
                    Semifinali → Finale).
                  </p>
                </div>
                <span className="text-ink-4">→</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Sezioni operative ── */}
      <Card>
        <CardHeader
          title="Altre sezioni"
          description="Gestione membri, ruoli ambigui, rose Serie A, formazioni, monitoring."
        />
        <CardContent>
          <nav className="space-y-1">
            <a
              href="/league/members"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Membri e inviti</p>
                <p className="text-xs text-ink-3">Invita manager, cambia ruoli, gestisci le squadre</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/league/role-rules"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Regole ruoli ambigui</p>
                <p className="text-xs text-ink-3">Configura E → DEF o MID e altri ruoli ambigui (Serie A)</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/formations"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Formazioni valide</p>
                <p className="text-xs text-ink-3">Gestisci formazioni e slot Mantra (Serie A)</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/roster"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Gestione rose</p>
                <p className="text-xs text-ink-3">Visualizza e modifica le rose Serie A</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/league/cron-status"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Stato cron SportMonks</p>
                <p className="text-xs text-ink-3">Ultimo tick, errori 24h, cronologia run</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
          </nav>
        </CardContent>
      </Card>

      <p className="text-[11px] text-ink-4">
        Lega: <span className="font-mono text-ink-3">{ctx.league.name}</span>
      </p>
    </div>
  )
}
