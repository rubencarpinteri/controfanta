'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'Password troppo corta'),
  next: z.string().optional(),
})

export interface LoginActionState {
  error: string | null
}

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: 'Credenziali non valide. Riprova.' }
  }

  revalidatePath('/', 'layout')
  const next = parsed.data.next?.startsWith('/') ? parsed.data.next : '/dashboard'
  redirect(next as Route)
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
