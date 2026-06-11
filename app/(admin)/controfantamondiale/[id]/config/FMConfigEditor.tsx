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

// Canonical mantra modules offered as toggleable chips. The active list can
// also contain custom modules typed in the text field — those are merged in.
const CANONICAL_MODULES = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'] as const

// Knockout matrix rows, by favoredness (opponentTier − ownTier, −3…+3).
const KO_ROWS = [
  { key: 'fav_pos3', label: 'Super favorito (+3)' },
  { key: 'fav_pos2', label: 'Favorito (+2)' },
  { key: 'fav_pos1', label: 'Leggero favorito (+1)' },
  { key: 'fav_even', label: 'Equilibrio (0)' },
  { key: 'fav_neg1', label: 'Leggero sfavorito (−1)' },
  { key: 'fav_neg2', label: 'Sfavorito (−2)' },
  { key: 'fav_neg3', label: 'Super sfavorito (−3)' },
] as const

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

  function updateCoachKnockout(
    key: keyof FMCompetitionConfig['coach_tier_knockout_matrix'],
    field: 'win' | 'draw' | 'loss',
    value: number
  ) {
    setCfg((prev) => ({
      ...prev,
      coach_tier_knockout_matrix: {
        ...prev.coach_tier_knockout_matrix,
        [key]: { ...prev.coach_tier_knockout_matrix[key], [field]: value },
      },
    }))
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

  function toggleFormation(mod: string) {
    setCfg((prev) => {
      const has = prev.formations.includes(mod)
      // Never allow emptying the list — at least one module must stay enabled.
      if (has && prev.formations.length === 1) return prev
      const formations = has
        ? prev.formations.filter((f) => f !== mod)
        : [...prev.formations, mod]
      return { ...prev, formations }
    })
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

      {/* ── Allowed modules ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Moduli Disponibili</p>
        <p className="text-[11px] text-ink-4">
          Tocca un modulo per consentirlo (verde) o disattivarlo (rosso). Almeno un modulo
          deve restare attivo.
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from(new Set([...CANONICAL_MODULES, ...cfg.formations])).map((mod) => {
            const on = cfg.formations.includes(mod)
            return (
              <button
                key={mod}
                type="button"
                onClick={() => toggleFormation(mod)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-mono font-semibold transition-colors active:translate-y-px ${
                  on
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-rose-500/30 bg-rose-500/5 text-rose-500/70 hover:bg-rose-500/10'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-rose-500/60'}`} />
                {mod}
              </button>
            )
          })}
        </div>
        <details className="pt-1">
          <summary className="cursor-pointer text-[11px] text-ink-4 hover:text-ink-2">
            Aggiungi un modulo personalizzato
          </summary>
          <input
            type="text"
            defaultValue={cfg.formations.join(', ')}
            onBlur={(e) => updateFormations(e.target.value)}
            placeholder="es. 3-4-3, 4-4-2, 5-3-2"
            className="mt-2 w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] font-mono text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </details>
      </div>

      {/* ── Coach tier matrix ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Allenatore — Fase a gironi (Tier × Risultato)</p>
        <p className="text-[11px] text-ink-4">
          Punti che l&apos;allenatore aggiunge al raw subtotal della squadra fantasy in base
          al tier della nazionale e al risultato della partita reale. Vale solo nella fase a gironi.
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

        {/* ── Knockout matrix (favoredness) ── */}
        <div className="space-y-2 pt-4 mt-2 border-t border-hairline">
          <p className="text-[13px] font-semibold text-ink-1">Allenatore — Eliminazione diretta (Favore × Risultato)</p>
          <p className="text-[11px] text-ink-4 leading-relaxed">
            Dalla fase a eliminazione il bonus non dipende più dal solo tier, ma dal{' '}
            <span className="font-medium text-ink-2">favore</span> = tier avversario − tier proprio
            (−3…+3). I favoriti guadagnano poco vincendo e sono puniti duramente se perdono; gli
            sfavoriti il contrario.
          </p>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-3 py-2 text-left text-ink-4 font-medium">Favore</th>
                  <th className="px-3 py-2 text-center text-emerald-400 font-medium">Vittoria</th>
                  <th className="px-3 py-2 text-center text-ink-4 font-medium">Pareggio</th>
                  <th className="px-3 py-2 text-center text-rose-400 font-medium">Sconfitta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {KO_ROWS.map(({ key, label }) => {
                  const row = cfg.coach_tier_knockout_matrix[key]
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2 text-ink-2 font-medium whitespace-nowrap">{label}</td>
                      {(['win', 'draw', 'loss'] as const).map((field) => (
                        <td key={field} className="px-3 py-1.5 text-center">
                          <input
                            type="number"
                            step={1}
                            value={row[field]}
                            onChange={(e) => updateCoachKnockout(key, field, Number(e.target.value))}
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
          <p className="text-[11px] text-ink-4">
            La colonna <span className="font-medium text-ink-2">Pareggio</span> si applica solo se la
            gara è decisa ai rigori e la modalità sotto è impostata su &ldquo;Il pareggio conta&rdquo;.
          </p>
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
