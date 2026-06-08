'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Inserisci il tuo nome').max(50, 'Nome troppo lungo'),
  username: z
    .string()
    .trim()
    .min(2, 'Username troppo corto')
    .max(50, 'Username troppo lungo')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo lettere, numeri, _ . -'),
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'La password deve avere almeno 6 caratteri'),
})

export interface SignupActionState {
  error: string | null
  // When email confirmation is required, no session is created and we
  // ask the user to check their inbox instead of redirecting.
  pendingConfirmation?: boolean
}

export async function signupAction(
  _prev: SignupActionState,
  formData: FormData
): Promise<SignupActionState> {
  const raw = {
    fullName: formData.get('fullName'),
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        username: parsed.data.username,
        full_name: parsed.data.fullName,
      },
    },
  })

  if (error) {
    // Surface duplicate-account hint without leaking which field clashed.
    const msg = /already registered|already exists/i.test(error.message)
      ? 'Esiste già un account con questa email. Prova ad accedere.'
      : 'Registrazione non riuscita. Riprova.'
    return { error: msg }
  }

  // If email confirmation is enabled in Supabase, signUp returns a user
  // but no active session — the user must click the link in their inbox.
  if (!data.session) {
    return { error: null, pendingConfirmation: true }
  }

  revalidatePath('/', 'layout')
  redirect('/leagues/new')
}
