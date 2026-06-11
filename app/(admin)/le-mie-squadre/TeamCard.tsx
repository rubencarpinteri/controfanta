'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  renameSerieATeamAction,
  renameFMTeamAction,
  offerTeamTransferAction,
  cancelTeamTransferAction,
  offerFMTeamTransferAction,
  cancelFMTeamTransferAction,
  type RenameTeamState,
  type TransferActionState,
} from './actions'

export type Level = 'nazionale' | 'internazionale'

export interface MemberPickerOption {
  user_id: string
  username: string
  full_name: string | null
  email: string | null
}

interface Props {
  teamId: string
  name: string
  level: Level
  competitionLabel: string
  competitionSubLabel?: string | null
  /** Other members of the Lega available as transfer targets. */
  members?: MemberPickerOption[]
  /** Link to this team's rosa builder (FM teams only). */
  rosaHref?: string
  /** Whether the rosa is currently editable (an open redraft phase). */
  rosaOpen?: boolean
  /** A pending outgoing offer on this team, if one exists. */
  pendingOffer?: {
    request_id: string
    to_username: string
    to_full_name: string | null
  } | null
}

const renameInitial: RenameTeamState = { error: null, success: false }
const transferInitial: TransferActionState = { error: null, success: false }

function RenameSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-indigo-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
    >
      {pending ? '…' : 'Salva'}
    </button>
  )
}

function OfferSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-indigo-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
    >
      {pending ? 'Invio…' : 'Invia richiesta'}
    </button>
  )
}

function CancelSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-hairline px-2 py-1 text-[11px] font-medium text-ink-3 hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50"
    >
      {pending ? '…' : 'Annulla richiesta'}
    </button>
  )
}

