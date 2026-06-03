'use client'

import { useState, useTransition } from 'react'
import { setPriceAction } from './actions'
import { TeamCrest } from '@/components/fm/TeamCrest'
import type { FMPhase, FMNationalTeam, FMPlayer } from '@/types/database.types'

const ROLE_COLORS: Record<string, string> = {
  P: 'text-amber-400',
  D: 'text-emerald-400',
  C: 'text-indigo-400',
  A: 'text-rose-400',
}

interface Player extends FMPlayer {
  fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji' | 'logo_url' | 'flag_url'>
}

interface Props {
  competitionId: string
  phase: FMPhase
  teams: FMNationalTeam[]
  players: Player[]
  priceMap: Map<string, number>
}

function PriceCell({
  competitionId,
  phaseId,
  playerId,
  initialPrice,
}: {
  competitionId: string
  phaseId: string
  playerId: string
  initialPrice: number | undefined
}) {
  const [value, setValue] = useState(initialPrice?.toString() ?? '')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleBlur() {
    const price = Number(value)
    if (isNaN(price) || price < 0) return
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('phase_id', phaseId)
    fd.set('player_id', playerId)
    fd.set('price', price.toString())
    startTransition(async () => {
      await setPriceAction(fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <input
      type="number"
      min={0}
      step={1}
      value={value}
      onChange={(e) => { setValue(e.target.value); setSaved(false) }}
      onBlur={handleBlur}
      placeholder="—"
      className={`w-16 rounded border px-2 py-1 text-right text-[11px] tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
        saved
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
          : pending
          ? 'border-indigo-500/30 bg-indigo-500/5 text-ink-3'
          : 'border-hairline bg-glass-2 text-ink-1 placeholder-ink-5'
      }`}
    />
  )
}

export function PriceGrid({ competitionId, phase, teams, players, priceMap }: Props) {
  const [open, setOpen] = useState(false)
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')

  const filtered = players.filter((p) => {
    if (filterTeam && p.national_team_id !== filterTeam) return false
    if (filterRole && p.role !== filterRole) return false
    return true
  })

  const pricedCount = players.filter((p) => priceMap.has(`${phase.id}:${p.id}`)).length

  return (
    <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-glass-2 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[13px] font-semibold text-ink-1 flex-1">{phase.name}</span>
        <span className="text-[10px] text-ink-5">{pricedCount} / {players.length} prezzati</span>
        <span className="text-ink-5 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-hairline">
          {/* Filters */}
          <div className="flex gap-2 px-4 py-2.5 border-b border-hairline">
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="flex-1 rounded border border-hairline bg-glass-2 px-2 py-1.5 text-[11px] text-ink-1 focus:outline-none"
            >
              <option value="">Tutte le nazioni</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-20 rounded border border-hairline bg-glass-2 px-2 py-1.5 text-[11px] text-ink-1 focus:outline-none"
            >
              <option value="">Tutti</option>
              {['P', 'D', 'C', 'A'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className="flex items-center text-[10px] text-ink-5">{filtered.length} giocatori</span>
          </div>

          {/* Player rows */}
          <div className="divide-y divide-hairline max-h-96 overflow-y-auto">
            {filtered.map((player) => (
              <div key={player.id} className="flex items-center gap-3 px-4 py-2">
                <span className={`w-5 text-center text-[10px] font-bold shrink-0 ${ROLE_COLORS[player.role] ?? ''}`}>
                  {player.role}
                </span>
                <TeamCrest
                  name={player.fm_national_team.name}
                  logoUrl={player.fm_national_team.logo_url}
                  flagUrl={player.fm_national_team.flag_url}
                  fifaCode={player.fm_national_team.fifa_code}
                  size={18}
                  className="w-6"
                />
                <span className="flex-1 text-[12px] font-medium text-ink-1 truncate">{player.name}</span>
                <PriceCell
                  competitionId={competitionId}
                  phaseId={phase.id}
                  playerId={player.id}
                  initialPrice={priceMap.get(`${phase.id}:${player.id}`)}
                />
                <span className="text-[10px] text-ink-5 shrink-0">cr</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
