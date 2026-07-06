/**
 * Display-shortens knockout round names: "Ottavi di Finale" → "Ottavi",
 * "Quarti di finale" → "Quarti". The "di Finale" suffix is obvious in context
 * and only eats horizontal space in pills and headers. "Finale" itself and
 * group-stage names pass through untouched.
 */
export function shortRoundName(name: string): string {
  return name.replace(/\s+di finale\b/i, '')
}
