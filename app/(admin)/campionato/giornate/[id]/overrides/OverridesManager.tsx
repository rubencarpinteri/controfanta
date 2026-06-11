'use client'

import { useState, useTransition } from 'react'
import { createOverrideAction, removeOverrideAction } from './actions'

// ---- Types -------------------------------------------------

export interface PlayerOption {
  id: string
  full_name: string
  club: string
  rating_class: string
}

export interface ActiveOverride {
  id: string
  player_id: string
  player_name: string
  player_club: string
  original_fantavoto: number | null
  override_fantavoto: number
  reason: string
  created_at: string
}

interface Props {
  matchdayId: string
  matchdayStatus: string
  activeOverrides: ActiveOverride[]
  players: PlayerOption[]
}

// ---- Rating class colours ----------------------------------

function rcLabel(rc: string) {
  const colours: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400',
    MID: 'text-green-400', ATT: 'text-red-400',
  }
  return (
    <span className={`font-mono text-xs font-bold ${colours[rc] ?? 'text-ink-3'}`}>{rc}</span>
  )
}

// ---- Main component ----------------------------------------

export function OverridesManager({ matchdayId, matchdayStatus, activeOverrides, players }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [staleWarning, setStaleWarning] = useState<string | null>(null)

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [overrideValue, setOverrideValue] = useState('')
  const [reason, setReason] = useState('')

  const isEditable = matchdayStatus !== 'archived'

  // Already-overridden player IDs — exclude from dropdown
  const overriddenIds = new Set(activeOverrides.map((o) => o.player_id))
  const availablePlayers = players.filter((p) => !overriddenIds.has(p.id))

  const handleCreate = () => {
    setError(null)
    setSuccess(null)
    setStaleWarning(null)
    const fv = parseFloat(overrideValue.replace(',', '.'))
    if (!selectedPlayerId) return setError('Seleziona un giocatore.')
    if (isNaN(fv)) return setError('Inserisci un valore numerico valido per il fantavoto.')
    if (!reason.trim()) return setError('Inserisci la motivazione.')

    startTransition(async () => {
      const result = await createOverrideAction({
        matchday_id: matchdayId,
        player_id: selectedPlayerId,
        override_fantavoto: fv,
        reason: reason.trim(),
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('Override creato. Ricalcola i punteggi per applicarlo al prossimo run.')
        setStaleWarning(result.stale_warning)
        setSelectedPlayerId('')
        setOverrideValue('')
        setReason('')
      }
    })
  }

  const handleRemove = (overrideId: string, playerName: string) => {
    if (!confirm(`Rimuovere l'override per ${playerName}?`)) return
    setError(null)
    setSuccess(null)
    setStaleWarning(null)
    startTransition(async () => {
      const result = await removeOverrideAction(overrideId, matchdayId)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('Override rimosso. Ricalcola i punteggi per applicare la modifica.')
        setStaleWarning(result.stale_warning)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Active overrides table */}
      <div>
        {activeOverrides.length === 0 ? (
          <p className="text-sm text-ink-4">Nessun override attivo per questa giornata.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-4">
                  <th className="px-6 py-2.5">Giocatore</th>
                  <th className="px-4 py-2.5 text-right">Fantavoto orig.</th>
                  <th className="px-4 py-2.5 text-right">Override</th>
                  <th className="px-4 py-2.5">Motivazione</th>
                  <th className="px-4 py-2.5 text-right">Data</th>
                  {isEditable && <th className="px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {activeOverrides.map((o) => (
                  <tr key={o.id}>
                    <td className="px-6 py-2.5">
                      <div className="font-medium text-ink-1">{o.player_name}</div>
                      <div className="text-xs text-ink-4">{o.player_club}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-4">
                      {o.original_fantavoto !== null ? o.original_fantavoto.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-400">
                      {o.override_fantavoto.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-sm italic text-ink-3">{o.reason}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-ink-4">
                      {new Intl.DateTimeFormat('it-IT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(o.created_at))}
                    </td>
                    {isEditable && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleRemove(o.id, o.player_name)}
                          disabled={isPending}
                          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Rimuovi
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add override form */}
      {isEditable && (
        <div className="rounded-xl border border-hairline bg-glass-soft p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink-1">Nuovo override</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Player select */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-3">Giocatore</label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
              >
                <option value="">— Seleziona —</option>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.club}) [{p.rating_class}]
                  </option>
                ))}
              </select>
              {availablePlayers.length === 0 && (
                <p className="mt-1 text-xs text-ink-4">Tutti i giocatori hanno già un override attivo.</p>
              )}
            </div>

            {/* Override fantavoto */}
            <div>
              <label className="mb-1.5 block text-xs text-ink-3">Fantavoto override</label>
              <input
                type="number"
                step="0.1"
                min="-20"
                max="30"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="es. 7.5"
                className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-xs text-ink-3">Motivazione</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="es. Correzione voto errato — fonte ufficiale"
              maxLength={500}
              className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={isPending || !selectedPlayerId || !overrideValue || !reason.trim()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {isPending ? 'Salvataggio…' : 'Crea override'}
            </button>
            <p className="text-xs text-ink-4">
              L&apos;override si applica al prossimo run di calcolo.
            </p>
          </div>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
          {success}
        </p>
      )}
      {staleWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <span className="mr-1.5 font-semibold">⚠ Punteggi non aggiornati.</span>
          {staleWarning}
        </div>
      )}

      {/* Player list with rc badge (read-only reference) */}
      {selectedPlayerId && (() => {
        const p = players.find((pl) => pl.id === selectedPlayerId)
        if (!p) return null
        return (
          <p className="text-xs text-ink-3">
            Selezionato: <span className="text-ink-1 font-medium">{p.full_name}</span>{' '}
            ({p.club}) {rcLabel(p.rating_class)}
          </p>
        )
      })()}
    </div>
  )
}
