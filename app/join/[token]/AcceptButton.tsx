'use client'

import { useTransition } from 'react'
import { acceptJoinAction } from './actions'

export function AcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => acceptJoinAction(token))}
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
    >
      {pending ? 'Iscrizione in corso…' : 'Accetta e continua'}
    </button>
  )
}
