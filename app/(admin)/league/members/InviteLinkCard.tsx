'use client'

import { useState } from 'react'
import { useTransition } from 'react'
import { regenerateInviteTokenAction } from './actions'

interface Props {
  joinUrl: string | null
  leagueName: string
}

export function InviteLinkCard({ joinUrl, leagueName }: Props) {
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  async function copy(value: string, onCopied: (value: boolean) => void) {
    try {
      await navigator.clipboard.writeText(value)
      onCopied(true)
      setTimeout(() => onCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-glass-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">
            Link di invito
          </p>
          <p className="mt-1 text-[12px] text-ink-3">
            Condividi questo link per far iscrivere nuovi membri a{' '}
            <span className="text-ink-1 font-medium">{leagueName}</span>. Chi lo apre vede
            chi lo ha invitato, crea un account se serve, entra in Lega e viene portato
            subito a creare la squadra Mondiale.
          </p>
        </div>
      </div>

      {joinUrl ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={joinUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[12px] font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => copy(joinUrl, setCopied)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              {copied ? 'Link copiato' : 'Copia link invito'}
            </button>
          </div>
          <p className="text-[11px] text-ink-4">
            Manda questo link nel gruppo: l&apos;allenatore clicca, accede o si registra,
            entra nella Lega e crea la sua Squadra Mondiale.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-[12px] text-ink-5">
            Nessun link attivo.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => regenerateInviteTokenAction())}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            Genera link invito
          </button>
        </div>
      )}

    </div>
  )
}
