import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SignupForm } from './SignupForm'
import { AcceptButton } from './AcceptButton'

export const metadata = { title: 'Invito · CONTROFANTA' }

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: rawToken } = await params
  const token = rawToken.trim().toUpperCase()
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: league } = await service
    .from('leagues')
    .select('id, name, season_name, invite_token_created_by')
    .eq('invite_token', token)
    .maybeSingle()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userProfile: { full_name: string | null; username: string } | null = null
  let alreadyMember = false
  let hasMondialeTeam = false
  let mondialeHref: Route = '/dashboard' as Route
  let mondialeInstanceId: string | null = null
  if (league) {
    const { data: fmInstance } = await service
      .from('fm_league_competition')
      .select('id, slug')
      .eq('league_id', league.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fmInstance) {
      mondialeInstanceId = fmInstance.id
      mondialeHref = `/controfantamondiale/${fmInstance.slug ?? fmInstance.id}` as Route
    }
  }

  if (user && league) {
    const [profileRes, luRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single(),
      supabase
        .from('league_users')
        .select('id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    userProfile = profileRes.data
      ? { full_name: profileRes.data.full_name ?? null, username: profileRes.data.username }
      : null
    alreadyMember = !!luRes.data

    if (mondialeInstanceId) {
      const { data: fmTeam } = await service
        .from('fm_fantasy_team')
        .select('id')
        .eq('league_competition_id', mondialeInstanceId)
        .eq('manager_id', user.id)
        .maybeSingle()
      hasMondialeTeam = !!fmTeam
    }
  }

  let inviter: { full_name: string | null; username: string } | null = null
  if (league?.invite_token_created_by) {
    const { data } = await service
      .from('profiles')
      .select('full_name, username')
      .eq('id', league.invite_token_created_by)
      .maybeSingle()
    inviter = data
      ? { full_name: data.full_name ?? null, username: data.username }
      : null
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 text-center">
          <h1
            className="font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">CONTRO</span>
            <span className="serif font-normal text-ink-3">FANTA</span>
          </h1>
        </div>

        {!league ? (
          <div className="rounded-xl border border-hairline bg-glass-1 p-6 text-center">
            <p className="text-[14px] font-semibold text-ink-1">Link non valido</p>
            <p className="mt-1 text-[12px] text-ink-4">
              Questo link di invito è scaduto o è stato revocato. Chiedi all&apos;admin di
              generarne uno nuovo.
            </p>
            <Link
              href={'/login' as Route}
              className="mt-4 inline-block text-[12px] text-indigo-400 hover:text-indigo-300"
            >
              Vai al login
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-glass-1 p-6 space-y-5">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-4">
                Codice invito {token}
              </p>
              <p className="mt-2 text-[18px] font-semibold text-ink-1">{league.name}</p>
              <p className="text-[12px] text-ink-4">{league.season_name}</p>
              <p className="mt-2 text-[12px] text-ink-3">
                {inviter
                  ? `${inviter.full_name || inviter.username} ti ha invitato in questa Lega.`
                  : 'Sei stato invitato in questa Lega.'}
              </p>
            </div>

            <p className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-center text-[12px] text-ink-3">
              Accetta l&apos;invito, poi ti porto subito nella pagina giusta per creare
              la tua squadra del ControFanta Mondiale.
            </p>

            {alreadyMember && hasMondialeTeam ? (
              <div className="space-y-3 text-center">
                <p className="text-[13px] text-ink-2">
                  Sei già membro di questa Lega e la tua squadra Mondiale è pronta.
                </p>
                <Link
                  href={mondialeHref}
                  className="inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Vai al Mondiale
                </Link>
              </div>
            ) : alreadyMember ? (
              <div className="space-y-3">
                <p className="text-center text-[12px] text-ink-3">
                  Sei già nella Lega. Manca solo la tua squadra Mondiale.
                </p>
                <Link
                  href={mondialeHref}
                  className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Crea la mia squadra
                </Link>
              </div>
            ) : user ? (
              <div className="space-y-3">
                <p className="text-center text-[12px] text-ink-3">
                  Sei loggato come{' '}
                  <span className="text-ink-1 font-medium">
                    {userProfile?.full_name || userProfile?.username || user.email}
                  </span>
                </p>
                <AcceptButton token={token} />
              </div>
            ) : (
              <SignupForm token={token} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
