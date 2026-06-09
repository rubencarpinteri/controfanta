-- Immunità toggle (league-level game rule).
-- When true, a player fielded by exactly ONE team in a lega during a scoring
-- round has his yellow/red card malus waived. Defaults true to preserve the
-- previous "sempre attiva" behaviour. Consumed by the FantaMondiale engine
-- (final + live) via loadFMUnifiedConfig.
alter table public.league_engine_config
  add column if not exists immunita_enabled boolean not null default true;

comment on column public.league_engine_config.immunita_enabled is
  'Immunità: when true, a player fielded by exactly one team in a lega for a scoring round has his yellow/red card malus waived.';
