'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveEngineConfigAction } from './actions'
import type { LeagueEngineConfig, Json } from '@/types/database.types'
import { DEFAULT_ENGINE_CONFIG, deriveSlope } from '@/domain/engine/v1/config'
import type { OwnershipBracket, CalcOrder } from '@/domain/engine/v1/types'
import type { GoalThreshold } from '@/domain/competitions/goalThresholds'
import type { SmoothingConfig, PointsConfig } from '@/domain/competitions/resultRules'
import { DEFAULT_RESULT_RULES } from '@/domain/competitions/resultRules'

// ── Submit button ────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
    >
      {pending ? 'Salvataggio…' : 'Salva configurazione'}
    </button>
  )
}

// ── Field helpers ────────────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  step = '0.01',
  min,
  max,
  hint,
}: {
  label: string
  name: string
  defaultValue: number
  step?: string
  min?: string
  max?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-ink-3" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
      />
      {hint && <p className="text-xs text-ink-4">{hint}</p>}
    </div>
  )
}

// ── Pivot section ────────────────────────────────────────────────────────────

function PivotSection({
  defaultPivotRating,
  defaultPivotVote,
}: {
  defaultPivotRating: number
  defaultPivotVote: number
}) {
  const [pivotRating, setPivotRating] = useState(defaultPivotRating)
  const [pivotVote,   setPivotVote]   = useState(defaultPivotVote)

  const slope = pivotRating < 10
    ? (10 - pivotVote) / (10 - pivotRating)
    : 1

  const examples: Array<[number, string]> = [
    [3.00, 'minimo SportMonks'],
    [5.50, 'brutta prova'],
    [6.45, 'tipica (mode)'],
    [6.50, 'baseline kickoff'],
    [6.72, 'media SportMonks'],
    [7.50, 'buona prova'],
    [8.50, 'ottima'],
    [9.50, 'top'],
    [10.00, 'massimo'],
  ]
  const fmt2 = (n: number) => n.toFixed(2)
  const compute = (r: number) => {
    const raw = pivotVote + slope * (r - pivotRating)
    return Math.max(1, Math.min(10, raw))
  }

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-indigo-300">Scala voto base</p>
        <p className="mt-1 text-xs text-ink-3 leading-relaxed">
          Una sola retta converte il voto SportMonks in voto base sulla scala 1–10.
          Il pivot ancora un valore SportMonks al voto italiano corrispondente; l&apos;altro
          estremo della retta è fissato a (10 → 10). Il bonus/malus si somma dopo.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-transparent p-3 space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-4">Formula</p>
        <p className="font-mono text-xs text-indigo-200">
          voto_base = {fmt2(pivotVote)} + {slope.toFixed(4)} × (rating − {fmt2(pivotRating)})
        </p>
        <p className="text-xs text-ink-4">
          Pendenza = (10 − {fmt2(pivotVote)}) / (10 − {fmt2(pivotRating)}) ={' '}
          <span className="font-mono text-ink-1">{slope.toFixed(4)}</span>.
          Risultato cappato tra 1 e 10.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-3" htmlFor="pivot_rating">
            Pivot — voto SportMonks
          </label>
          <input
            id="pivot_rating"
            name="pivot_rating"
            type="number"
            step="0.01"
            min="3"
            max="9.99"
            value={pivotRating}
            onChange={(e) => setPivotRating(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
          />
          <p className="text-xs text-ink-4">
            Default <span className="font-mono">6.50</span> = punto di partenza di ogni giocatore al fischio d&apos;inizio (SportMonks).
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-3" htmlFor="pivot_vote">
            Pivot — voto base
          </label>
          <input
            id="pivot_vote"
            name="pivot_vote"
            type="number"
            step="0.01"
            min="1"
            max="10"
            value={pivotVote}
            onChange={(e) => setPivotVote(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
          />
          <p className="text-xs text-ink-4">
            Default <span className="font-mono">6.00</span> = sufficienza italiana.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-transparent p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
          Tabella di conversione
        </p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {examples.map(([r, label]) => {
            const v = compute(r)
            const isAnchor = r === pivotRating || r === 10
            return (
              <div key={r} className="flex items-center justify-between gap-2">
                <span className="text-ink-3">
                  <span className="font-mono text-ink-1">{fmt2(r)}</span>{' '}
                  <span className="text-ink-4">{label}</span>
                </span>
                <span className={`font-mono font-semibold ${isAnchor ? 'text-indigo-300' : 'text-ink-1'}`}>
                  → {fmt2(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Ownership (trademark) section ───────────────────────────────────────────

function parseBracketsJson(raw: Json | null | undefined, fallback: OwnershipBracket[]): OwnershipBracket[] {
  if (!raw || !Array.isArray(raw)) return fallback
  const out: OwnershipBracket[] = []
  for (const item of raw) {
    if (
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).min_pct === 'number' &&
      typeof (item as Record<string, unknown>).max_pct === 'number' &&
      typeof (item as Record<string, unknown>).pct === 'number'
    ) {
      const o = item as Record<string, number>
      out.push({ min_pct: o.min_pct!, max_pct: o.max_pct!, pct: o.pct! })
    }
  }
  return out.length > 0 ? out : fallback
}

function BracketRow({
  bracket, onChange, onRemove,
}: {
  bracket: OwnershipBracket
  onChange: (b: OwnershipBracket) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} max={100} step={1}
          value={bracket.min_pct}
          onChange={(e) => onChange({ ...bracket, min_pct: Number(e.target.value) })}
          className="w-full rounded border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-indigo-400/60"
        />
        <span className="text-[10px] text-ink-4">–</span>
        <input
          type="number" min={0} max={100} step={1}
          value={bracket.max_pct}
          onChange={(e) => onChange({ ...bracket, max_pct: Number(e.target.value) })}
          className="w-full rounded border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-indigo-400/60"
        />
        <span className="text-[10px] text-ink-4">%</span>
      </div>
      <div className="col-span-2 flex items-center gap-1">
        <span className="text-[10px] text-ink-4 shrink-0">→</span>
        <input
          type="number" step={1}
          value={bracket.pct}
          onChange={(e) => onChange({ ...bracket, pct: Number(e.target.value) })}
          className="w-20 rounded border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-indigo-400/60"
        />
        <span className="text-[10px] text-ink-4">%</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[10px] text-ink-4 hover:text-rose-400"
        aria-label="Rimuovi fascia"
      >✕</button>
    </div>
  )
}

function BracketsEditor({
  title, hint, brackets, onChange,
}: {
  title: string
  hint: string
  brackets: OwnershipBracket[]
  onChange: (next: OwnershipBracket[]) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-4">{title}</p>
      <p className="mt-0.5 mb-3 text-[11px] text-ink-4">{hint}</p>
      <div className="space-y-1.5">
        {brackets.map((b, i) => (
          <BracketRow
            key={i}
            bracket={b}
            onChange={(next) => {
              const arr = [...brackets]
              arr[i] = next
              onChange(arr)
            }}
            onRemove={() => onChange(brackets.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange([...brackets, { min_pct: 0, max_pct: 100, pct: 0 }])}
          className="text-[11px] text-indigo-300 hover:text-indigo-200"
        >+ Aggiungi fascia</button>
      </div>
    </div>
  )
}

function bracketLookup(brackets: OwnershipBracket[], ownershipPct: number): number {
  const b = brackets.find((br) => ownershipPct >= br.min_pct && ownershipPct <= br.max_pct)
  return b?.pct ?? 0
}

function OwnershipSection({
  defaultPopularity,
  defaultMvp,
  defaultCalcOrder,
  exampleGoalBonus,
}: {
  defaultPopularity: OwnershipBracket[]
  defaultMvp: OwnershipBracket[]
  defaultCalcOrder: CalcOrder
  exampleGoalBonus: number
}) {
  const [popularity, setPopularity] = useState(defaultPopularity)
  const [mvp, setMvp]               = useState(defaultMvp)
  const [calcOrder, setCalcOrder]   = useState<CalcOrder>(defaultCalcOrder)

  // Live scenario preview — same striker (voto base 7.14), 8 scenarios crossing
  // goal/no-goal × MVP/no-MVP × ownership 30/40/50. raw_subtotal is derived from
  // the configured ATT goal bonus, never hardcoded.
  const exampleBaseVote = 7.14
  const exampleRaw = exampleBaseVote + exampleGoalBonus
  const samples: Array<{ label: string; ownership: number; mvp: boolean; goal: boolean }> = [
    { label: 'Gol · 8% · no MVP',          ownership: 8,  mvp: false, goal: true  },
    { label: 'Gol · 30% · no MVP',         ownership: 30, mvp: false, goal: true  },
    { label: 'Gol · 50% · no MVP',         ownership: 50, mvp: false, goal: true  },
    { label: 'Gol · 40% · MVP',            ownership: 40, mvp: true,  goal: true  },
    { label: 'Senza gol · 30% · no MVP',   ownership: 30, mvp: false, goal: false },
    { label: 'Senza gol · 50% · no MVP',   ownership: 50, mvp: false, goal: false },
    { label: 'Senza gol · 90% · no MVP',   ownership: 90, mvp: false, goal: false },
    { label: 'Senza gol · 40% · MVP',      ownership: 40, mvp: true,  goal: false },
  ]

  const previews = useMemo(() => {
    return samples.map((s) => {
      const raw = s.goal ? exampleRaw : exampleBaseVote
      const popPct = bracketLookup(popularity, s.ownership)
      const mvpPct = s.mvp ? bracketLookup(mvp, s.ownership) : 0
      const penalty = Math.abs(raw) * popPct / 100
      const after = raw - penalty
      const mvpAmount = (calcOrder === 'penalty_then_mvp' ? after : raw) * mvpPct / 100
      const final = calcOrder === 'penalty_then_mvp'
        ? after + mvpAmount
        : raw + mvpAmount - penalty
      return { ...s, raw, popPct, mvpPct, final }
    })
  }, [popularity, mvp, calcOrder, samples, exampleRaw, exampleBaseVote])

  const popularityJson = JSON.stringify(popularity)
  const mvpJson = JSON.stringify(mvp)

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-amber-300">Ownership · MVP — il marchio del gioco</p>
        <p className="mt-1 text-xs text-ink-3 leading-relaxed">
          Più una scelta è popolare nella lega, più il giocatore viene penalizzato in percentuale.
          Più una scelta è rara e il giocatore risulta MVP del suo match, più viene premiato.
          Le percentuali sono applicate sul valore assoluto del &ldquo;raw subtotal&rdquo; (voto base + bonus/malus).
        </p>
      </div>

      {/* Hidden inputs that submit the bracket JSON + calc_order */}
      <input type="hidden" name="popularity_brackets_json" value={popularityJson} />
      <input type="hidden" name="mvp_bonus_brackets_json"  value={mvpJson} />
      <input type="hidden" name="calc_order" value={calcOrder} />

      <div className="grid gap-6 sm:grid-cols-2">
        <BracketsEditor
          title="Fasce penalità popolarità"
          hint="Per ogni fascia di ownership, la % di raw_subtotal sottratta."
          brackets={popularity}
          onChange={setPopularity}
        />
        <BracketsEditor
          title="Fasce bonus MVP"
          hint="Si applica solo se il giocatore è MVP del suo match (miglior rating)."
          brackets={mvp}
          onChange={setMvp}
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wider text-ink-4">Ordine di calcolo</label>
        <select
          value={calcOrder}
          onChange={(e) => setCalcOrder(e.target.value as CalcOrder)}
          className="mt-2 w-full max-w-md rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-indigo-400/60"
        >
          <option value="penalty_then_mvp">Popolarità prima, poi MVP (composto · default)</option>
          <option value="mvp_then_penalty">MVP e popolarità entrambi sul raw_subtotal (additivo)</option>
        </select>
        <p className="mt-1 text-[11px] text-ink-4">
          Default <span className="font-mono">penalty_then_mvp</span>: una scelta popolare riduce anche il bonus MVP.
        </p>
      </div>

      {/* Live preview — same striker, eight scenarios (goal/no-goal × MVP × ownership) */}
      <div className="rounded-lg border border-hairline bg-transparent p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-4">Anteprima — stesso giocatore, 8 scenari</p>
        <p className="mt-0.5 mb-3 text-[11px] text-ink-4">
          Stesso attaccante (voto base {exampleBaseVote.toFixed(2)}). Con gol: +{exampleGoalBonus} →{' '}
          <span className="font-mono">raw {exampleRaw.toFixed(2)}</span>; senza gol →{' '}
          <span className="font-mono">raw {exampleBaseVote.toFixed(2)}</span>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {previews.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 rounded border border-hairline px-3 py-2">
              <div>
                <p className="text-xs text-ink-2">{p.label}</p>
                <p className="text-[10px] text-ink-4">
                  raw {p.raw.toFixed(2)} · pen {p.popPct}%{p.mvp ? ` · MVP +${p.mvpPct}%` : ''}
                </p>
              </div>
              <span className={`font-mono text-sm font-semibold ${p.final >= 0 ? 'text-ink-1' : 'text-rose-400'}`}>
                {p.final.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Game Rules section (thresholds + smoothing + points) ───────────────────

function parseThresholdsJson(raw: Json | null | undefined, fallback: GoalThreshold[]): GoalThreshold[] {
  if (!Array.isArray(raw)) return fallback
  const out: GoalThreshold[] = []
  for (const item of raw) {
    if (
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).min === 'number' &&
      typeof (item as Record<string, unknown>).goals === 'number'
    ) {
      const o = item as Record<string, number>
      out.push({ min: o.min!, goals: o.goals! })
    }
  }
  return out.length > 0 ? out : fallback
}

function parseSmoothingJson(raw: Json | null | undefined, fallback: SmoothingConfig): SmoothingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const r = raw as Record<string, unknown>
  return {
    drawIfDiffBelow:
      typeof r.drawIfDiffBelow === 'number' ? r.drawIfDiffBelow : fallback.drawIfDiffBelow,
    drawIf1GoalLeadAndDiffBelow:
      typeof r.drawIf1GoalLeadAndDiffBelow === 'number'
        ? r.drawIf1GoalLeadAndDiffBelow
        : fallback.drawIf1GoalLeadAndDiffBelow,
  }
}

function parsePointsJson(raw: Json | null | undefined, fallback: PointsConfig): PointsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const r = raw as Record<string, unknown>
  return {
    win:  typeof r.win  === 'number' ? r.win  : fallback.win,
    draw: typeof r.draw === 'number' ? r.draw : fallback.draw,
    loss: typeof r.loss === 'number' ? r.loss : fallback.loss,
  }
}

function GameRulesSection({
  defaultThresholds,
  defaultSmoothing,
  defaultPoints,
}: {
  defaultThresholds: GoalThreshold[]
  defaultSmoothing: SmoothingConfig
  defaultPoints: PointsConfig
}) {
  const [thresholds, setThresholds] = useState<GoalThreshold[]>(defaultThresholds)
  const [smoothing, setSmoothing]   = useState<SmoothingConfig>(defaultSmoothing)
  const [points, setPoints]         = useState<PointsConfig>(defaultPoints)

  const updateThreshold = (i: number, field: keyof GoalThreshold, value: number) => {
    setThresholds((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  const thresholdsJson = JSON.stringify(
    [...thresholds].sort((a, b) => a.min - b.min)
  )

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-300">Soglie gol e risultato</p>
        <p className="mt-1 text-xs text-ink-3 leading-relaxed">
          Conversione del totale fantavoto di una squadra in gol fantasy, regole di smussamento
          per pareggi al limite, e punti assegnati a vittoria/pareggio/sconfitta.
        </p>
      </div>

      {/* Hidden inputs serialize state for submit */}
      <input type="hidden" name="goal_thresholds_json" value={thresholdsJson} />

      {/* Thresholds editor */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
          Soglie fantavoto → gol fantasy
        </p>
        <p className="mb-3 text-[11px] text-ink-4">
          Una soglia indica: se il fantavoto della squadra è ≥ <span className="font-mono">min</span>,
          assegna <span className="font-mono">goals</span> gol. Vince l&apos;ultima soglia raggiunta.
        </p>
        <div className="space-y-1.5">
          {thresholds.map((t, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-2 items-center">
              <span className="text-[10px] text-ink-4">da</span>
              <input
                type="number" step={0.5} min={0} max={200}
                value={t.min}
                onChange={(e) => updateThreshold(i, 'min', Number(e.target.value))}
                className="rounded border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-emerald-400/60"
              />
              <span className="text-[10px] text-ink-4">→</span>
              <input
                type="number" step={1} min={0} max={20}
                value={t.goals}
                onChange={(e) => updateThreshold(i, 'goals', Number(e.target.value))}
                className="rounded border border-hairline bg-transparent px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={() => setThresholds(thresholds.filter((_, j) => j !== i))}
                className="text-[10px] text-ink-4 hover:text-rose-400"
                aria-label="Rimuovi soglia"
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setThresholds([...thresholds, { min: 0, goals: 0 }])}
            className="text-[11px] text-emerald-300 hover:text-emerald-200"
          >+ Aggiungi soglia</button>
        </div>
      </div>

      {/* Smoothing */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
          Smussamento (pareggio forzato sui distacchi minimi)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-3" htmlFor="smoothing_drawIfDiffBelow">
              Pareggio se differenza fantavoto &lt;
            </label>
            <input
              id="smoothing_drawIfDiffBelow"
              name="smoothing_drawIfDiffBelow"
              type="number" step={0.1} min={0} max={10}
              value={smoothing.drawIfDiffBelow}
              onChange={(e) => setSmoothing({ ...smoothing, drawIfDiffBelow: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-emerald-400/60 focus:outline-none"
            />
            <p className="text-[11px] text-ink-4">
              Distacco fantavoto troppo piccolo → pareggio alla fascia media.
              Lascia <span className="font-mono">0</span> per disattivare (un 62 vs 61.9 resta 1-0).
              Valore suggerito se attivo: <span className="font-mono">1.0</span>.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-3" htmlFor="smoothing_drawIf1GoalLeadAndDiffBelow">
              Pareggio se vantaggio 1 gol e differenza &lt;
            </label>
            <input
              id="smoothing_drawIf1GoalLeadAndDiffBelow"
              name="smoothing_drawIf1GoalLeadAndDiffBelow"
              type="number" step={0.1} min={0} max={10}
              value={smoothing.drawIf1GoalLeadAndDiffBelow}
              onChange={(e) => setSmoothing({ ...smoothing, drawIf1GoalLeadAndDiffBelow: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-emerald-400/60 focus:outline-none"
            />
            <p className="text-[11px] text-ink-4">
              1 gol di scarto ma distacco fantavoto sottile → pareggio.
              Lascia <span className="font-mono">0</span> per disattivare.
              Valore suggerito se attivo: <span className="font-mono">1.5</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Result points */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
          Punti per risultato
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-emerald-400" htmlFor="points_win">Vittoria</label>
            <input
              id="points_win" name="points_win" type="number" step={1} min={0} max={10}
              value={points.win}
              onChange={(e) => setPoints({ ...points, win: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-emerald-400/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-3" htmlFor="points_draw">Pareggio</label>
            <input
              id="points_draw" name="points_draw" type="number" step={1} min={0} max={10}
              value={points.draw}
              onChange={(e) => setPoints({ ...points, draw: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-emerald-400/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-rose-400" htmlFor="points_loss">Sconfitta</label>
            <input
              id="points_loss" name="points_loss" type="number" step={1} min={0} max={10}
              value={points.loss}
              onChange={(e) => setPoints({ ...points, loss: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-emerald-400/60 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  current: LeagueEngineConfig | null
}

// ── Component ────────────────────────────────────────────────────────────────

export function EngineConfigForm({ current }: Props) {
  const [state, action] = useActionState(saveEngineConfigAction, { error: null, success: false })
  const [resetKey, setResetKey] = useState(0)
  const [useDefaults, setUseDefaults] = useState(false)

  const bm = DEFAULT_ENGINE_CONFIG.bonus_malus

  const src = useDefaults ? null : current

  const v = {
    pivot_rating: src?.pivot_rating ?? DEFAULT_ENGINE_CONFIG.pivot_rating,
    pivot_vote:   src?.pivot_vote   ?? DEFAULT_ENGINE_CONFIG.pivot_vote,

    goal_bonus_gk:  src?.goal_bonus_gk  ?? bm.goal_by_role.GK,
    goal_bonus_def: src?.goal_bonus_def ?? bm.goal_by_role.DEF,
    goal_bonus_mid: src?.goal_bonus_mid ?? bm.goal_by_role.MID,
    goal_bonus_att: src?.goal_bonus_att ?? bm.goal_by_role.ATT,

    penalty_scored_discount: src?.penalty_scored_discount ?? bm.penalty_scored_discount,
    brace_bonus:             src?.brace_bonus             ?? bm.brace_bonus,
    hat_trick_bonus:         src?.hat_trick_bonus         ?? bm.hat_trick_bonus,

    assist:         src?.assist         ?? bm.assist,
    own_goal:       src?.own_goal       ?? bm.own_goal,
    yellow_card:    src?.yellow_card    ?? bm.yellow_card,
    red_card:       src?.red_card       ?? bm.red_card,
    penalty_missed: src?.penalty_missed ?? bm.penalty_missed,
    penalty_saved:  src?.penalty_saved  ?? bm.penalty_saved,

    clean_sheet_gk:           src?.clean_sheet_gk           ?? (bm.clean_sheet_by_role.GK  ?? 0),
    clean_sheet_def:          src?.clean_sheet_def          ?? (bm.clean_sheet_by_role.DEF ?? 0),
    clean_sheet_min_minutes:  src?.clean_sheet_min_minutes  ?? bm.clean_sheet_min_minutes,

    goals_conceded_gk:               src?.goals_conceded_gk               ?? (bm.goals_conceded_by_role.GK  ?? 0),
    goals_conceded_def:              src?.goals_conceded_def              ?? (bm.goals_conceded_by_role.DEF ?? 0),
    goals_conceded_def_min_minutes:  src?.goals_conceded_def_min_minutes  ?? bm.goals_conceded_def_min_minutes,

    popularity_brackets: parseBracketsJson(src?.popularity_brackets ?? null, DEFAULT_ENGINE_CONFIG.popularity_brackets),
    mvp_bonus_brackets:  parseBracketsJson(src?.mvp_bonus_brackets  ?? null, DEFAULT_ENGINE_CONFIG.mvp_bonus_brackets),
    calc_order: (src?.calc_order === 'mvp_then_penalty' || src?.calc_order === 'penalty_then_mvp')
      ? (src.calc_order as CalcOrder)
      : DEFAULT_ENGINE_CONFIG.calc_order,

    goal_thresholds: parseThresholdsJson(src?.goal_thresholds ?? null, DEFAULT_RESULT_RULES.thresholds),
    smoothing:       parseSmoothingJson(src?.smoothing       ?? null, DEFAULT_RESULT_RULES.smoothing),
    result_points:   parsePointsJson(src?.result_points      ?? null, DEFAULT_RESULT_RULES.points),
  }

  // Acknowledge unused import in some code paths
  void deriveSlope

  return (
    <form key={resetKey} action={action} className="space-y-8">

      {/* ── Pivot ───────────────────────────────────────────────────── */}
      <PivotSection
        defaultPivotRating={v.pivot_rating}
        defaultPivotVote={v.pivot_vote}
      />

      {/* ── Ownership · MVP (trademark) ─────────────────────────────── */}
      <OwnershipSection
        defaultPopularity={v.popularity_brackets}
        defaultMvp={v.mvp_bonus_brackets}
        defaultCalcOrder={v.calc_order}
        exampleGoalBonus={v.goal_bonus_att}
      />

      {/* ── Soglie gol e risultato (globale) ─────────────────────────── */}
      <GameRulesSection
        defaultThresholds={v.goal_thresholds}
        defaultSmoothing={v.smoothing}
        defaultPoints={v.result_points}
      />

      {/* ── Gol per ruolo ───────────────────────────────────────────── */}
      <FieldGroup title="Bonus gol per ruolo">
        <Field label="Gol — Portiere (GK)"        name="goal_bonus_gk"  defaultValue={v.goal_bonus_gk}  min="0" max="10" />
        <Field label="Gol — Difensore (DEF)"      name="goal_bonus_def" defaultValue={v.goal_bonus_def} min="0" max="10" />
        <Field label="Gol — Centrocampista (MID)" name="goal_bonus_mid" defaultValue={v.goal_bonus_mid} min="0" max="10" />
        <Field label="Gol — Attaccante (ATT)"     name="goal_bonus_att" defaultValue={v.goal_bonus_att} min="0" max="10" />
        <Field
          label="Sconto gol su rigore"
          name="penalty_scored_discount"
          defaultValue={v.penalty_scored_discount}
          min="0"
          max="5"
          hint="Gol rigore = bonus ruolo − sconto"
        />
      </FieldGroup>

      {/* ── Multi-gol ───────────────────────────────────────────────── */}
      <FieldGroup title="Bonus multi-gol">
        <Field label="Bonus doppietta"  name="brace_bonus"     defaultValue={v.brace_bonus}     min="0" max="5" />
        <Field label="Bonus tripletta+" name="hat_trick_bonus" defaultValue={v.hat_trick_bonus} min="0" max="5" hint="Sostituisce il bonus doppietta" />
      </FieldGroup>

      {/* ── Altri eventi ────────────────────────────────────────────── */}
      <FieldGroup title="Altri eventi">
        <Field label="Assist"           name="assist"         defaultValue={v.assist}         min="-5" max="5"  />
        <Field label="Autorete"         name="own_goal"       defaultValue={v.own_goal}       min="-10" max="0" />
        <Field label="Ammonizione"      name="yellow_card"    defaultValue={v.yellow_card}    min="-5" max="0"  />
        <Field label="Espulsione"       name="red_card"       defaultValue={v.red_card}       min="-10" max="0" />
        <Field label="Rigore sbagliato" name="penalty_missed" defaultValue={v.penalty_missed} min="-10" max="0" />
        <Field label="Rigore parato (solo GK)" name="penalty_saved" defaultValue={v.penalty_saved} min="0" max="10" />
      </FieldGroup>

      {/* ── Clean sheet ─────────────────────────────────────────────── */}
      <FieldGroup title="Porta inviolata (clean sheet)">
        <Field label="Clean sheet — GK"  name="clean_sheet_gk"  defaultValue={v.clean_sheet_gk}  min="0" max="5" />
        <Field label="Clean sheet — DEF" name="clean_sheet_def" defaultValue={v.clean_sheet_def} min="0" max="5" />
        <Field
          label="Minuti minimi per CS"
          name="clean_sheet_min_minutes"
          defaultValue={v.clean_sheet_min_minutes}
          step="1"
          min="1"
          max="90"
        />
      </FieldGroup>

      {/* ── Goal subiti ─────────────────────────────────────────────── */}
      <FieldGroup title="Goal subiti (per goal, valore negativo)">
        <Field
          label="Goal subiti — GK"
          name="goals_conceded_gk"
          defaultValue={v.goals_conceded_gk}
          min="-5"
          max="0"
          hint="Applicato sempre"
        />
        <Field
          label="Goal subiti — DEF"
          name="goals_conceded_def"
          defaultValue={v.goals_conceded_def}
          min="-5"
          max="0"
        />
        <Field
          label="Minuti minimi per DEF"
          name="goals_conceded_def_min_minutes"
          defaultValue={v.goals_conceded_def_min_minutes}
          step="1"
          min="1"
          max="90"
        />
      </FieldGroup>

      {/* ── Submit ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton />
        <button
          type="button"
          onClick={() => { setUseDefaults(true); setResetKey(k => k + 1) }}
          className="rounded-lg border border-hairline px-5 py-2 text-sm font-medium text-ink-3 transition-colors hover:border-white/30 hover:text-ink-1"
        >
          Ripristina valori standard
        </button>
        {state.success && (
          <span className="text-sm text-emerald-400">Configurazione salvata.</span>
        )}
        {state.error && (
          <span className="text-sm text-red-400">{state.error}</span>
        )}
      </div>
    </form>
  )
}
