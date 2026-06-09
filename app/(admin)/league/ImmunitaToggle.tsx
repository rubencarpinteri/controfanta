'use client'

import { useState, useTransition } from 'react'
import { setImmunitaEnabledAction } from '../regole-di-gioco/actions'

// On/Off switch for the league's Immunità rule. Optimistic; reverts on error.
export function ImmunitaToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setError(null)
    startTransition(async () => {
      const res = await setImmunitaEnabledAction(next)
      if (!res.success) {
        setEnabled(!next)
        setError(res.error ?? 'Errore')
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
          enabled ? 'bg-emerald-500' : 'bg-hairline-strong'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${enabled ? 'text-emerald-400' : 'text-ink-4'}`}>
        {enabled ? 'Attiva' : 'Disattiva'}
      </span>
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  )
}
