'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateProfileAction, type UpdateProfileState } from './actions'

interface Props {
  initialFullName: string
  initialUsername: string
}

const initial: UpdateProfileState = { error: null, success: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-indigo-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
    >
      {pending ? 'Salvataggio…' : 'Salva profilo'}
    </button>
  )
}

export function ProfileEditor({ initialFullName, initialUsername }: Props) {
  const [state, formAction] = useActionState(updateProfileAction, initial)
  const [fullName, setFullName] = useState(initialFullName)
  const [username, setUsername] = useState(initialUsername)

  const dirty = fullName !== initialFullName || username !== initialUsername

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-4">
            Nome da Allenatore
          </label>
          <input
            name="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={60}
            className="w-full rounded-md border border-hairline bg-transparent px-2.5 py-1.5 text-[13px] text-ink-1 focus:border-indigo-400/60 focus:outline-none"
          />
          <p className="mt-0.5 text-[10.5px] text-ink-5">
            Il nome con cui appari agli altri nella Lega (classifiche, squadre).
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-4">
            Nome Utente
          </label>
          <div className="flex items-center rounded-md border border-hairline focus-within:border-indigo-400/60">
            <span className="pl-2.5 text-[13px] text-ink-4">@</span>
            <input
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              minLength={2}
              maxLength={30}
              pattern="[a-z0-9._-]+"
              className="flex-1 bg-transparent px-1 py-1.5 text-[13px] text-ink-1 focus:outline-none"
            />
          </div>
          <p className="mt-0.5 text-[10.5px] text-ink-5">
            Solo lettere minuscole, numeri, punti, trattini e underscore.
          </p>
        </div>
      </div>

      {state.error && <p className="text-[11.5px] text-rose-500">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-[11.5px] text-emerald-500">Profilo aggiornato.</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        {dirty && (
          <button
            type="button"
            onClick={() => { setFullName(initialFullName); setUsername(initialUsername) }}
            className="text-[12px] text-ink-4 hover:text-ink-1"
          >
            Annulla modifiche
          </button>
        )}
      </div>
    </form>
  )
}
