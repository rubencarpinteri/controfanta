-- ============================================================
-- Controfanta — Row Level Security Policies
-- Migration: 20260318000002_rls_policies
-- ============================================================
-- STRATEGY:
--   * RLS is the primary authorization layer, not a secondary one.
--   * super_admin (profiles.is_super_admin = true) bypasses all restrictions.
--   * league_admin can manage everything within their league.
--   * manager can read their own team data and submit lineups before lock.
--   * Sensitive data (calculations, results) is readable by all members
--     only after the matchday is published.
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- These run with security definer to safely query profiles/league_users.
-- ============================================================

create or replace function is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from profiles where id = auth.uid()),
    false
  )
$$;

create or replace function is_league_admin(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from league_users
    where user_id = auth.uid()
      and league_id = p_league_id
      and role = 'league_admin'
  )
$$;

create or replace function is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from league_users
    where user_id = auth.uid()
      and league_id = p_league_id
  )
$$;

create or replace function get_user_team_id(p_league_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from fantasy_teams
  where league_id = p_league_id
    and manager_id = auth.uid()
  limit 1
$$;

-- ============================================================
-- PROFILES
-- ============================================================

alter table profiles enable row level security;

create policy "profiles: own read"
  on profiles for select
  using (id = auth.uid() or is_super_admin());

create policy "profiles: own update"
  on profiles for update
  using (id = auth.uid() or is_super_admin());

-- league_admins can read profiles of their league members
create policy "profiles: league_admin read members"
  on profiles for select
  using (
    exists (
      select 1
      from league_users lu_actor
      join league_users lu_target on lu_actor.league_id = lu_target.league_id
      where lu_actor.user_id = auth.uid()
        and lu_actor.role = 'league_admin'
        and lu_target.user_id = profiles.id
    )
  );

-- ============================================================
-- LEAGUES
-- ============================================================

alter table leagues enable row level security;

create policy "leagues: member read"
  on leagues for select
  using (is_league_member(id) or is_super_admin());

create policy "leagues: admin update"
  on leagues for update
  using (is_league_admin(id) or is_super_admin());

create policy "leagues: super_admin insert"
  on leagues for insert
  with check (is_super_admin());

-- ============================================================
-- LEAGUE USERS
-- ============================================================

alter table league_users enable row level security;

create policy "league_users: member read own"
  on league_users for select
  using (user_id = auth.uid() or is_super_admin());

create policy "league_users: league_admin read all in league"
  on league_users for select
  using (is_league_admin(league_id) or is_super_admin());

create policy "league_users: league_admin manage"
  on league_users for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- FANTASY TEAMS
-- ============================================================

alter table fantasy_teams enable row level security;

create policy "fantasy_teams: member read own league"
  on fantasy_teams for select
  using (is_league_member(league_id) or is_super_admin());

create policy "fantasy_teams: league_admin manage"
  on fantasy_teams for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- ROSTER IMPORT BATCHES
-- ============================================================

alter table roster_import_batches enable row level security;

create policy "roster_import_batches: league_admin manage"
  on roster_import_batches for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- LEAGUE PLAYERS
-- ============================================================

alter table league_players enable row level security;

create policy "league_players: member read"
  on league_players for select
  using (is_league_member(league_id) or is_super_admin());

create policy "league_players: league_admin manage"
  on league_players for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- PLAYER ROLE HISTORY
-- ============================================================

alter table player_role_history enable row level security;

create policy "player_role_history: league_admin read"
  on player_role_history for select
  using (
    exists (
      select 1 from league_players lp
      where lp.id = player_role_history.player_id
        and (is_league_admin(lp.league_id) or is_super_admin())
    )
  );

create policy "player_role_history: league_admin insert"
  on player_role_history for insert
  with check (
    exists (
      select 1 from league_players lp
      where lp.id = player_role_history.player_id
        and (is_league_admin(lp.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- ROLE CLASSIFICATION RULES
-- ============================================================

alter table role_classification_rules enable row level security;

create policy "role_classification_rules: member read"
  on role_classification_rules for select
  using (is_league_member(league_id) or is_super_admin());

create policy "role_classification_rules: league_admin manage"
  on role_classification_rules for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- TEAM ROSTER ENTRIES
-- ============================================================

alter table team_roster_entries enable row level security;

create policy "team_roster_entries: member read own league"
  on team_roster_entries for select
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = team_roster_entries.team_id
        and is_league_member(ft.league_id)
    ) or is_super_admin()
  );

create policy "team_roster_entries: league_admin manage"
  on team_roster_entries for all
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = team_roster_entries.team_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- FORMATIONS
-- ============================================================

alter table formations enable row level security;

create policy "formations: member read active"
  on formations for select
  using (is_league_member(league_id) or is_super_admin());

create policy "formations: league_admin manage"
  on formations for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- FORMATION SLOTS
-- ============================================================

alter table formation_slots enable row level security;

create policy "formation_slots: member read"
  on formation_slots for select
  using (
    exists (
      select 1 from formations f
      where f.id = formation_slots.formation_id
        and is_league_member(f.league_id)
    ) or is_super_admin()
  );

create policy "formation_slots: league_admin manage"
  on formation_slots for all
  using (
    exists (
      select 1 from formations f
      where f.id = formation_slots.formation_id
        and (is_league_admin(f.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- MATCHDAYS
-- ============================================================

alter table matchdays enable row level security;

create policy "matchdays: member read"
  on matchdays for select
  using (is_league_member(league_id) or is_super_admin());

create policy "matchdays: league_admin manage"
  on matchdays for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- MATCHDAY STATUS LOG
-- ============================================================

alter table matchday_status_log enable row level security;

create policy "matchday_status_log: member read"
  on matchday_status_log for select
  using (
    exists (
      select 1 from matchdays m
      where m.id = matchday_status_log.matchday_id
        and is_league_member(m.league_id)
    ) or is_super_admin()
  );

create policy "matchday_status_log: league_admin insert"
  on matchday_status_log for insert
  with check (
    exists (
      select 1 from matchdays m
      where m.id = matchday_status_log.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- LINEUP SUBMISSIONS (append-only content)
-- ============================================================

alter table lineup_submissions enable row level security;

create policy "lineup_submissions: manager read own"
  on lineup_submissions for select
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = lineup_submissions.team_id
        and ft.manager_id = auth.uid()
    ) or is_super_admin()
  );

create policy "lineup_submissions: league_admin read all"
  on lineup_submissions for select
  using (
    exists (
      select 1 from fantasy_teams ft
      join matchdays m on m.id = lineup_submissions.matchday_id
      where ft.id = lineup_submissions.team_id
        and ft.league_id = m.league_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

-- Managers insert only (no update: append-only)
create policy "lineup_submissions: manager insert before lock"
  on lineup_submissions for insert
  with check (
    exists (
      select 1
      from fantasy_teams ft
      join matchdays m on m.id = lineup_submissions.matchday_id
      where ft.id = lineup_submissions.team_id
        and ft.manager_id = auth.uid()
        and m.status in ('open')
    )
  );

create policy "lineup_submissions: league_admin insert"
  on lineup_submissions for insert
  with check (
    exists (
      select 1 from matchdays m
      where m.id = lineup_submissions.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- LINEUP CURRENT POINTERS (mutable pointer)
-- ============================================================

alter table lineup_current_pointers enable row level security;

create policy "lineup_current_pointers: manager read own"
  on lineup_current_pointers for select
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = lineup_current_pointers.team_id
        and ft.manager_id = auth.uid()
    ) or is_super_admin()
  );

create policy "lineup_current_pointers: league_admin read all"
  on lineup_current_pointers for select
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = lineup_current_pointers.team_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

create policy "lineup_current_pointers: manager upsert own before lock"
  on lineup_current_pointers for all
  using (
    exists (
      select 1
      from fantasy_teams ft
      join matchdays m on m.id = lineup_current_pointers.matchday_id
      where ft.id = lineup_current_pointers.team_id
        and ft.manager_id = auth.uid()
        and m.status = 'open'
    )
  );

create policy "lineup_current_pointers: league_admin manage"
  on lineup_current_pointers for all
  using (
    exists (
      select 1 from fantasy_teams ft
      where ft.id = lineup_current_pointers.team_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- LINEUP SUBMISSION PLAYERS
-- ============================================================

alter table lineup_submission_players enable row level security;

create policy "lineup_submission_players: manager read own"
  on lineup_submission_players for select
  using (
    exists (
      select 1
      from lineup_submissions ls
      join fantasy_teams ft on ft.id = ls.team_id
      where ls.id = lineup_submission_players.submission_id
        and ft.manager_id = auth.uid()
    ) or is_super_admin()
  );

create policy "lineup_submission_players: league_admin read all"
  on lineup_submission_players for select
  using (
    exists (
      select 1
      from lineup_submissions ls
      join fantasy_teams ft on ft.id = ls.team_id
      where ls.id = lineup_submission_players.submission_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

create policy "lineup_submission_players: manager insert"
  on lineup_submission_players for insert
  with check (
    exists (
      select 1
      from lineup_submissions ls
      join fantasy_teams ft on ft.id = ls.team_id
      join matchdays m on m.id = ls.matchday_id
      where ls.id = lineup_submission_players.submission_id
        and ft.manager_id = auth.uid()
        and m.status = 'open'
    )
  );

create policy "lineup_submission_players: league_admin insert"
  on lineup_submission_players for insert
  with check (
    exists (
      select 1
      from lineup_submissions ls
      join fantasy_teams ft on ft.id = ls.team_id
      where ls.id = lineup_submission_players.submission_id
        and (is_league_admin(ft.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- PLAYER MATCH STATS
-- Readable by all members after publication; writable by admin only.
-- ============================================================

alter table player_match_stats enable row level security;

create policy "player_match_stats: member read after publish"
  on player_match_stats for select
  using (
    exists (
      select 1
      from matchdays m
      where m.id = player_match_stats.matchday_id
        and is_league_member(m.league_id)
        and m.status in ('scoring', 'published', 'archived')
    ) or is_super_admin()
  );

create policy "player_match_stats: league_admin read all"
  on player_match_stats for select
  using (
    exists (
      select 1 from matchdays m
      where m.id = player_match_stats.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

create policy "player_match_stats: league_admin manage"
  on player_match_stats for all
  using (
    exists (
      select 1 from matchdays m
      where m.id = player_match_stats.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- CALCULATION RUNS
-- ============================================================

alter table calculation_runs enable row level security;

create policy "calculation_runs: member read published"
  on calculation_runs for select
  using (
    (
      status = 'published' and
      exists (
        select 1 from matchdays m
        where m.id = calculation_runs.matchday_id
          and is_league_member(m.league_id)
      )
    ) or is_super_admin()
  );

create policy "calculation_runs: league_admin read all"
  on calculation_runs for select
  using (
    exists (
      select 1 from matchdays m
      where m.id = calculation_runs.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

create policy "calculation_runs: league_admin manage"
  on calculation_runs for all
  using (
    exists (
      select 1 from matchdays m
      where m.id = calculation_runs.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- PLAYER CALCULATIONS
-- ============================================================

alter table player_calculations enable row level security;

create policy "player_calculations: member read published"
  on player_calculations for select
  using (
    (
      exists (
        select 1
        from calculation_runs cr
        join matchdays m on m.id = cr.matchday_id
        where cr.id = player_calculations.run_id
          and cr.status = 'published'
          and is_league_member(m.league_id)
      )
    ) or is_super_admin()
  );

create policy "player_calculations: league_admin read all"
  on player_calculations for select
  using (
    exists (
      select 1
      from calculation_runs cr
      join matchdays m on m.id = cr.matchday_id
      where cr.id = player_calculations.run_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

create policy "player_calculations: league_admin manage"
  on player_calculations for all
  using (
    exists (
      select 1
      from calculation_runs cr
      join matchdays m on m.id = cr.matchday_id
      where cr.id = player_calculations.run_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- MATCHDAY CURRENT CALCULATION
-- ============================================================

alter table matchday_current_calculation enable row level security;

create policy "matchday_current_calculation: member read"
  on matchday_current_calculation for select
  using (
    exists (
      select 1 from matchdays m
      where m.id = matchday_current_calculation.matchday_id
        and is_league_member(m.league_id)
    ) or is_super_admin()
  );

create policy "matchday_current_calculation: league_admin manage"
  on matchday_current_calculation for all
  using (
    exists (
      select 1 from matchdays m
      where m.id = matchday_current_calculation.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- SCORE OVERRIDES
-- ============================================================

alter table score_overrides enable row level security;

create policy "score_overrides: member read after publish"
  on score_overrides for select
  using (
    (
      exists (
        select 1 from matchdays m
        where m.id = score_overrides.matchday_id
          and is_league_member(m.league_id)
          and m.status in ('published', 'archived')
      )
    ) or is_super_admin()
  );

create policy "score_overrides: league_admin manage"
  on score_overrides for all
  using (
    exists (
      select 1 from matchdays m
      where m.id = score_overrides.matchday_id
        and (is_league_admin(m.league_id) or is_super_admin())
    )
  );

-- ============================================================
-- STANDINGS SNAPSHOTS
-- ============================================================

alter table standings_snapshots enable row level security;

create policy "standings_snapshots: member read published"
  on standings_snapshots for select
  using (
    (
      published_at is not null
      and is_league_member(league_id)
    ) or is_super_admin()
  );

create policy "standings_snapshots: league_admin manage"
  on standings_snapshots for all
  using (is_league_admin(league_id) or is_super_admin());

-- ============================================================
-- AUDIT LOGS
-- Only league_admin and super_admin can read audit logs.
-- Inserts happen via server-side service role or trusted actions.
-- ============================================================

alter table audit_logs enable row level security;

create policy "audit_logs: league_admin read"
  on audit_logs for select
  using (
    (league_id is not null and (is_league_admin(league_id) or is_super_admin()))
    or (league_id is null and is_super_admin())
  );

create policy "audit_logs: insert via server"
  on audit_logs for insert
  with check (
    (league_id is not null and (is_league_admin(league_id) or is_super_admin()))
    or is_super_admin()
  );

-- ============================================================
-- APP SETTINGS
-- ============================================================

alter table app_settings enable row level security;

create policy "app_settings: league_admin read"
  on app_settings for select
  using (is_league_admin(league_id) or is_super_admin());

create policy "app_settings: league_admin manage"
  on app_settings for all
  using (is_league_admin(league_id) or is_super_admin());
