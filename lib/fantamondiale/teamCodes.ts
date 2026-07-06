/**
 * Deterministic unique 3-letter codes for fantasy team names, for tight UI
 * spots (ownership pills on real-match player rows) where a full name like
 * "Squadradabbattere nazionale" wraps and breaks the layout.
 *
 * Plain slice(0, 3) collides easily ("Isamu incantatore" and "Isamundial"
 * both start "ISA"), so on a collision we walk further into the name before
 * falling back to a numbered suffix. Names are processed in sorted order so
 * the same set of teams always yields the same codes, regardless of the
 * order the caller happens to pass them in.
 */
export function buildTeamCodes(names: string[]): Map<string, string> {
  const map = new Map<string, string>()
  const taken = new Set<string>()

  for (const name of [...new Set(names)].sort((a, b) => a.localeCompare(b))) {
    const flat = name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XXX'
    let code = flat.slice(0, 3).padEnd(3, 'X')
    // Slide a 3-letter window forward until it's unique.
    let start = 1
    while (taken.has(code) && start + 3 <= flat.length) {
      code = flat.slice(start, start + 3).padEnd(3, 'X')
      start++
    }
    // Still colliding (short/repetitive name) — number it.
    if (taken.has(code)) {
      const stem = flat.slice(0, 2).padEnd(2, 'X')
      let n = 2
      while (taken.has(`${stem}${n}`)) n++
      code = `${stem}${n}`
    }
    taken.add(code)
    map.set(name, code)
  }
  return map
}
