'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isRealSuperAdmin, VIEW_AS_MANAGER_COOKIE } from '@/lib/league'

/**
 * Toggle "view as manager" preview mode for the current (real) super-admin.
 * Sets/clears an httpOnly cookie; only real super-admins may flip it, so a
 * preview can always be turned back off.
 */
export async function toggleViewAsManagerAction() {
  if (!(await isRealSuperAdmin())) return

  const jar = await cookies()
  const on = jar.get(VIEW_AS_MANAGER_COOKIE)?.value === '1'
  if (on) {
    jar.delete(VIEW_AS_MANAGER_COOKIE)
  } else {
    jar.set(VIEW_AS_MANAGER_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  // Refresh the whole app so admin tabs/buttons appear/disappear everywhere.
  revalidatePath('/', 'layout')
}
