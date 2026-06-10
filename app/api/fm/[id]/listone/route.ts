import { requireFMContext, getFMTeams, getFMPlayers } from '@/lib/fantamondiale/server'
import { NextResponse } from 'next/server'

const ROLE_ORDER: Record<string, number> = { P: 0, D: 1, C: 2, A: 3 }

function girone(label: string | null): string {
  if (!label) return 'Senza girone'
  return label.replace(/^Group\b/i, 'Girone')
}

function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)

  const [teams, players] = await Promise.all([
    getFMTeams(ctx.competition.id),
    getFMPlayers(ctx.competition.id),
  ])

  const teamById = new Map(teams.map((t) => [t.id, t]))

  const sorted = players.slice().sort((a, b) => {
    const ta = teamById.get(a.national_team_id)
    const tb = teamById.get(b.national_team_id)
    const ga = ta?.group_label ?? '￿'
    const gb = tb?.group_label ?? '￿'
    if (ga !== gb) return ga.localeCompare(gb)
    const na = ta?.name ?? ''
    const nb = tb?.name ?? ''
    if (na !== nb) return na.localeCompare(nb)
    const ra = ROLE_ORDER[a.role] ?? 9
    const rb = ROLE_ORDER[b.role] ?? 9
    if (ra !== rb) return ra - rb
    return b.base_price - a.base_price
  })

  const header = ['Girone', 'Nazionale', 'Ruolo', 'Nome', 'Crediti']
  const rows = sorted.map((p) => {
    const team = teamById.get(p.national_team_id)
    return [
      girone(team?.group_label ?? null),
      team?.name ?? '',
      p.role,
      p.name,
      p.base_price,
    ]
  })

  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')

  // UTF-8 BOM so Excel opens it correctly without an import wizard.
  const bom = '﻿'
  const slug = ctx.legaCompetition.slug ?? id
  const filename = `listone_${slug}.csv`

  return new NextResponse(bom + lines, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
