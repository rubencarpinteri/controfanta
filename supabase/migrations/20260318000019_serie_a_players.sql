-- ============================================================
-- Controfanta — Serie A Global Player Pool
-- Migration: 20260318000019_serie_a_players
-- ============================================================
-- PURPOSE:
--   * serie_a_players is a global (non-league-specific) reference table
--     containing real Serie A players with external provider IDs.
--   * league_players gains a serie_a_player_id FK to link fantasy league
--     players back to the global pool entry.
--   * audit_action enum is extended with rosa_assign, rosa_release, pool_import.
-- ============================================================

-- ============================================================
-- EXTEND audit_action ENUM
-- ============================================================

alter type audit_action add value if not exists 'rosa_assign';
alter type audit_action add value if not exists 'rosa_release';
alter type audit_action add value if not exists 'pool_import';

-- ============================================================
-- SERIE A PLAYERS (global pool)
-- ============================================================

create table serie_a_players (
  id              uuid         primary key default gen_random_uuid(),
  full_name       text         not null,
  club            text         not null,
  mantra_roles    text[]       not null default '{}',
  rating_class    text         not null,
  sofascore_id    bigint,
  fotmob_id       bigint,
  season          text         not null default '2024-25',
  is_active       boolean      not null default true,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now(),
  constraint chk_serie_a_rating_class check (rating_class in ('GK', 'DEF', 'MID', 'ATT')),
  constraint uq_serie_a_player unique (full_name, club, season)
);

-- Indexes for common query patterns
create index idx_serie_a_players_season         on serie_a_players (season);
create index idx_serie_a_players_club           on serie_a_players (club);
create index idx_serie_a_players_rating_class   on serie_a_players (rating_class);
create index idx_serie_a_players_sofascore_id   on serie_a_players (sofascore_id) where sofascore_id is not null;
create index idx_serie_a_players_fotmob_id      on serie_a_players (fotmob_id)    where fotmob_id    is not null;
create index idx_serie_a_players_search         on serie_a_players using gin (full_name gin_trgm_ops);

-- updated_at trigger
create trigger set_serie_a_players_updated_at
  before update on serie_a_players
  for each row execute function update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY — serie_a_players
-- ============================================================

alter table serie_a_players enable row level security;

-- All authenticated users can read (global reference data)
create policy "serie_a_players: authenticated read"
  on serie_a_players
  for select
  using (auth.role() = 'authenticated');

-- Only super-admins can insert/update/delete pool data
-- League admins get write access via the service role used in server actions
create policy "serie_a_players: super admin write"
  on serie_a_players
  for all
  using (is_super_admin())
  with check (is_super_admin());

-- ============================================================
-- ALTER league_players — add serie_a_player_id FK
-- ============================================================

alter table league_players
  add column if not exists serie_a_player_id uuid
    references serie_a_players (id) on delete set null;

create index if not exists idx_league_players_serie_a
  on league_players (serie_a_player_id) where serie_a_player_id is not null;

-- ============================================================
-- NOTE: pg_trgm extension is required for the gin_trgm_ops index.
-- If not already enabled, enable it:
-- ============================================================

create extension if not exists pg_trgm;
