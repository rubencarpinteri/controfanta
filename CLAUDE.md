# CONTROFANTA — Claude Context

Full-stack Italian Mantra-style fantasy football app. Private league, statistics-based scoring.

## Stack
- Next.js 15 App Router, React 19.2, TypeScript strict (`noUncheckedIndexedAccess: true`)
- Tailwind CSS v4, Supabase (`@supabase/ssr` exclusively), Zod for server validation
- Deployment: Vercel (`https://controfanta.vercel.app`) + Supabase project `yqaxcpkjqvtroxinjjvw` (controfanta)
- GitHub: `https://github.com/rubencarpinteri/controfanta`

## Key Rules
- Always write code in English (comments, variables, types). UI strings stay Italian.
- No component libraries — custom Tailwind components only
- **Theming:** light by default, dark via `.dark` on `<html>` (toggled by `components/ui/ThemeToggle.tsx`, persisted in `localStorage.theme`, applied pre-paint by inline boot script in `app/layout.tsx`)
- Use semantic CSS-var-driven utilities (`text-ink-1..5`, `bg-glass-1..3`, `bg-surface-0..3`, `border-hairline`, `border-hairline-strong`, `divide-hairline`) so colors auto-flip with the active theme. Avoid hardcoded hex (`text-[#f5f7ff]`) or `bg-white/[0.0x]` overlays.
- Keep `text-white` only when text sits on a saturated colored background (indigo/emerald/rose CTA buttons); otherwise use `text-ink-1`.
- Radii (airy): sm 10px, md 14px, lg 22px, xl 28px, 2xl 36px (defined in `app/globals.css` `@theme`).
- **Fonts:** semantic slots `--cf-font-{heading,body,accent,mono}` in `globals.css`, swappable at runtime by the admin Font Switcher (`components/admin/FontSwitcher.tsx`, localStorage `cf-fonts`, applied pre-paint by boot script in `app/layout.tsx`). Only 7 approved Google Fonts; accent words use synthetic oblique via `--cf-accent-style`.
- Use `useActionState` from `react` (NOT `useFormState` from `react-dom`)
- `cookies()` from `next/headers` must be awaited (returns Promise in Next.js 15)

## Architecture
- `profiles.is_super_admin` — no role field on profiles
- League roles in `league_users.role` (enum: `league_admin | manager`)
- `lineup_submissions` is APPEND-ONLY — never update rows
- `rating_class` stored explicitly on `league_players`, NEVER derived at runtime
- `resolveRatingClass()` is import-time only — `domain/roles/resolveRatingClass.ts`

## Engine v2.0 (SportMonks single-source)
- Sole rating source: **SportMonks**. FotMob + SofaScore were ripped out around May 2026.
- Default mode is passthrough (`normalize_ratings: false`). Set `true` on a `league_engine_config` row to opt back into the z-score path.
- Normalization (when enabled): `z = (rating − rating_mean) / rating_std`. Defaults: mean 6.87, std 0.79 (Ball et al. 2025, configurable per league).
- Live ingest: cron `GET /api/cron/sportmonks-ratings-tick` every minute polls `/livescores/inplay` for active SportMonks leagues, parses each fixture, and upserts:
  - `player_match_stats` for Serie A (via `upsertSerieAPlayerStats` — keyed on (matchday_id, player_id), `is_provisional=true`, `entered_by=null`)
  - `fm_player_match_stats` for FantaMondiale (via `upsertFMPlayerStats`)
- Player matching is ID-only: `serie_a_players.sportmonks_player_id`, `fm_player.sportmonks_player_id`. No name matching at ingest time.

## Supabase patterns
- Server client: `createClient()` in `lib/supabase/server.ts` (async, per-request)
- Browser client: `createBrowserClient` in `lib/supabase/client.ts`
- Middleware refreshes token via `supabase.auth.getUser()` (NOT `getSession()`)

## Data files
- `_data/SerieAcalendar2526.csv` — legacy 25/26 match schedule (sofa/fotmob ID columns no longer read).
- Future: 26/27 calendar CSV will populate `sportmonks_fixture_id` at column 7.
