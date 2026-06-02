-- ============================================================
-- Controfanta — Player Identity Constraint
-- Migration: 20260318000005_league_player_unique
-- ============================================================
-- Adds a DB-level unique constraint on (league_id, full_name, club)
-- for the league_players table.
--
-- Rationale:
--   The application uses (league_id, full_name, club) as the business
--   key when importing rosters. Without a constraint, concurrent or
--   repeated imports could silently create duplicate rows for the same
--   player. With this constraint, the INSERT ... ON CONFLICT idiom is
--   safe and races are impossible.
--
-- Implication for confirmImportAction:
--   The action must switch from SELECT-then-INSERT/UPDATE to a single
--   INSERT ... ON CONFLICT (league_id, full_name, club) DO UPDATE SET ...
--
-- Note on club changes:
--   A player who moves clubs is treated as a different identity
--   (same name, new club) and will receive a new row. Historical stats
--   tied to the old (player_id, old_club) row are preserved.
-- ============================================================

alter table league_players
  add constraint uq_league_player_name_club
  unique (league_id, full_name, club);
