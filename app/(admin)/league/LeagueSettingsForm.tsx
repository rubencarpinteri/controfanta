'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { updateLeagueSettingsAction, type LeagueSettingsState } from './actions'
import type { League } from '@/types/database.types'

const TIMEZONES = [
  { value: 'Europe/Rome', label: 'Europe/Rome (Italia)' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'UTC', label: 'UTC' },
]

const ROUNDING_MODES = [
  { value: 'one_decimal', label: '1 decimale (es. 7.3)' },
  { value: 'nearest_half', label: 'Mezzo punto (es. 7.5)' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      Salva impostazioni
    </Button>
  )
}

function ScopeBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-widest text-ink-4 font-semibold">
      {children}
    </p>
  )
}

const initialState: LeagueSettingsState = { error: null, success: false }

export function LeagueSettingsForm({ league }: { league: League }) {
  const [state, formAction] = useActionState(updateLeagueSettingsAction, initialState)

  return (
    <form action={formAction} className="space-y-6">
      {/* ── Section: Lega (truly league-wide) ──────────────────────────── */}
      <Card>
        <CardHeader
          title="Identità lega"
          description="Nome, fuso orario e arrotondamento voti. Valgono per ogni competizione."
        />
        <CardContent className="space-y-4">
          <ScopeBanner>Ambito: tutta la lega</ScopeBanner>

          <Input
            label="Nome lega"
            name="name"
            defaultValue={league.name}
            required
            minLength={2}
            maxLength={80}
          />

          <Select
            label="Fuso orario"
            name="timezone"
            options={TIMEZONES}
            defaultValue={league.timezone}
            hint="Usato per orari di kickoff, scadenze formazioni e cron"
          />

          <Select
            label="Arrotondamento voti"
            name="display_rounding"
            options={ROUNDING_MODES}
            defaultValue={league.display_rounding}
            hint="Solo presentazionale — i calcoli interni mantengono la precisione piena"
          />
        </CardContent>
      </Card>

      {/* ── Section: Serie A side (Campionato + BR + Coppa) ─────────────── */}
      <Card>
        <CardHeader
          title="Draft settimanale Serie A"
          description="Etichetta stagione e budget del draft Serie A, condiviso tra Campionato, Battle Royale e Coppa. ControFanta Mondiale non usa questi valori."
        />
        <CardContent className="space-y-4">
          <ScopeBanner>Ambito: tutte le competizioni Serie A (Campionato, Battle Royale, Coppa)</ScopeBanner>

          <Input
            label="Etichetta stagione"
            name="season_name"
            defaultValue={league.season_name}
            required
            placeholder="es. 2025/26"
            hint="Mostrata negli header del lato Serie A. Puramente decorativa — ogni competizione Battle Royale o ControFanta Mondiale ha la sua stagione/edizione."
          />

          <Input
            label="Budget settimanale (crediti)"
            name="weekly_budget"
            type="number"
            min={50}
            max={10000}
            step={10}
            defaultValue={league.weekly_budget}
            hint="Crediti che ogni manager spende per giornata Serie A (titolari + panchina, prezzo pieno). ControFanta Mondiale usa i budget per fase definiti nel Setup della singola competizione."
          />
        </CardContent>
      </Card>

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && (
        <Alert variant="success">Impostazioni salvate correttamente.</Alert>
      )}

      <SubmitButton />
    </form>
  )
}
