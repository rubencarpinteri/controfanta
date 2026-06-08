import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateLeagueForm } from './CreateLeagueForm'

export const metadata = { title: 'Crea lega · CONTROFANTA' }

export default async function NewLeaguePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1
            className="font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">Crea</span>{' '}
            <span className="serif font-normal text-ink-3">una nuova lega</span>
          </h1>
          <p className="mt-2 text-[12px] text-ink-4">
            Crea il gruppo privato, iscrivi subito la Lega al ControFanta Mondiale e invita gli amici.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-glass-1 p-6">
          <CreateLeagueForm />
        </div>
      </div>
    </div>
  )
}
