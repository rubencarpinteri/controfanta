'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { signUpAndJoinAction, type SignupAndJoinState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
    >
      {pending ? 'Creazione in corso…' : 'Crea account ed entra'}
    </button>
  )
}

const initialState: SignupAndJoinState = { error: null, awaitingEmail: false }

const fieldClass =
  'w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2.5 text-[13.5px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelClass =
  'mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4'

export function SignupForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(
    signUpAndJoinAction.bind(null, token),
    initialState
  )

  if (state.awaitingEmail) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
        <p className="text-[14px] font-semibold text-ink-1">Controlla la tua email</p>
        <p className="mt-1 text-[12px] text-ink-3">
          Ti abbiamo inviato un link di conferma. Clicca sul link nell&apos;email per
          completare l&apos;iscrizione. Poi tornerai qui per creare la tua squadra.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className={labelClass}>Nome completo</label>
          <input id="full_name" name="full_name" required minLength={2} maxLength={60}
            placeholder="Mario Rossi" autoComplete="name" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="username" className={labelClass}>Username</label>
          <input id="username" name="username" required minLength={2} maxLength={30}
            pattern="[a-z0-9._\-]+" placeholder="mario.rossi" autoComplete="username"
            className={fieldClass} />
        </div>
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          placeholder="tu@esempio.it" className={fieldClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>Password</label>
        <input id="password" name="password" type="password" required minLength={6}
          autoComplete="new-password" placeholder="Almeno 6 caratteri" className={fieldClass} />
      </div>

      {state.error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
          {state.error}
        </div>
      )}

      <SubmitButton />

      <p className="text-center text-[11px] text-ink-5">
        Hai già un account?{' '}
        <a href={`/login?next=/join/${token}`} className="text-indigo-400 hover:text-indigo-300">
          Accedi
        </a>
      </p>
    </form>
  )
}
