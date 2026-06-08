// ============================================================
// Auth Callback Route
// ============================================================
// Handles invite and password-reset token exchanges.
// Supabase redirects here after the user clicks an invite or
// reset link with ?token_hash=...&type=invite|recovery
// ============================================================

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as
    | 'invite'
    | 'recovery'
    | 'email'
    | 'signup'
    | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      // Invite: send to set-password page so user can choose a password.
      // Recovery: same destination.
      // Signup/email confirmation: land on their first league-creation step.
      const dest =
        type === 'invite'
          ? '/update-password'
          : type === 'signup'
            ? '/leagues/new'
            : next
      return NextResponse.redirect(new URL(dest, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_token', origin))
}
