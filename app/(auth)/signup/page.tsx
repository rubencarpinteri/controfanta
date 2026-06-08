'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { signupAction, type SignupActionState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-[13.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Creazione account…' : 'Crea account'}
    </button>
  )
}

const initialState: SignupActionState = { error: null }

const fieldClass =
  'w-full rounded-xl border border-hairline bg-glass-1 px-3.5 py-2.5 text-[13.5px] text-ink-1 placeholder:text-ink-5 backdrop-blur-xl transition-all focus:border-indigo-400/60 focus:bg-glass-2 focus:outline-none'

const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4'

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-7 text-center">
          <div
            className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-indigo-200"
            style={{
              background:
                'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(139,111,225,0.20))',
              border: '1px solid rgba(99,102,241,0.35)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3l3 5-3 4-3-4z" />
              <path d="M12 12l5 3-2 5M12 12l-5 3 2 5M12 12l4-7M12 12l-4-7" />
            </svg>
          </div>
          <h1
            className="flex flex-wrap items-baseline justify-center font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">CONTRO</span>
            <span className="serif font-normal text-ink-3">FANTA</span>
          </h1>
          <p className="mt-1.5 text-[12px] text-ink-4">Crea il tuo account per iniziare una lega</p>
        </div>

        {/* Form card — glass */}
        <div className="glass-strong p-7">
          {state.pendingConfirmation ? (
            <div className="space-y-3 text-center">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-[12.5px] text-emerald-200 backdrop-blur-xl">
                Account creato! Ti abbiamo inviato un&apos;email di conferma. Clicca il
                link al suo interno per attivare il tuo account, poi accedi.
              </div>
              <Link
                href="/login"
                className="inline-block text-[12.5px] text-indigo-300 transition-colors hover:text-indigo-200"
              >
                Vai all&apos;accesso
              </Link>
            </div>
          ) : (
            <>
              <form action={formAction} className="space-y-4">
                <div>
                  <label htmlFor="fullName" className={labelClass}>Nome</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="Mario Rossi"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="username" className={labelClass}>Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="mario_rossi"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="email" className={labelClass}>Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="tu@esempio.it"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor="password" className={labelClass}>Password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    placeholder="Almeno 6 caratteri"
                    className={fieldClass}
                  />
                </div>

                {state.error && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200 backdrop-blur-xl">
                    {state.error}
                  </div>
                )}

                <SubmitButton />
              </form>

              <div className="mt-4 text-center">
                <span className="text-[11.5px] text-ink-4">Hai già un account? </span>
                <Link
                  href="/login"
                  className="text-[11.5px] text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  Accedi
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
