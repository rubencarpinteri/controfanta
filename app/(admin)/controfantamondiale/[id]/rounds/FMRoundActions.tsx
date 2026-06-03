'use client'

import { useState } from 'react'

interface Props {
  roundId: string
  roundStatus: string
}

type StepResult = {
  label: string
  ok: boolean
  detail: string
}

// Manual recalculation button. Live stats ingestion happens automatically via
// the SportMonks ratings-tick cron; this just re-runs the engine over what's
// already in fm_player_match_stats.
export function FMRoundActions({ roundId, roundStatus }: Props) {
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepResult[]>([])
  const [done, setDone] = useState(false)

  const canIngest = roundStatus === 'scoring' || roundStatus === 'locked'

  if (!canIngest) return null

  async function run() {
    setRunning(true)
    setSteps([])
    setDone(false)

    try {
      const res = await fetch('/api/fm/calculate-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId }),
      })
      const data = await res.json() as { teamsScored?: number; brMatchupsWritten?: number; errors?: string[] }
      const calcOk = res.ok
      setSteps((prev) => [
        ...prev,
        {
          label: 'Calcolo punteggi',
          ok: calcOk,
          detail: res.ok
            ? `${data.teamsScored ?? 0} squadre, ${data.brMatchupsWritten ?? 0} sfide BR${data.errors?.length ? ` — ${data.errors[0]}` : ''}`
            : `Errore ${res.status}`,
        },
      ])
    } catch (err) {
      setSteps((prev) => [
        ...prev,
        { label: 'Calcolo punteggi', ok: false, detail: String(err) },
      ])
    }

    setRunning(false)
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={running}
        className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors"
      >
        {running ? 'In corso…' : 'Calcola punteggi'}
      </button>

      {steps.length > 0 && (
        <div className="space-y-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px]">
              <span className={s.ok ? 'text-emerald-400' : 'text-rose-400'}>{s.ok ? '✓' : '✗'}</span>
              <span className="text-ink-4 font-semibold">{s.label}</span>
              <span className="text-ink-5">{s.detail}</span>
            </div>
          ))}
          {done && (
            <p className="text-[10px] text-ink-5 mt-1">
              Aggiorna la pagina per vedere i punteggi aggiornati.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
