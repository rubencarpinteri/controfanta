// Instant skeleton shown while FM competition pages fetch on the server.
// Without this, tapping a tab gives zero feedback until every query resolves,
// which reads as "the site is frozen" on mobile.
export default function FMLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Caricamento…">
      <div className="h-6 w-40 rounded-lg bg-glass-2" />
      <div className="space-y-2 rounded-xl border border-hairline p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-4 rounded bg-glass-2" />
            <div className="h-4 flex-1 rounded bg-glass-2" />
            <div className="h-4 w-10 rounded bg-glass-2" />
          </div>
        ))}
      </div>
      <div className="h-24 rounded-xl border border-hairline bg-glass-1" />
    </div>
  )
}
