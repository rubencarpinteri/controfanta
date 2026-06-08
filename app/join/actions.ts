'use server'

import { redirect } from 'next/navigation'
import type { Route } from 'next'

export async function joinWithCodeAction(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (!code) {
    redirect('/join' as Route)
  }

  redirect(`/join/${code}` as Route)
}
