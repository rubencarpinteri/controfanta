-- ============================================================
-- Controfanta — Initial Schema
-- Migration: 20260318000001_initial_schema
-- ============================================================
-- DESIGN NOTES:
--   * lineup_submissions is APPEND-ONLY. Rows are never updated.
--     The active submission is tracked via lineup_current_pointers.
--   * player_calculations are grouped into calculation_runs.
--     The official published run is tracked via matchday_current_calculation.
--   * rating_class is always explicitly stored on league_players.
--     role_classification_rules provides defaults at import time only.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

create type league_role as enum ('league_admin', 'manager');

create type rating_class as enum ('GK', 'DEF', 'MID', 'ATT');

create type scoring_mode as enum ('head_to_head', 'points_only', 'both');

create type display_rounding as enum ('one_decimal', 'nearest_half');

create type lock_behavior as enum ('auto', 'manual');

create type matchday_status as enum (
  'draft', 'open', 'locked', 'scoring', 'published', 'archived'
);

create type lineup_status as enum ('draft', 'submitted', 'locked');

create type calculation_status as enum ('draft', 'provisional', 'published');

create type audit_action as enum (
  'roster_import',
  'roster_edit',
  'player_create',
  'player_role_change',
  'player_rating_class_change',
  'player_transfer',
  'matchday_create',
  'matchday_status_change',
  'matchday_reopen',
  'lineup_save',
  'lineup_submit',
  'lineup_lock',
  'stats_edit',
  'ratings_edit',
  'calculation_draft',
  'calculation_publish',
  'override_create',
  'override_remove',
  'league_settings_change',
  'formation_settings_change',
  'ambiguous_role_change',
  'user_role_change'
);

-- ============================================================
-- SHARED TRIGGER: updated_at
-- ============================================================

create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- PROFILES
-- Identity only. No league role here.
-- is_super_admin is the only global privilege flag.
-- ============================================================

create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  username       text not null unique,
  full_name      text not null default '',
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_username_length check (char_length(username) between 2 and 50)
);

create index idx_profiles_username on profiles (username);

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at_column();

-- Auto-create profile on Supabase auth signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- LEAGUES
-- ============================================================

create table leagues (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  season_name              text not null,
  timezone                 text not null default 'Europe/Rome',
  scoring_mode             scoring_mode not null default 'head_to_head',
  display_rounding         display_rounding not null default 'one_decimal',
  lock_behavior            lock_behavior not null default 'auto',
  advanced_bonuses_enabled boolean not null default false,
  bench_size               int not null default 7,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint chk_bench_size check (bench_size between 1 and 10),
  constraint chk_timezone   check (char_length(timezone) > 0)
);

create trigger leagues_updated_at
  before update on leagues
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- LEAGUE USERS
-- League-scoped roles. One row per user per league.
-- ============================================================

