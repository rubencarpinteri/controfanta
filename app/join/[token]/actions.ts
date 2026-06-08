'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function resolveLeagueByToken(token: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('invite_token', normalizeInviteCode(token))
    .maybeSingle()
  return data
}

async function joinLeagueAsMember(opts: {
  userId: string
  leagueId: string
}) {
  const supabase = createServiceClient()
  const { userId, leagueId } = opts

  const { data: existing } = await supabase
    .from('league_users')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existing) {
    const { error } = await supabase
      .from('league_users')
      .insert({ league_id: leagueId, user_id: userId, role: 'manager' })
    if (error) throw new Error(`league_users: ${error.message}`)
  }

  return
}

// ─── Signup + join (unauthenticated user) ────────────────────────────────────

const signupSchema = z.object({
  email:     z.string().email('Email non valida'),
  password:  z.string().min(6, 'Password troppo corta (min 6 caratteri)'),
  full_name: z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(60),
  username:  z.string()
    .min(2, 'Lo username deve avere almeno 2 caratteri')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, punti, trattini e underscore'),
})

export interface SignupAndJoinState {
  error: string | null
  awaitingEmail: boolean
}

export async function signUpAndJoinAction(
  token: string,
  _prev: SignupAndJoinState,
  formData: FormData
): Promise<SignupAndJoinState> {
  const parsed = signupSchema.safeParse({
    email:     formData.get('email'),
    password:  formData.get('password'),
    full_name: formData.get('full_name'),
    username:  formData.get('username'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', awaitingEmail: false }
  }
  const { email, password, full_name, username } = parsed.data

  const league = await resolveLeagueByToken(token)
  if (!league) {
    return { error: 'Link di invito non valido o revocato.', awaitingEmail: false }
  }

  const supabase = await createClient()

  const { data: existingUsername } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existingUsername) {
    return { error: `Lo username "${username}" è già in uso.`, awaitingEmail: false }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://controfanta.vercel.app'

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name },
      emailRedirectTo: `${appUrl}/auth/callback?next=/join/${normalizeInviteCode(token)}`,
    },
  })

  if (error || !data.user) {
    const msg = error?.message ?? 'Errore sconosciuto'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return { error: 'Questa email è già registrata. Accedi e riapri il link di invito.', awaitingEmail: false }
    }
    return { error: `Iscrizione fallita: ${msg}`, awaitingEmail: false }
  }

  try {
    await joinLeagueAsMember({ userId: data.user.id, leagueId: league.id })
  } catch (err) {
    return {
      error: `Account creato ma iscrizione lega fallita: ${err instanceof Error ? err.message : 'errore'}. Contatta l'admin.`,
      awaitingEmail: false,
    }
  }

  if (data.session) {
    redirect(await getLeagueMondialeHref(league.id))
  }

  return { error: null, awaitingEmail: true }
}

// ─── Accept (authenticated user) ─────────────────────────────────────────────

export async function acceptJoinAction(token: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const league = await resolveLeagueByToken(token)
  if (!league) throw new Error('Link di invito non valido o revocato.')

  await joinLeagueAsMember({ userId: user.id, leagueId: league.id })

  redirect(await getLeagueMondialeHref(league.id))
}

function normalizeInviteCode(token: string): string {
  return token.trim().toUpperCase()
}

async function getLeagueMondialeHref(leagueId: string): Promise<Route> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('fm_league_competition')
    .select('id, slug')
    .eq('league_id', leagueId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data ? `/controfantamondiale/${data.slug ?? data.id}` : '/dashboard') as Route
}
