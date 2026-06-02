-- ============================================================
-- Controfanta — Append-Only Table Guards
-- Migration: 20260318000003_append_only_guards
-- ============================================================
-- Adds BEFORE UPDATE and BEFORE DELETE triggers to tables that
-- must never be modified after insert. This enforces the
-- append-only contract at the database level, independent of
-- the TypeScript layer or RLS policies.
--
-- Append-only tables:
--   lineup_submissions         — rows written once, never updated
--   lineup_submission_players  — tied to an immutable submission
--   player_calculations        — per-run snapshots, immutable
--   player_role_history        — historical record of role changes
--   audit_logs                 — tamper-evident audit trail
--   matchday_status_log        — immutable transition record
-- ============================================================

-- ============================================================
-- Generic guard function
-- ============================================================

create or replace function prevent_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Table "%" is append-only. UPDATE and DELETE are not permitted. '
    'Create a new row instead. (trigger: prevent_modification)',
    tg_table_name;
  return null;
end;
$$;

-- ============================================================
-- lineup_submissions — append-only content
-- ============================================================

create trigger lineup_submissions_no_update
  before update on lineup_submissions
  for each row execute function prevent_modification();

create trigger lineup_submissions_no_delete
  before delete on lineup_submissions
  for each row execute function prevent_modification();

-- ============================================================
-- lineup_submission_players — append-only content
-- ============================================================

create trigger lineup_submission_players_no_update
  before update on lineup_submission_players
  for each row execute function prevent_modification();

create trigger lineup_submission_players_no_delete
  before delete on lineup_submission_players
  for each row execute function prevent_modification();

-- ============================================================
-- player_calculations — immutable per-run snapshot
-- ============================================================

create trigger player_calculations_no_update
  before update on player_calculations
  for each row execute function prevent_modification();

create trigger player_calculations_no_delete
  before delete on player_calculations
  for each row execute function prevent_modification();

-- ============================================================
-- player_role_history — immutable historical record
-- ============================================================

create trigger player_role_history_no_update
  before update on player_role_history
  for each row execute function prevent_modification();

create trigger player_role_history_no_delete
  before delete on player_role_history
  for each row execute function prevent_modification();

-- ============================================================
-- audit_logs — tamper-evident
-- ============================================================

create trigger audit_logs_no_update
  before update on audit_logs
  for each row execute function prevent_modification();

create trigger audit_logs_no_delete
  before delete on audit_logs
  for each row execute function prevent_modification();

-- ============================================================
-- matchday_status_log — immutable transition record
-- ============================================================

create trigger matchday_status_log_no_update
  before update on matchday_status_log
  for each row execute function prevent_modification();

create trigger matchday_status_log_no_delete
  before delete on matchday_status_log
  for each row execute function prevent_modification();
