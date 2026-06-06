'use client'

import { useEffect, useState } from 'react'

// ── Registry ─────────────────────────────────────────────────────────────────
// Keep the font keys and slot cssVars in sync with the fontBootScript in
// app/layout.tsx — both maps must agree or a saved combo won't apply pre-paint.

type FontKey =
  | 'inter'
  | 'space-grotesk'
  | 'space-mono'
  | 'mozilla-headline'
  | 'stack-sans-headline'
  | 'stack-sans-notch'
  | 'jetbrains-mono'

const FONTS: { key: FontKey; label: string; cssVar: string; mono?: boolean }[] = [
  { key: 'inter', label: 'Inter', cssVar: '--font-inter' },
  { key: 'space-grotesk', label: 'Space Grotesk', cssVar: '--font-space-grotesk' },
  { key: 'mozilla-headline', label: 'Mozilla Headline', cssVar: '--font-mozilla-headline' },
  { key: 'stack-sans-headline', label: 'Stack Sans Headline', cssVar: '--font-stack-sans-headline' },
  { key: 'stack-sans-notch', label: 'Stack Sans Notch', cssVar: '--font-stack-sans-notch' },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', cssVar: '--font-jetbrains-mono', mono: true },
  { key: 'space-mono', label: 'Space Mono', cssVar: '--font-space-mono', mono: true },
]

const VAR_BY_KEY = Object.fromEntries(FONTS.map((f) => [f.key, f.cssVar])) as Record<FontKey, string>

type SlotKey = 'heading' | 'body' | 'accent' | 'mono'

const SLOTS: { key: SlotKey; label: string; hint: string; cssVar: string }[] = [
  { key: 'heading', label: 'Titoli', hint: 'h1 · h2 · h3', cssVar: '--cf-font-heading' },
  { key: 'body', label: 'Testo', hint: 'corpo · UI', cssVar: '--cf-font-body' },
  { key: 'accent', label: 'Parole accento', hint: '«.serif» corsivo', cssVar: '--cf-font-accent' },
  { key: 'mono', label: 'Numeri / mono', hint: 'voti · crediti', cssVar: '--cf-font-mono' },
]

type Combo = Record<SlotKey, FontKey> & { accentItalic: boolean }

const DEFAULTS: Combo = {
  heading: 'mozilla-headline',
  body: 'inter',
  accent: 'stack-sans-headline',
  mono: 'jetbrains-mono',
  accentItalic: true,
}

const STORAGE_KEY = 'cf-fonts'

function applyCombo(c: Combo) {
  const d = document.documentElement.style
  for (const slot of SLOTS) {
    const v = VAR_BY_KEY[c[slot.key]]
    if (v) d.setProperty(slot.cssVar, `var(${v})`)
  }
  d.setProperty('--cf-accent-style', c.accentItalic ? 'italic' : 'normal')
}

function clearApplied() {
  const d = document.documentElement.style
  for (const slot of SLOTS) d.removeProperty(slot.cssVar)
  d.removeProperty('--cf-accent-style')
}

export function FontSwitcher() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [combo, setCombo] = useState<Combo>(DEFAULTS)

  // Hydrate from storage after mount only — avoids SSR/CSR mismatch and keeps
  // the panel admin-only client behavior.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCombo({ ...DEFAULTS, ...JSON.parse(raw) })
    } catch {
      /* ignore malformed storage */
    }
    setMounted(true)
  }, [])

  function update(next: Combo) {
    setCombo(next)
    applyCombo(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage may be unavailable; live preview still works */
    }
  }

  function setSlot(slot: SlotKey, value: FontKey) {
    update({ ...combo, [slot]: value })
  }

  function reset() {
    setCombo(DEFAULTS)
    clearApplied()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  if (!mounted) return null

  return (
    <div className="fixed bottom-4 right-4 z-[2147483646] flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div className="w-[300px] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-hairline bg-glass-3 shadow-2 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold tracking-tight text-ink-1">Caratteri</p>
              <p className="text-[10.5px] text-ink-4">Solo admin · salvato su questo dispositivo</p>
            </div>
            <button
              onClick={reset}
              className="rounded-md border border-hairline px-2 py-1 text-[10.5px] font-semibold text-ink-3 transition-colors hover:bg-glass-1 hover:text-ink-1"
            >
              Ripristina
            </button>
          </div>

          {/* Live preview */}
          <div className="border-b border-hairline px-4 py-3">
            <h3 className="text-[20px] font-semibold leading-tight">
              Controfanta <span className="serif text-ink-3">la tua formazione</span>
            </h3>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
              Schiera con la testa, e occhio alla popolarità.
            </p>
            <p className="mono mt-1.5 text-[13px] font-bold text-ink-1">74.5 pt · 300 cr</p>
          </div>

          {/* Slot controls */}
          <div className="flex flex-col gap-3 px-4 py-3">
            {SLOTS.map((slot) => (
              <label key={slot.key} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between">
                  <span className="text-[11.5px] font-semibold text-ink-2">{slot.label}</span>
                  <span className="text-[10px] text-ink-4">{slot.hint}</span>
                </span>
                <select
                  value={combo[slot.key]}
                  onChange={(e) => setSlot(slot.key, e.target.value as FontKey)}
                  className="h-8 w-full rounded-md border border-hairline-strong bg-glass-1 px-2 text-[12.5px] text-ink-1 outline-none focus:border-indigo"
                >
                  {FONTS.filter((f) => (slot.key === 'mono' ? f.mono : true)).map((f) => (
                    <option key={f.key} value={f.key} style={{ fontFamily: `var(${f.cssVar})` }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <label className="mt-1 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-ink-2">
                Accento in corsivo
                <span className="ml-1 font-normal text-ink-4">(obliquo sintetico)</span>
              </span>
              <input
                type="checkbox"
                checked={combo.accentItalic}
                onChange={(e) => update({ ...combo, accentItalic: e.target.checked })}
                className="h-4 w-4 accent-indigo"
              />
            </label>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Caratteri"
        className="flex h-11 items-center gap-2 rounded-full border border-hairline bg-glass-3 px-4 text-[13px] font-semibold text-ink-1 shadow-2 backdrop-blur-xl transition-transform active:translate-y-px"
      >
        <span className="text-[15px] leading-none">Aa</span>
        <span>Font</span>
      </button>
    </div>
  )
}
