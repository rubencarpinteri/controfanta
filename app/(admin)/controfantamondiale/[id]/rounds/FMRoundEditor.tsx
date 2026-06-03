'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoundAction, updateRoundAction } from './actions'
import type { FMScoringRound } from '@/types/database.types'

function toDatetimeLocal(iso: string | null) {
  if (!iso) return ''
  return iso.slice(0, 16)
}

interface Props {
  round: FMScoringRound | null
  competitionId: string
  phaseId?: string
  phaseRounds?: FMScoringRound[]
}

export function FMRoundEditor({ round, competitionId, phaseId, phaseRounds }: Props) {
  const isNew = round === null
  const [open, setOpen] = useState(isNew ? false : false)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  const action = isNew ? createRoundAction : updateRoundAction

  async function handleSubmit(fd: FormData) {
    setPending(true)
    try {
      await action(fd)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-[10px] transition-colors ${
          isNew
            ? 'text-indigo-400 hover:text-indigo-300'
            : 'text-ink-5 hover:text-indigo-400'
        }`}
      >
        {isNew ? '＋ Aggiungi giornata' : '✏️ Modifica date'}
      </button>
    )
  }

  const nextOrder = isNew ? (phaseRounds?.length ?? 0) + 1 : round.display_order

  return (
    <form action={handleSubmit} className="space-y-3">
      {!isNew && <input type="hidden" name="id" value={round.id} />}
      <input type="hidden" name="competition_id" value={competitionId} />
      {isNew && <input type="hidden" name="phase_id" value={phaseId ?? ''} />}
      {isNew && <input type="hidden" name="display_order" value={nextOrder} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Nome</label>
          <input
            name="name"
            defaultValue={round?.name ?? ''}
            placeholder="es. Giornata 1"
            required
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Apertura formazioni</label>
          <input
            type="datetime-local"
            name="lineup_open_at"
            defaultValue={toDatetimeLocal(round?.lineup_open_at ?? null)}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">Lock formazioni</label>
          <input
            type="datetime-local"
            name="lock_at"
            defaultValue={toDatetimeLocal(round?.lock_at ?? null)}
            className="w-full rounded-lg border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {pending ? 'Salvo…' : isNew ? 'Crea giornata' : 'Salva'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-5 hover:text-ink-3">
          Annulla
        </button>
      </div>
    </form>
  )
}
