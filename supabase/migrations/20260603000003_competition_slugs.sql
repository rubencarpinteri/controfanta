-- Human-readable URL slugs for competitions.
--
-- Routes used to expose raw UUIDs (/competitions/<uuid>, /fantamondiale/<uuid>).
-- We add a `slug` to both the Serie A competitions and the per-Lega
-- FantaMondiale instances so URLs read like /competitions/campionato-2025-26
-- and /fantamondiale/fantamondiale-statistico-2026. Resolvers accept either a
-- slug or a UUID, so any pre-existing UUID links keep working.

alter table competitions add column if not exists slug text;
alter table fm_league_competition add column if not exists slug text;

-- ── Backfill: Serie A competitions (slug unique within a league) ──────────────
with base as (
  select
    id,
    league_id,
    nullif(trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')), '') as b,
    row_number() over (
      partition by league_id,
        nullif(trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')), '')
      order by created_at
    ) as rn
  from competitions
)
update competitions c
set slug = coalesce(base.b, 'competizione') || case when base.rn > 1 then '-' || base.rn else '' end
from base
where base.id = c.id and c.slug is null;

-- ── Backfill: FantaMondiale Lega instances (slug globally unique) ─────────────
-- Source the human label from the global template (name + edition); the route
-- still resolves the Lega instance id, so the slug lives on the instance row.
with base as (
  select
    lc.id,
    nullif(trim(both '-' from regexp_replace(
      lower(coalesce(fc.name, '') || '-' || coalesce(fc.edition, '')),
      '[^a-z0-9]+', '-', 'g')), '') as b,
    row_number() over (
      partition by nullif(trim(both '-' from regexp_replace(
        lower(coalesce(fc.name, '') || '-' || coalesce(fc.edition, '')),
        '[^a-z0-9]+', '-', 'g')), '')
      order by lc.created_at
    ) as rn
  from fm_league_competition lc
  join fm_competition fc on fc.id = lc.fm_competition_id
)
update fm_league_competition lc
set slug = coalesce(base.b, 'mondiale') || case when base.rn > 1 then '-' || base.rn else '' end
from base
where base.id = lc.id and lc.slug is null;

create unique index if not exists competitions_league_slug_key on competitions (league_id, slug);
create unique index if not exists fm_league_competition_slug_key on fm_league_competition (slug);
