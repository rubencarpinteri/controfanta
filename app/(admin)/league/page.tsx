import { requireLeagueAdmin, isSuperAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LeagueSettingsForm } from './LeagueSettingsForm'
import { EngineConfigForm } from '../regole-di-gioco/EngineConfigForm'
import { InviteLinkCard } from './members/InviteLinkCard'
import { ImmunitaToggle } from './ImmunitaToggle'

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

function ScopePill({ color, children }: { color: 'green' | 'indigo'; children: React.ReactNode }) {
  const cls =
    color === 'green'
      ? 'bg-emerald-500/10 text-emerald-400'
      : 'bg-indigo-500/10 text-indigo-300'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  )
}

export default async function LeagueSettingsPage() {
  const ctx = await requireLeagueAdmin()
  const superAdmin = await isSuperAdmin()
  const supabase = await createClient()

  const [{ data: leagueInvite }, { data: serieAComps }, { data: fmInstances }, { data: engineConfig }] = await Promise.all([
    supabase
      .from('leagues')
      .select('invite_token')
      .eq('id', ctx.league.id)
      .single(),
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
    supabase
      .from('league_engine_config')
      .select('*')
      .eq('league_id', ctx.league.id)
      .maybeSingle(),
  ])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://controfanta.vercel.app'
  const joinUrl = leagueInvite?.invite_token ? `${appUrl}/join/${leagueInvite.invite_token}` : null

  const fmComps = (fmInstances ?? []).map((row) => {
    const tpl = Array.isArray(row.fm_competition) ? row.fm_competition[0] : row.fm_competition
    return {
      legaCompId: row.slug ?? row.id,
      name: tpl?.name ?? 'ControFanta Mondiale',
      edition: tpl?.edition ?? '',
      status: tpl?.status ?? 'draft',
    }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Impostazioni</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Tutto in un posto. Il badge su ogni sezione indica a che livello si applica la modifica.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
            Invita amici
          </p>
          <h2 className="mt-1 text-lg font-bold text-ink-1">
            Copia il link e mandalo al gruppo
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">
            Chi apre il link vede chi lo ha invitato, entra in questa Lega e viene portato
            subito a creare la Squadra per il ControFanta Mondiale.
          </p>
        </div>
        <InviteLinkCard
          joinUrl={joinUrl}
          leagueName={ctx.league.name}
        />
      </section>

      {/* ── Identità lega + Draft Serie A ───────────────────────────────── */}
      <LeagueSettingsForm league={ctx.league} />

      {/* ── Motore di calcolo (lega) ─────────────────────────────────────── */}
      {/* Bonus/malus and scoring math are per-Lega: each league admin tunes
          their own league_engine_config row (upserted on league_id by
          saveEngineConfigAction). Leagues without a saved row use the official
          standard defaults from domain/fantamondiale/config/defaults.ts. */}
      <Card>
        <CardHeader
          title="Motore di calcolo"
          description="Pivot, bonus/malus, popolarità, MVP, soglie gol e punti W/D/L."
          action={<ScopePill color="green">Tutta la lega</ScopePill>}
        />
        <CardContent>
          <EngineConfigForm current={engineConfig ?? null} />
        </CardContent>
      </Card>

      {/* ── Regole speciali ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Regole speciali"
          description="Dinamiche di gioco della lega. L'immunità è attivabile o disattivabile."
          action={<ScopePill color="green">Tutta la lega</ScopePill>}
        />
        <CardContent>
          <div className="rounded-lg border border-hairline bg-glass-1 px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ink-1">Immunità</p>
                <p className="mt-1 text-[12px] text-ink-3 leading-relaxed max-w-prose">
                  Se un giocatore è presente in <strong className="text-ink-2">una sola formazione effettiva</strong> della lega durante una giornata
                  (titolare che ha giocato, oppure riserva entrata in campo), il malus per cartellino giallo e rosso viene annullato.
                  Il cartellino appare nel dettaglio del punteggio come <span className="font-mono text-[11px]">Giallo (Immunità)</span> o <span className="font-mono text-[11px]">Rosso (Immunità)</span> a 0 punti — l&apos;immunità copre entrambi.
                </p>
              </div>
              <ImmunitaToggle initialEnabled={engineConfig?.immunita_enabled ?? true} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Competizioni ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Competizioni"
          description="Rosa, formazioni, fasi e budget. Le regole di calcolo restano globali."
          action={<ScopePill color="indigo">Per competizione</ScopePill>}
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
                  </p>
                </div>
                <span className="text-ink-4">→</span>
              </a>
            ))}

            {fmComps.map((c) => (
              <a
                key={c.legaCompId}
                href={`/controfantamondiale/${c.legaCompId}/config`}
                className="flex items-center justify-between rounded-lg border border-hairline bg-glass-1 px-4 py-3 transition-colors hover:bg-glass-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-widest text-indigo-300 font-semibold">ControFanta Mondiale</span>
                    <p className="text-[13px] font-semibold text-ink-1">{c.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${FM_STATUS_COLOR[c.status] ?? 'text-ink-4 bg-glass-2'}`}>
                      {FM_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    Edizione {c.edition} · Setup rosa, formazioni e matrice allenatore.
                  </p>
                </div>
                <span className="text-ink-4">→</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Gestione operativa (lega) ────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Gestione"
          description="Membri e inviti della lega."
        />
        <CardContent>
          <nav className="space-y-1">
            {[
              { href: '/league/members',    label: 'Membri e inviti',      sub: 'Invita manager, cambia ruoli, gestisci le squadre' },
            ].map(({ href, label, sub }) => (
              <a
                key={href}
                href={href}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
              >
                <div>
                  <p className="font-medium text-ink-1">{label}</p>
                  <p className="text-xs text-ink-3">{sub}</p>
                </div>
                <span className="text-ink-4">→</span>
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      {/* ── Piattaforma (super-admin) ────────────────────────────────────── */}
      {/* Site-structure surfaces shared across every lega — never shown to a
          plain lega admin. */}
      {superAdmin && (
        <Card>
          <CardHeader
            title="Piattaforma"
            description="Infrastruttura condivisa da tutte le leghe."
            action={<ScopePill color="indigo">Piattaforma</ScopePill>}
          />
          <CardContent>
            <nav className="space-y-1">
              {[
                { href: '/league/cron-status', label: 'Stato cron SportMonks', sub: 'Ultimo tick, errori 24h, cronologia run' },
              ].map(({ href, label, sub }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">{label}</p>
                    <p className="text-xs text-ink-3">{sub}</p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
              ))}
            </nav>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-ink-4">
        Lega: <span className="font-mono text-ink-3">{ctx.league.name}</span>
      </p>
    </div>
  )
}
