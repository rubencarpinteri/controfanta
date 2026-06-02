-- ============================================================
-- Controfanta — config_json on calculation_runs
-- Migration: 20260318000008_calculation_runs_config_json
-- ============================================================
-- Adds a config_json column to calculation_runs so that the
-- exact engine configuration used for each run is preserved
-- at the DB level.  This allows historical runs to be fully
-- reproduced without relying on engine_version implying a
-- specific config snapshot.
-- ============================================================

ALTER TABLE calculation_runs
  ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb;
