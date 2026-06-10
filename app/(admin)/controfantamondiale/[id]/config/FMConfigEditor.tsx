'use client'

import { useState, useTransition } from 'react'
import { saveConfigAction } from './actions'
import type { FMCompetitionConfig, FMRoleQuota } from '@/domain/fantamondiale/config/schema'

// ── ControFanta Mondiale competition shape editor ──────────────────────────────────
//
// This editor manages ONLY the competition-shape fields that legitimately
// differ between FM competitions (Trial Scottish, Main FM, future WC):
//
//   * squad: pool size, starters, bench, default budget
//   * formations: allowed X-Y-Z lineups
//   * coach_tier_matrix: tier × result rewards
//   * tie_breakers: ordered list (read-only for now)
//
// All scoring rules (engine pivot, bonus/malus, popularity penalty,
// MVP bonus, goal thresholds, smoothing, W/D/L points) come from
// the single global Regole di gioco. They are NOT edited here.
// ────────────────────────────────────────────────────────────────────────────

const TIER_LABELS = {
  tier_1: 'Tier 1 (top)',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
  tier_4: 'Tier 4 (sfavorito)',
} as const

const ROLE_LABELS: Record<keyof FMRoleQuota, string> = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
}

export function FMConfigEditor({
  competitionId,
  initialConfig,
}: {
  competitionId: string
  initialConfig: FMCompetitionConfig
}) {
  const [cfg, setCfg] = useState(initialConfig)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function updateSquad<K extends Exclude<keyof FMCompetitionConfig['squad'], 'role_quotas'>>(
    key: K, value: FMCompetitionConfig['squad'][K]
  ) {
    setCfg((prev) => ({ ...prev, squad: { ...prev.squad, [key]: value } }))
    setSaved(false)
  }

  function updateRoleQuota(role: keyof FMRoleQuota, value: number) {
    setCfg((prev) => {
      const role_quotas = { ...prev.squad.role_quotas, [role]: value }
      const pool_size = role_quotas.P + role_quotas.D + role_quotas.C + role_quotas.A
      return { ...prev, squad: { ...prev.squad, role_quotas, pool_size } }
    })
    setSaved(false)
  }

  function updateCoachTier(
    tier: keyof FMCompetitionConfig['coach_tier_matrix'],
    field: 'win' | 'draw' | 'loss',
    value: number
  ) {
    setCfg((prev) => ({
      ...prev,
      coach_tier_matrix: {
        ...prev.coach_tier_matrix,
        [tier]: { ...prev.coach_tier_matrix[tier], [field]: value },
      },
    }))
    setSaved(false)
  }

  function updateKnockoutDrawMode(value: FMCompetitionConfig['coach_knockout_draw_mode']) {
    setCfg((prev) => ({ ...prev, coach_knockout_draw_mode: value }))
    setSaved(false)
  }

  function updateSubstitution<K extends keyof FMCompetitionConfig['substitution']>(
    key: K, value: FMCompetitionConfig['substitution'][K]
  ) {
    setCfg((prev) => ({ ...prev, substitution: { ...prev.substitution, [key]: value } }))
    setSaved(false)
  }

  function updateFormations(text: string) {
    const list = text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d-\d-\d$/.test(s))
    setCfg((prev) => ({ ...prev, formations: list.length > 0 ? list : prev.formations }))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('config_json', JSON.stringify(cfg))
    startTransition(async () => {
      try {
        await saveConfigAction(fd)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Save bar ── */}
      <div className="sticky top-[52px] z-20 flex items-center justify-between rounded-xl border border-hairline bg-glass-1/90 backdrop-blur-xl px-4 py-3">
        <p className="text-[12px] text-ink-3">
          {saved ? '✓ Salvato' : 'Modifiche non salvate'}
        </p>
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {pending ? 'Salvo…' : 'Salva configurazione'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-300 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* ── Scope banner ── */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
        <p className="text-[13px] font-semibold text-indigo-300">
          Le regole di calcolo sono globali
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3 leading-relaxed">
          Motore (pivot, bonus/malus), popolarità, MVP, soglie gol e punti per risultato valgono
          per ogni competizione della lega.
          <a href="/regole-di-gioco" className="ml-1 text-indigo-300 underline hover:text-indigo-200">
            Vai a Regole di gioco →
          </a>
        </p>
        <p className="mt-2 text-[11px] text-ink-4 leading-relaxed">
          In questa pagina configuri solo gli aspetti specifici di questa competizione:
          dimensione rosa, budget di default, formazioni consentite e matrice tier × risultato per l&apos;allenatore.
        </p>
      </div>

      {/* ── Squad & budget ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-4">
        <p className="text-[13px] font-semibold text-ink-1">Rosa e budget</p>
        <p className="text-[11px] text-ink-4 leading-relaxed">
          Il <span className="font-medium text-ink-2">budget di riserva</span> vale solo per le fasi
          che non hanno un budget proprio. Il budget vero, fase per fase, si imposta in
          &ldquo;Budget per fase&rdquo; qui sotto.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(
            [
              ['starters',  'Titolari',                1],
              ['bench',     'Panchina',                1],
              ['budget_default', 'Budget di riserva (fallback)', 10],
            ] as const
          ).map(([key, label, step]) => (
            <div key={key}>
              <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">{label}</label>
              <input
                type="number"
                step={step}
                value={cfg.squad[key]}
                onChange={(e) => updateSquad(key, Number(e.target.value))}
                className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t border-hairline">
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] font-semibold text-ink-2">Composizione per ruolo</p>
            <p className="text-[11px] text-ink-4 tabular-nums">
              Totale rosa: <span className="font-medium text-ink-1">{cfg.squad.pool_size}</span>
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(['P', 'D', 'C', 'A'] as const).map((role) => (
              <div key={role}>
                <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">
                  {ROLE_LABELS[role]}
                </label>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={cfg.squad.role_quotas[role]}
                  onChange={(e) => updateRoleQuota(role, Number(e.target.value))}
                  className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Formations ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Formazioni consentite</p>
        <p className="text-[11px] text-ink-4">
          Lista separata da virgola o spazio nel formato <span className="font-mono">X-Y-Z</span>
          (es. <span className="font-mono">3-4-3, 4-4-2, 5-3-2</span>).
        </p>
        <input
          type="text"
          defaultValue={cfg.formations.join(', ')}
          onBlur={(e) => updateFormations(e.target.value)}
          className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] font-mono text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="flex flex-wrap gap-1">
          {cfg.formations.map((f) => (
            <span key={f} className="rounded border border-hairline bg-glass-2 px-2 py-0.5 text-[11px] font-mono text-ink-2">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* ── Substitution rule ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-4">
        <div>
          <p className="text-[13px] font-semibold text-ink-1">Sostituzioni</p>
          <p className="mt-0.5 text-[11px] text-ink-4 leading-relaxed">
            Il modulo scelto è insindacabile: un titolare che non gioca viene sostituito dalla
            prima riserva dello stesso ruolo, in ordine di panchina. Niente sostituzioni tra ruoli
            diversi — finita la panchina del ruolo, lo slot resta vuoto e si gioca in meno.
          </p>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1.5 font-semibold">
            Quando scatta la sostituzione
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                ['min_minutes', 'Minuti minimi', 'Sostituisci se il titolare gioca meno dei minuti indicati'],
                ['no_rating', 'Nessun voto (s.v.)', 'Sostituisci solo se il titolare non ha un voto utilizzabile'],
              ] as const
            ).map(([value, label, desc]) => {
              const active = cfg.substitution.trigger === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSubstitution('trigger', value)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-hairline bg-glass-2 hover:bg-glass-1'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${active ? 'text-indigo-300' : 'text-ink-2'}`}>
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-4 leading-snug">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {cfg.substitution.trigger === 'min_minutes' && (
          <div className="max-w-[180px]">
            <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">
              Minuti minimi
            </label>
            <input
              type="number"
              step={1}
              min={0}
              max={90}
              value={cfg.substitution.min_minutes}
              onChange={(e) => updateSubstitution('min_minutes', Number(e.target.value))}
              className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {/* ── Coach tier matrix ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Allenatore — Matrice Tier × Risultato</p>
        <p className="text-[11px] text-ink-4">
          Punti che l&apos;allenatore aggiunge al raw subtotal della squadra fantasy in base
          al tier della nazionale e al risultato della partita reale.
        </p>
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full text-[12px] tabular-nums">
            <thead>
              <tr className="border-b border-hairline">
                <th className="px-3 py-2 text-left text-ink-4 font-medium">Tier</th>
                <th className="px-3 py-2 text-center text-emerald-400 font-medium">Vittoria</th>
                <th className="px-3 py-2 text-center text-ink-4 font-medium">Pareggio</th>
                <th className="px-3 py-2 text-center text-rose-400 font-medium">Sconfitta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(['tier_1', 'tier_2', 'tier_3', 'tier_4'] as const).map((tier) => {
                const row = cfg.coach_tier_matrix[tier]
                return (
                  <tr key={tier}>
                    <td className="px-3 py-2 text-ink-2 font-medium">{TIER_LABELS[tier]}</td>
                    {(['win', 'draw', 'loss'] as const).map((field) => (
                      <td key={field} className="px-3 py-1.5 text-center">
                        <input
                          type="number"
                          step={1}
                          value={row[field]}
                          onChange={(e) => updateCoachTier(tier, field, Number(e.target.value))}
                          className="w-16 rounded border border-hairline bg-glass-2 px-2 py-1 text-center text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Knockout draw mode ── */}
        <div className="space-y-2 pt-2">
          <p className="text-[12px] font-semibold text-ink-2">Fase a eliminazione — Pareggi</p>
          <p className="text-[11px] text-ink-4">
            Come viene assegnato il bonus allenatore quando una gara a eliminazione finisce
            in parità ed è decisa ai rigori.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {([
              ['draw', 'Il pareggio conta', 'Si usa la colonna “Pareggio” della matrice anche nei rigori.'],
              ['advancer_wins', 'Vince chi passa', 'Niente pareggio: chi avanza (o vince il titolo) prende la vittoria, l’altro la sconfitta.'],
            ] as const).map(([mode, label, desc]) => {
              const active = cfg.coach_knockout_draw_mode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateKnockoutDrawMode(mode)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-hairline bg-glass-2 hover:border-hairline-strong'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${active ? 'text-ink-1' : 'text-ink-2'}`}>
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-4">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
