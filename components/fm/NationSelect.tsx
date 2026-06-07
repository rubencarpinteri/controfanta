'use client'

import { useEffect, useRef, useState } from 'react'
import { TeamCrest } from '@/components/fm/TeamCrest'

export interface NationOption {
  id: string
  name: string
  fifa_code: string
  logo_url: string | null
  flag_url: string | null
}

interface Props {
  teams: NationOption[]
  value: string // '' = all nations
  onChange: (id: string) => void
  allLabel?: string
}

// Custom nation picker — replaces the native <select> so the dropdown uses our
// own type and shows a flag/crest next to each national team. A popover (not an
// in-page scroll box) with a search field; closes on outside-click or Escape.
export function NationSelect({ teams, value, onChange, allLabel = 'Tutte le nazioni' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = teams.find((t) => t.id === value) ?? null

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
    ? teams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.fifa_code.toLowerCase().includes(query.toLowerCase()))
    : teams

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-hairline-strong bg-glass-2 px-3 py-3 text-left text-[16px] text-ink-1 transition-colors hover:bg-glass-3 focus:outline-none focus:ring-1 focus:ring-indigo overflow-hidden"
      >
        {selected ? (
          <TeamCrest name={selected.name} logoUrl={selected.logo_url} flagUrl={selected.flag_url} fifaCode={selected.fifa_code} size={20} />
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-4">🌍</span>
        )}
        <span className={`flex-1 truncate font-medium ${selected ? 'text-ink-1' : 'text-ink-4'}`}>
          {selected ? selected.name : allLabel}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-ink-5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel — animated with opacity + scale + translateY for a smooth pop-in feel */}
      <div
        className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 origin-top transition-all duration-200 ease-out ${
          open
            ? 'pointer-events-auto scale-y-100 opacity-100'
            : 'pointer-events-none scale-y-95 opacity-0'
        }`}
      >
        <div className="overflow-hidden rounded-xl border border-hairline-strong bg-glass-3 shadow-3 backdrop-blur-xl">
          <div className="border-b border-hairline p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nazione…"
              className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2.5 text-[16px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick('')}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-glass-1 ${value === '' ? 'text-accent' : 'text-ink-2'}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">🌍</span>
              <span className="flex-1 font-medium">{allLabel}</span>
              {value === '' && <span className="text-[12px] font-semibold text-accent">✓</span>}
            </button>
            {filtered.map((t) => {
              const on = t.id === value
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-glass-1 ${on ? 'bg-accent-muted text-accent' : 'text-ink-1'}`}
                >
                  <TeamCrest name={t.name} logoUrl={t.logo_url} flagUrl={t.flag_url} fifaCode={t.fifa_code} size={20} />
                  <span className="flex-1 truncate font-medium">{t.name}</span>
                  <span className="mono shrink-0 text-[12px] text-ink-5">{t.fifa_code}</span>
                  {on && <span className="text-[12px] font-semibold text-accent">✓</span>}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-ink-5">Nessuna nazione</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
