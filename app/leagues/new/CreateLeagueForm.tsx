'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createLeagueAction, type CreateLeagueState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
    >
      {pending ? 'Creazione in corso…' : 'Crea lega'}
    </button>
  )
}

const initialState: CreateLeagueState = { error: null }

const fieldClass =
  'w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2.5 text-[13.5px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelClass =
  'mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4'

export function CreateLeagueForm() {
  const [state, formAction] = useActionState(createLeagueAction, initialState)

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="name" className={labelClass}>Nome lega</label>
        <input
          id="name" name="name" required minLength={2} maxLength={80}
          placeholder="Es. Lega Fantacalcio Amici"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="season_name" className={labelClass}>Stagione</label>
        <input
          id="season_name" name="season_name" required minLength={1} maxLength={40}
          placeholder="Es. 2025-26"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="team_name" className={labelClass}>La tua squadra Mondiale</label>
        <input
          id="team_name" name="team_name" required minLength={2} maxLength={60}
          placeholder="Es. Gli Invincibili"
          className={fieldClass}
        />
      </div>

      {state.error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          {state.error}
        </div>
      )}

      <SubmitButton />

      <p className="text-center text-[11px] text-ink-5">
        La Lega verrà iscritta al ControFanta Mondiale, con la tua squadra e un codice invito già pronti.
      </p>
    </form>
  )
}
