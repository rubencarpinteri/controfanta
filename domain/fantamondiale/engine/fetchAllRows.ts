// Fetch every row of a query, paging past PostgREST's default 1000-row cap.
// A round-wide read of player stats or the national-team pool easily exceeds
// that limit; without paging the response is silently truncated and rows go
// missing — players vanish from the live board, or final scores lose stats.
//
// CRITICAL: paging is only correct over a STABLE total order. PostgREST gives
// no implicit row order, so `.range(0,999)` then `.range(1000,1999)` can return
// overlapping or skipped rows between pages — silently dropping data in a way
// that varies run-to-run (the original "only a few players live" bug: two
// snapshots computed seconds apart, one complete, one with its tail gutted).
// We therefore force an explicit `.order(orderBy)` on every page. Pass a column
// with a unique, immutable value (a primary key) — never a non-unique column,
// which re-introduces the instability this guards against.
export async function fetchAllRows<T>(
  // A factory, not a builder: supabase-js query builders are single-use once
  // awaited, so each page needs a fresh one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any,
  orderBy = 'id',
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery()
      .order(orderBy, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}
