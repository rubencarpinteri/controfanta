// Shared visual for the frozen competition-level coach tier (T1–T4).
// Tiers live in `fm_competition_coach_tier` and never change mid-tournament.

const TIER_META: Record<string, { short: string; label: string; cls: string }> = {
  tier_1: { short: 'T1', label: 'T1 — Favoriti',  cls: 'text-indigo-400 bg-indigo-400/10' },
  tier_2: { short: 'T2', label: 'T2 — Forti',     cls: 'text-emerald-400 bg-emerald-400/10' },
  tier_3: { short: 'T3', label: 'T3 — Outsider',  cls: 'text-amber-400 bg-amber-400/10' },
  tier_4: { short: 'T4', label: 'T4 — Underdog',  cls: 'text-rose-400 bg-rose-400/10' },
}

export function tierMeta(tier: string | null | undefined) {
  return tier ? TIER_META[tier] : undefined
}

export function CoachTierBadge({
  tier,
  full = false,
}: {
  tier: string | null | undefined
  full?: boolean
}) {
  const meta = tierMeta(tier)
  if (!meta) return null
  return (
    <span className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
      {full ? meta.label : meta.short}
    </span>
  )
}
