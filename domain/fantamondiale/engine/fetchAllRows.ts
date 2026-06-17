// Fetch every row of a query, paging past PostgREST's default 1000-row cap.
// A round-wide read of player stats or the national-team pool easily exceeds
// that limit; without paging the response is silently truncated and rows go
// missing — players vanish from the live board, or final scores lose stats.
export async function fetchAllRows<T>(
  // A factory, not a builder: supabase-js query builders are single-use once
  // awaited, so each page needs a fresh one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}
