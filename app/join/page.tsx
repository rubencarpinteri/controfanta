import { joinWithCodeAction } from './actions'

export const metadata = { title: 'Entra in una Lega · CONTROFANTA' }

export default function JoinByCodePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1
            className="font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">Entra</span>{' '}
            <span className="serif font-normal text-ink-3">in una Lega</span>
          </h1>
          <p className="mt-2 text-[12px] text-ink-4">
            Inserisci il codice che ti ha mandato l&apos;admin.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-glass-1 p-6">
          <form action={joinWithCodeAction} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4"
              >
                Codice invito
              </label>
              <input
                id="code"
                name="code"
                required
                minLength={4}
                maxLength={16}
                placeholder="AB12CD"
                autoCapitalize="characters"
                className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-3 text-center font-mono text-[20px] uppercase tracking-[0.22em] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Continua
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
