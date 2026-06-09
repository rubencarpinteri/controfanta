'use client'

import { useEffect, useRef, useState } from 'react'
import { TeamCrest } from '@/components/fm/TeamCrest'

export interface CoachOption {
  id: string
  name: string
  team: { name: string; fifa_code: string; logo_url: string | null; flag_url: string | null }
  /** Frozen competition tier key, e.g. 'tier_1'. */
  tier: string | null
}

// Tier chip styling — mirrors TIER_BADGE in SquadBuilder.
const TIER_BADGE: Record<string, { short: string; cls: string }> = {
  tier_1: { short: 'T1', cls: 'text-indigo-400 bg-indigo-400/10' },
  tier_2: { short: 'T2', cls: 'text-emerald-400 bg-emerald-400/10' },
  tier_3: { short: 'T3', cls: 'text-amber-400 bg-amber-400/10' },
  tier_4: { short: 'T4', cls: 'text-rose-400 bg-rose-400/10' },
}

function TierChip({ tier }: { tier: string | null }) {
  const t = TIER_BADGE[tier ?? '']
  if (!t) return null
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.cls}`}>{t.short}</span>
}

interface Props {
  coaches: CoachOption[]
  value: string | null // null = no coach
  onChange: (id: string | null) => void
  disabled?: boolean
}

// Custom coach picker — same crafted popover as NationSelect, showing each
// coach's national-team flag, full name and frozen tier (T1–T4).
export function CoachSelect({ coaches, value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = coaches.find((c) => c.id === value) ?? null

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = query.trim()
    ? coaches.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.team.name.toLowerCase().includes(query.toLowerCase()) ||
          c.team.fifa_code.toLowerCase().includes(query.toLowerCase())
      )
    : coaches

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-hairline-strong bg-glass-2 px-3 py-3 text-left text-[16px] text-ink-1 transition-colors hover:bg-glass-3 focus:outline-none focus:ring-1 focus:ring-indigo disabled:opacity-60"
      >
        {selected ? (
          <TeamCrest name={selected.team.name} logoUrl={selected.team.logo_url} flagUrl={selected.team.flag_url} fifaCode={selected.team.fifa_code} size={20} />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-bold uppercase text-ink-4">CT</span>
        )}
        <span className={`flex-1 truncate font-medium ${selected ? 'text-ink-1' : 'text-ink-4'}`}>
          {selected ? selected.name : 'Scegli allenatore'}
        </span>
        {selected && <TierChip tier={selected.tier} />}
        <svg className={`h-4 w-4 shrink-0 text-ink-5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 origin-top transition-all duration-200 ease-out ${
          open ? 'pointer-events-auto scale-y-100 opacity-100' : 'pointer-events-none scale-y-95 opacity-0'
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-hairline-strong bg-glass-3 shadow-3 backdrop-blur-xl">
          <div className="border-b border-hairline p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca allenatore o nazione…"
              className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2.5 text-[16px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo"
            />
          </div>
          <div className="max-h-72 divide-y divide-hairline overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick(null)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-glass-1 ${value === null ? 'text-accent' : 'text-ink-2'}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-bold uppercase text-ink-4">—</span>
              <span className="flex-1 font-medium">Nessun allenatore</span>
              {value === null && <span className="text-[12px] font-semibold text-accent">✓</span>}
            </button>
            {filtered.map((c) => {
              const on = c.id === value
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-glass-1 ${on ? 'bg-accent-muted text-accent' : 'text-ink-1'}`}
                >
                  <TeamCrest name={c.team.name} logoUrl={c.team.logo_url} flagUrl={c.team.flag_url} fifaCode={c.team.fifa_code} size={20} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="mono shrink-0 text-[12px] text-ink-5">{c.team.fifa_code}</span>
                  <TierChip tier={c.tier} />
                  {on && <span className="text-[12px] font-semibold text-accent">✓</span>}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-ink-5">Nessun allenatore</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
