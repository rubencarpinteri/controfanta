// Shared slug helpers for human-readable competition URLs.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the string looks like a Postgres UUID (legacy/fallback URL form). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Lowercase, ASCII, dash-separated slug. Empty input → 'x' (never blank). */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'x'
}
