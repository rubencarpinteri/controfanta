import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { isUuid } from '@/lib/slug'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TeamEnrollmentForm } from './TeamEnrollmentForm'

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: ref } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status')
    .eq(isUuid(ref) ? 'id' : 'slug', ref)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  if (!comp) notFound()
  const id = comp.id

  // Already enrolled teams with names
  const { data: enrolled } = await supabase
    .from('competition_teams')
    .select('id, team_id, fantasy_teams(name)')
    .eq('competition_id', id)
    .order('id')

  const enrolledTeams = enrolled ?? []
  const enrolledIds = new Set(enrolledTeams.map((e) => e.team_id))

  // All teams in this league not yet enrolled
  const { data: allTeams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  const availableTeams = (allTeams ?? []).filter((t) => !enrolledIds.has(t.id))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href={`/competitions/${id}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {comp.name}
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          <span className="font-semibold">Squadre</span>
          <span className="serif font-normal text-ink-3">— iscritte</span>
        </h1>
        <p className="mt-1.5 text-[12.5px] text-ink-4">
          Gestisci le squadre partecipanti a questa competizione.
        </p>
      </div>

      <Card>
        <CardHeader title="Iscrizioni" />
        <CardContent>
          <TeamEnrollmentForm
            competitionId={id}
            enrolledTeams={enrolledTeams as unknown as Parameters<typeof TeamEnrollmentForm>[0]['enrolledTeams']}
            availableTeams={availableTeams}
            competitionStatus={comp.status}
          />
        </CardContent>
      </Card>
    </div>
  )
}