create table league_users (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues on delete cascade,
  user_id   uuid not null references profiles on delete cascade,
  role      league_role not null,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index idx_league_users_user_id   on league_users (user_id);
create index idx_league_users_league_id on league_users (league_id);

-- ============================================================
-- FANTASY TEAMS
-- ============================================================

create table fantasy_teams (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues on delete cascade,
  manager_id uuid not null references profiles on delete restrict,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (league_id, manager_id),
  unique (league_id, name)
);

create index idx_fantasy_teams_league_id on fantasy_teams (league_id);

-- ============================================================
-- ROSTER IMPORT BATCHES
-- ============================================================

create table roster_import_batches (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues on delete cascade,
  imported_by    uuid not null references profiles,
  filename       text not null,
  storage_path   text,
  row_count      int not null default 0,
  success_count  int not null default 0,
  error_count    int not null default 0,
  import_summary jsonb,
  created_at     timestamptz not null default now()
);

create index idx_roster_import_batches_league on roster_import_batches (league_id);

-- ============================================================
-- LEAGUE PLAYERS
-- League-scoped player pool. rating_class is ALWAYS explicitly set.
-- Never derived at runtime from mantra_roles.
-- ============================================================

create table league_players (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references leagues on delete cascade,
  full_name           text not null,
  club                text not null,
  mantra_roles        text[] not null,
  primary_mantra_role text,
  rating_class        rating_class not null,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (league_id, full_name, club),
  constraint chk_mantra_roles_nonempty check (array_length(mantra_roles, 1) > 0)
);

create index idx_league_players_league_id on league_players (league_id);
create index idx_league_players_club      on league_players (league_id, club);
create index idx_league_players_active    on league_players (league_id, is_active);

create trigger league_players_updated_at
  before update on league_players
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PLAYER ROLE HISTORY
-- Append-only log of every role or rating_class change on a player.
-- ============================================================

create table player_role_history (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references league_players on delete cascade,
  changed_at        timestamptz not null default now(),
  changed_by        uuid not null references profiles,
  old_mantra_roles  text[],
  new_mantra_roles  text[],
  old_rating_class  rating_class,
  new_rating_class  rating_class,
  reason            text
);

create index idx_player_role_history_player on player_role_history (player_id);

-- ============================================================
-- ROLE CLASSIFICATION RULES
-- League-level defaults for ambiguous Mantra roles (e.g. E → DEF or MID).
-- These are used at import/creation time to pre-fill suggestions.
-- They are NOT read at calculation runtime.
-- ============================================================

create table role_classification_rules (
  id                   uuid primary key default gen_random_uuid(),
  league_id            uuid not null references leagues on delete cascade,
  mantra_role          text not null,
  default_rating_class rating_class not null,
  updated_by           uuid references profiles,
  updated_at           timestamptz not null default now(),
  unique (league_id, mantra_role),
  constraint chk_mantra_role_nonempty check (char_length(mantra_role) > 0)
);

create index idx_role_rules_league on role_classification_rules (league_id);

-- ============================================================
-- TEAM ROSTER ENTRIES
-- Tracks which player is on which team.
-- ENFORCES: a player can only be on one active roster at a time.
-- ============================================================

create table team_roster_entries (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references fantasy_teams on delete cascade,
  player_id       uuid not null references league_players on delete restrict,
  acquired_at     timestamptz not null default now(),
  released_at     timestamptz,
  import_batch_id uuid references roster_import_batches,
  constraint chk_released_after_acquired check (
    released_at is null or released_at >= acquired_at
  )
);

-- Partial unique index: player can be on at most one active roster
create unique index uq_active_roster_entry
  on team_roster_entries (player_id)
  where (released_at is null);

create index idx_roster_entries_team_id   on team_roster_entries (team_id);
create index idx_roster_entries_player_id on team_roster_entries (player_id);

-- ============================================================
-- FORMATIONS
-- Admin-configurable. No hardcoded Mantra slot logic.
-- ============================================================

create table formations (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (league_id, name)
);

create index idx_formations_league_id on formations (league_id);

-- ============================================================
-- FORMATION SLOTS
-- Each slot declares which Mantra roles are compatible with it.
-- Starters: is_bench = false, bench_order = null.
-- Bench:    is_bench = true,  bench_order > 0.
-- ============================================================

create table formation_slots (
  id                   uuid primary key default gen_random_uuid(),
  formation_id         uuid not null references formations on delete cascade,
  slot_name            text not null,
  slot_order           int not null,
  allowed_mantra_roles text[] not null,
  is_bench             boolean not null default false,
  bench_order          int,
  unique (formation_id, slot_name),
  constraint chk_slot_order   check (slot_order > 0),
  constraint chk_bench_order  check (
    (is_bench = false and bench_order is null) or
    (is_bench = true  and bench_order > 0)
  ),
  constraint chk_allowed_roles_nonempty check (
    array_length(allowed_mantra_roles, 1) > 0
  )
);

create index idx_formation_slots_formation on formation_slots (formation_id);

-- ============================================================
-- MATCHDAYS
-- ============================================================

create table matchdays (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid not null references leagues on delete cascade,
  name             text not null,
  matchday_number  int,
  opens_at         timestamptz,
  locks_at         timestamptz,
  status           matchday_status not null default 'draft',
  created_by       uuid not null references profiles,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_lock_after_open check (
    opens_at is null or locks_at is null or locks_at > opens_at
  )
);

create index idx_matchdays_league_id on matchdays (league_id);
create index idx_matchdays_status    on matchdays (league_id, status);

create trigger matchdays_updated_at
  before update on matchdays
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- MATCHDAY STATUS LOG
-- Every status transition is recorded here.
-- ============================================================

create table matchday_status_log (
  id          uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references matchdays on delete cascade,
  old_status  matchday_status,
  new_status  matchday_status not null,
  changed_by  uuid not null references profiles,
  changed_at  timestamptz not null default now(),
  note        text
);

create index idx_matchday_status_log on matchday_status_log (matchday_id);

-- ============================================================
-- LINEUP SUBMISSIONS — APPEND-ONLY
-- Rows are inserted once and NEVER updated.
-- The current active submission is tracked by lineup_current_pointers.
-- submission_number increases monotonically per (team, matchday).
-- ============================================================

create table lineup_submissions (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references fantasy_teams on delete cascade,
  matchday_id          uuid not null references matchdays on delete cascade,
  formation_id         uuid not null references formations,
  status               lineup_status not null default 'draft',
  submission_number    int not null default 1,
  -- No updated_at: this row is written once and never modified.
  created_at           timestamptz not null default now(),
  submitted_at         timestamptz,
  locked_at            timestamptz,
  locked_snapshot_json jsonb,
  actor_user_id        uuid not null references profiles,
  source_ip            text,
  constraint chk_submitted_at check (
    (status = 'draft') or
    (status in ('submitted', 'locked') and submitted_at is not null)
  )
);

create index idx_lineup_submissions_team_matchday on lineup_submissions (team_id, matchday_id);
create index idx_lineup_submissions_matchday      on lineup_submissions (matchday_id);

-- ============================================================
-- LINEUP CURRENT POINTERS
-- Mutable pointer to the current active submission per (team, matchday).
-- Content (lineup_submissions) is immutable; this pointer is not.
-- ============================================================

create table lineup_current_pointers (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references fantasy_teams on delete cascade,
  matchday_id   uuid not null references matchdays on delete cascade,
  submission_id uuid not null references lineup_submissions,
  updated_at    timestamptz not null default now(),
  unique (team_id, matchday_id)
);

-- ============================================================
-- LINEUP SUBMISSION PLAYERS
-- Players assigned to slots in a specific submission (immutable).
-- ============================================================

create table lineup_submission_players (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null references lineup_submissions on delete cascade,
  player_id            uuid not null references league_players,
  slot_id              uuid not null references formation_slots,
  is_bench             boolean not null default false,
  bench_order          int,
  assigned_mantra_role text,
  unique (submission_id, player_id),
  unique (submission_id, slot_id)
);

create index idx_lineup_submission_players on lineup_submission_players (submission_id);

-- ============================================================
-- PLAYER MATCH STATS
-- Admin enters raw stats and source ratings per player per matchday.
-- ============================================================

create table player_match_stats (
  id                    uuid primary key default gen_random_uuid(),
  matchday_id           uuid not null references matchdays on delete cascade,
  player_id             uuid not null references league_players on delete restrict,
  entered_by            uuid not null references profiles,
  minutes_played        int not null default 0,
  -- Optional per-matchday rating class override (null = use player default)
  rating_class_override rating_class,

  -- Source ratings (nullable: may be missing)
  sofascore_rating      numeric(4,2),
  whoscored_rating      numeric(4,2),
  fotmob_rating         numeric(4,2),

  -- Defensive / GK metrics
  tackles_won           int not null default 0,
  interceptions         int not null default 0,
  clearances            int not null default 0,
  blocks                int not null default 0,
  aerial_duels_won      int not null default 0,
  dribbled_past         int not null default 0,
  saves                 int not null default 0,
  goals_conceded        int not null default 0,
  error_leading_to_goal int not null default 0,

  -- Event modifiers
  goals_scored          int not null default 0,
  assists               int not null default 0,
  own_goals             int not null default 0,
  yellow_cards          int not null default 0,
  red_cards             int not null default 0,
  penalties_scored      int not null default 0,
  penalties_missed      int not null default 0,
  penalties_saved       int not null default 0,
  clean_sheet           boolean not null default false,

  -- Optional advanced bonus inputs (all nullable)
  key_passes            int,
  expected_assists      numeric(4,2),
  successful_dribbles   int,
  dribble_success_rate  numeric(5,2),
  completed_passes      int,
  pass_accuracy         numeric(5,2),
  final_third_passes    int,
  progressive_passes    int,

  -- Flags
  is_provisional      boolean not null default false,
  has_decisive_event  boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (matchday_id, player_id),

  constraint chk_minutes       check (minutes_played between 0 and 120),
  constraint chk_yellow_cards  check (yellow_cards in (0, 1)),
  constraint chk_red_cards     check (red_cards in (0, 1)),
  constraint chk_goals_nonneg  check (goals_scored >= 0),
  constraint chk_own_goals     check (own_goals >= 0),
  constraint chk_saves_nonneg  check (saves >= 0),
  constraint chk_assists       check (assists >= 0)
);

create index idx_player_match_stats_matchday on player_match_stats (matchday_id);
create index idx_player_match_stats_player   on player_match_stats (player_id);

create trigger player_match_stats_updated_at
  before update on player_match_stats
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- CALCULATION RUNS
-- Each admin-triggered calculation creates a new run.
-- run_number increments per matchday.
-- The official run is tracked in matchday_current_calculation.
-- ============================================================

create table calculation_runs (
  id           uuid primary key default gen_random_uuid(),
  matchday_id  uuid not null references matchdays on delete cascade,
  run_number   int not null,
  status       calculation_status not null default 'draft',
  engine_version text not null default 'v1',
  triggered_by uuid not null references profiles,
  triggered_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references profiles,
  note         text,
  unique (matchday_id, run_number)
);

create index idx_calculation_runs_matchday on calculation_runs (matchday_id);

-- ============================================================
-- PLAYER CALCULATIONS
-- One row per player per calculation run.
-- All intermediate engine values are stored for full transparency.
-- ============================================================

create table player_calculations (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references calculation_runs on delete cascade,
  matchday_id          uuid not null references matchdays,
  player_id            uuid not null references league_players on delete restrict,
  stats_id             uuid not null references player_match_stats,

  -- Step 1–2: Normalization and weighted combination
  z_sofascore          numeric(8,4),
  z_whoscored          numeric(8,4),
  z_fotmob             numeric(8,4),
  z_combined           numeric(8,4),
  weights_used         jsonb,   -- actual weights after rescaling for missing sources

  -- Step 3: Minutes factor
  minutes_factor       numeric(4,2),
  z_adjusted           numeric(8,4),

  -- Step 4–5: Base conversion and role multiplier
  b0                   numeric(6,3),
  role_multiplier      numeric(4,2),
  b1                   numeric(6,3),

  -- Step 6–7: Defensive correction and Voto Base
  defensive_correction numeric(6,3),
  voto_base            numeric(4,1),

  -- Step 8–9: Bonus/malus and final score
  bonus_malus_breakdown jsonb,  -- itemized breakdown of every bonus/malus
  total_bonus_malus    numeric(5,2),
  fantavoto            numeric(4,1),

  -- Flags
  is_provisional       boolean not null default false,
  is_override          boolean not null default false,
  override_id          uuid, -- FK to score_overrides added below after that table is created

  calculated_at        timestamptz not null default now(),

  unique (run_id, player_id)
);

create index idx_player_calculations_run    on player_calculations (run_id);
create index idx_player_calculations_player on player_calculations (player_id, matchday_id);

-- ============================================================
-- MATCHDAY CURRENT CALCULATION
-- Mutable pointer to the officially published calculation run.
-- ============================================================

create table matchday_current_calculation (
  matchday_id uuid primary key references matchdays on delete cascade,
  run_id      uuid not null references calculation_runs,
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- SCORE OVERRIDES
-- Original calculated score remains visible alongside override.
-- ============================================================

create table score_overrides (
  id                 uuid primary key default gen_random_uuid(),
  matchday_id        uuid not null references matchdays on delete cascade,
  player_id          uuid not null references league_players on delete restrict,
  original_fantavoto numeric(4,1),
  override_fantavoto numeric(4,1) not null,
  reason             text not null,
  created_by         uuid not null references profiles,
  created_at         timestamptz not null default now(),
  removed_at         timestamptz,
  removed_by         uuid references profiles,
  constraint chk_removal check (
    (removed_at is null     and removed_by is null) or
    (removed_at is not null and removed_by is not null)
  )
);

create index idx_score_overrides_matchday on score_overrides (matchday_id);

-- FK deferred until after score_overrides is created
alter table player_calculations
  add constraint player_calculations_override_id_fkey
  foreign key (override_id) references score_overrides;

-- ============================================================
-- STANDINGS SNAPSHOTS
-- Versioned snapshots; never overwrite existing rows.
-- ============================================================

create table standings_snapshots (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues on delete cascade,
  matchday_id    uuid not null references matchdays,
  snapshot_json  jsonb not null,
  calculated_at  timestamptz not null default now(),
  published_at   timestamptz,
  version_number int not null default 1
);

create index idx_standings_matchday on standings_snapshots (matchday_id);

-- ============================================================
-- AUDIT LOGS
-- Append-only. Every important action is logged here.
-- ============================================================

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid references leagues,
  actor_user_id uuid references profiles,
  action_type   audit_action not null,
  entity_type   text not null,
  entity_id     uuid,
  before_json   jsonb,
  after_json    jsonb,
  metadata_json jsonb,
  created_at    timestamptz not null default now()
);

create index idx_audit_logs_league   on audit_logs (league_id, created_at desc);
create index idx_audit_logs_entity   on audit_logs (entity_type, entity_id);
create index idx_audit_logs_actor    on audit_logs (actor_user_id);
create index idx_audit_logs_action   on audit_logs (action_type);

-- ============================================================
-- APP SETTINGS
-- Flexible key/value store for per-league configuration.
-- ============================================================

create table app_settings (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_by uuid references profiles,
  updated_at timestamptz not null default now(),
  unique (league_id, key)
);
