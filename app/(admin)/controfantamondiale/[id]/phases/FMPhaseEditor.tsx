'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePhaseAction } from './actions'
import type { FMPhase } from '@/types/database.types'

function toDatetimeLocal(iso: string | null) {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function FMPhaseEditor({ phase, competitionId }: { phase: FMPhase; competitionId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] text-ink-5 hover:text-indigo-400 transition-colors"
      >
        ✏️ Modifica date e impostazioni
      </button>
    )
  }

  async function handleSubmit(fd: FormData) {
    setPending(true)
    try {
      await updatePhaseAction(fd)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="id" value={phase.id} />
      <input type="hidden" name="competition_id" value={competitionId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Nome</label>
          <input
            name="name"
            defaultValue={phase.name}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Apertura rosa</label>
          <input
            type="datetime-local"
            name="squad_open_at"
            defaultValue={toDatetimeLocal(phase.squad_open_at)}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Lock rosa</label>
          <input
            type="datetime-local"
            name="squad_lock_at"
            defaultValue={toDatetimeLocal(phase.squad_lock_at)}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Reveal</label>
          <input
            type="datetime-local"
            name="reveal_at"
            defaultValue={toDatetimeLocal(phase.reveal_at)}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Budget mode</label>
          <select
            name="budget_mode"
            defaultValue={phase.budget_mode}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="fixed">Budget fisso</option>
            <option value="comeback">Comeback</option>
            <option value="reward_leaders">Premia i primi</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Nuova rosa richiesta?</label>
          <select
            name="requires_new_squad"
            defaultValue={phase.requires_new_squad ? 'true' : 'false'}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="true">Sì — nuova rosa</option>
            <option value="false">No — continua rosa precedente</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {pending ? 'Salvo…' : 'Salva'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-ink-5 hover:text-ink-3 transition-colors"
        >
          Annulla
        </button>
      </div>
    </form>
  )
}