export function TeamCard({
  teamId,
  name,
  level,
  competitionLabel,
  competitionSubLabel,
  members,
  rosaHref,
  rosaOpen,
  pendingOffer,
}: Props) {
  const isNazionale = level === 'nazionale'
  const renameAction = isNazionale ? renameSerieATeamAction : renameFMTeamAction
  const offerAction = isNazionale ? offerTeamTransferAction : offerFMTeamTransferAction
  const cancelAction = isNazionale ? cancelTeamTransferAction : cancelFMTeamTransferAction

  const [renameState, renameFormAction] = useActionState(renameAction, renameInitial)
  const [offerState, offerFormAction] = useActionState(offerAction, transferInitial)
  const [cancelState, cancelFormAction] = useActionState(cancelAction, transferInitial)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [assigning, setAssigning] = useState(false)

  const transferEnabled = Array.isArray(members)

  const accentBar = isNazionale ? 'bg-emerald-500' : 'bg-indigo-500'
  const eyebrowText = isNazionale
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-indigo-700 dark:text-indigo-300'
  const eyebrowBg = isNazionale
    ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
    : 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
  const icon = isNazionale ? '🇮🇹' : '🌍'
  const transferCtaText = isNazionale
    ? 'Assegna a un allenatore'
    : 'Assegna squadra CFM a un allenatore'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline bg-glass-1 backdrop-blur-xl">
      <div className={`absolute inset-y-0 left-0 w-1 ${accentBar}`} aria-hidden />
      <div className="pl-5 pr-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${eyebrowBg} ${eyebrowText}`}
              >
                <span aria-hidden>{icon}</span>
                {isNazionale ? 'Livello nazionale' : 'Livello internazionale · CFM'}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] font-medium text-ink-3">
              {competitionLabel}
              {competitionSubLabel ? <span className="text-ink-5"> · {competitionSubLabel}</span> : null}
            </p>
          </div>
        </div>

        {/* Name + rename */}
        <div className="mt-3">
          {editing ? (
            <form
              action={(fd) => {
                fd.set('team_id', teamId)
                fd.set('name', draft)
                renameFormAction(fd)
                setEditing(false)
              }}
              className="flex items-center gap-2"
            >
              <input
                name="name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                required
                minLength={2}
                maxLength={60}
                className="flex-1 rounded-md border border-hairline bg-transparent px-2 py-1 text-[14px] font-semibold tracking-tight text-ink-1 focus:border-indigo-400/60 focus:outline-none"
              />
              <RenameSubmit />
              <button
                type="button"
                onClick={() => { setDraft(name); setEditing(false) }}
                className="rounded-md border border-hairline px-2 py-1 text-[12px] text-ink-4 hover:text-ink-1"
              >
                Annulla
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p
                className="truncate text-[18px] font-semibold tracking-tight text-ink-1"
                style={{ letterSpacing: '-0.025em' }}
              >
                {name}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-4 hover:border-indigo-400/40 hover:text-indigo-600 transition-colors dark:hover:text-indigo-300"
              >
                Rinomina
              </button>
            </div>
          )}
        </div>

        {renameState.error && (
          <p className="mt-2 text-[11px] text-rose-500">{renameState.error}</p>
        )}

        {/* Rosa entry point (FM teams) — label reflects whether the redraft
            window is open (Modifica) or closed (Visualizza). */}
        {rosaHref && (
          <div className="mt-3">
            <a
              href={rosaHref}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                rosaOpen
                  ? 'border-indigo-400/30 bg-indigo-500/5 text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300'
                  : 'border-hairline bg-glass-2 text-ink-3 hover:bg-glass-1'
              }`}
            >
              <span aria-hidden>{rosaOpen ? '✎' : '👁'}</span>
              {rosaOpen ? 'Modifica' : 'Visualizza'} la mia Rosa
            </a>
          </div>
        )}

        {/* Transfer surface */}
        {transferEnabled && (
          <div className="mt-4 border-t border-hairline pt-3">
            {pendingOffer ? (
              <div className="space-y-2">
                <p className="text-[11.5px] text-ink-3">
                  <span className="font-semibold text-amber-600 dark:text-amber-300">In attesa</span>
                  {' · '}
                  proposto a{' '}
                  <span className="text-ink-1 font-medium">
                    {pendingOffer.to_full_name || `@${pendingOffer.to_username}`}
                  </span>
                </p>
                <form action={cancelFormAction}>
                  <input type="hidden" name="request_id" value={pendingOffer.request_id} />
                  <CancelSubmit />
                </form>
                {cancelState.error && (
                  <p className="text-[11px] text-rose-500">{cancelState.error}</p>
                )}
              </div>
            ) : assigning ? (
              <form
                action={(fd) => {
                  fd.set('team_id', teamId)
                  offerFormAction(fd)
                  setAssigning(false)
                }}
                className="space-y-2"
              >
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                  Allenatore destinatario
                </label>
                <select
                  name="to_user_id"
                  required
                  defaultValue=""
                  className="w-full rounded-md border border-hairline bg-transparent px-2 py-1.5 text-[12.5px] text-ink-1 focus:border-indigo-400/60 focus:outline-none"
                >
                  <option value="" disabled>
                    Scegli allenatore…
                  </option>
                  {(members ?? []).map((m) => {
                    const label = m.full_name
                      ? `${m.full_name} · @${m.username}${m.email ? ` · ${m.email}` : ''}`
                      : `@${m.username}${m.email ? ` · ${m.email}` : ''}`
                    return (
                      <option key={m.user_id} value={m.user_id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                <textarea
                  name="message"
                  rows={2}
                  maxLength={280}
                  placeholder="Messaggio facoltativo per il destinatario…"
                  className="w-full rounded-md border border-hairline bg-transparent px-2 py-1.5 text-[12px] text-ink-2 focus:border-indigo-400/60 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <OfferSubmit />
                  <button
                    type="button"
                    onClick={() => setAssigning(false)}
                    className="text-[12px] text-ink-4 hover:text-ink-1"
                  >
                    Annulla
                  </button>
                </div>
                {offerState.error && (
                  <p className="text-[11px] text-rose-500">{offerState.error}</p>
                )}
              </form>
            ) : (members ?? []).length === 0 ? (
              <p className="text-[11.5px] text-ink-5">
                Nessun altro allenatore in Lega a cui assegnare la squadra. Invita prima qualcuno dalla pagina Membri.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setAssigning(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-400/30 bg-indigo-500/5 px-2.5 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300"
              >
                <span aria-hidden>➜</span> {transferCtaText}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
