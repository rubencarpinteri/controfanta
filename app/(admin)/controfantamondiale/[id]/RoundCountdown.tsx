'use client'

import { useState, useEffect } from 'react'

interface Props {
  lockAt: string
}

export function RoundCountdown({ lockAt }: Props) {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    function tick() {
      const diff = new Date(lockAt).getTime() - Date.now()
      if (diff <= 0) {
        setDisplay('Chiusa')
        return
      }
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)

      if (d > 0) setDisplay(`${d}g ${h}h ${m}m`)
      else if (h > 0) setDisplay(`${h}h ${m}m ${s}s`)
      else setDisplay(`${m}m ${s}s`)
    }

    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [lockAt])

  if (!display) return null

  const isUrgent = new Date(lockAt).getTime() - Date.now() < 3_600_000

  return (
    <span className={`font-mono font-semibold tabular-nums ${isUrgent ? 'text-rose-400' : 'text-amber-400'}`}>
      {display}
    </span>
  )
}
