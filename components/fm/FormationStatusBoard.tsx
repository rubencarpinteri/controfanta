// ============================================================
// FantaMondiale — League formation-status board
// ============================================================
// A pre-kickoff "who's ready" panel: every team in the Lega with a green
// (formazione inviata) or red (non schierata) dot. It deliberately reveals
// NOTHING about the lineups themselves — only whether each manager submitted —
// so it's safe to show before the reveal gate opens.
// ============================================================

type FormationStatusTeam = {
  id: string
  name: string
  manager_name: string | null
  submitted: boolean
}

export function FormationStatusBoard({
  teams,
  myTeamId,
  locked,
}: {
  teams: FormationStatusTeam[]
  myTeamId: string | null
  locked: boolean
}) {
  const submittedCount = teams.filter((t) => t.submitted).length
  const total = teams.length
  const allIn = submittedCount === total && total > 0

  return (
    <div className="rounded-2xl border border-hairline bg-glass-1 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-4">
            Stato formazioni
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {locked
              ? 'Turno chiuso — chi non ha schierato prende 0.'
              : 'Chi ha già inviato la formazione di questo turno.'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums ${
            allIn
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
              : 'bg-glass-2 text-ink-2'
          }`}
        >
          {submittedCount}/{total}
        </span>
      </div>

      <ul className="divide-y divide-hairline">
        {teams.map((t) => {
          const isMine = t.id === myTeamId
          return (
            <li
              key={t.id}
              className={`flex items-center gap-2.5 px-4 py-2.5 ${isMine ? 'bg-indigo-500/5' : ''}`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  t.submitted
                    ? 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/15'
                    : 'bg-rose-500 shadow-[0_0_0_3px] shadow-rose-500/15'
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-ink-1">{t.name}</span>
                  {isMine && (
                    <span className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
                      Tu
                    </span>
                  )}
                </div>
                {t.manager_name && (
                  <span className="block truncate text-[11px] text-ink-5">{t.manager_name}</span>
                )}
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold ${
                  t.submitted
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-500 dark:text-rose-400'
                }`}
              >
                {t.submitted ? 'Inviata' : locked ? 'Non schierata' : 'In attesa'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
