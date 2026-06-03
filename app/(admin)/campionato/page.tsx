import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent } from '@/components/ui/card'

/**
 * /campionato — resolves to the league's campionato competition detail page.
 * All league members (admin and manager) can access this route.
 */
export default async function CampionatoPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, slug')
    .eq('league_id', ctx.league.id)
    .eq('type', 'campionato')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (comp) {
    redirect(`/competitions/${comp.slug ?? comp.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Campionato</h1>
        <p className="mt-0.5 text-sm text-ink-3">Competizione tipo campionato</p>
      </div>
      <Card>
        <CardContent>
          <p className="py-8 text-center text-sm text-ink-4">
            Nessun campionato configurato per questa lega.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
