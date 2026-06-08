'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createFMTeamAction, type CreateFMTeamState } from './join-actions'

const initialState: CreateFMTeamState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creazione…' : 'Crea squadra e inizia'}
    </button>
  )
}

export function CreateFMTeamForm({ competitionRef }: { competitionRef: string }) {
  const [state, formAction] = useActionState(createFMTeamAction, initialState)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="competition_ref" value={competitionRef} />
      <div>
        <label
          htmlFor="fm_team_name"
          className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4"
        >
          Nome squadra
        </label>
        <input
          id="fm_team_name"
          name="team_name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Gli Invincibili"
          className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-3 text-[14px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {state.error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
