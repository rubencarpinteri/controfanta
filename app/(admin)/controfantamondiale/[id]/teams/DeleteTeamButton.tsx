'use client'

import { deleteTeamAction } from './actions'

export function DeleteTeamButton({
  teamId,
  competitionId,
  teamName,
}: {
  teamId: string
  competitionId: string
  teamName: string
}) {
  return (
    <form
      action={deleteTeamAction.bind(null, teamId, competitionId)}
      onSubmit={(e) => {
        if (!confirm(`Eliminare definitivamente "${teamName}"? Questa azione è irreversibile.`)) {
          e.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        title="Elimina definitivamente"
        className="rounded px-2 py-1 text-[10px] font-medium text-ink-5 border border-hairline hover:text-rose-400 hover:border-rose-400/40 hover:bg-rose-400/10 transition-colors"
      >
        Elimina
      </button>
    </form>
  )
}
