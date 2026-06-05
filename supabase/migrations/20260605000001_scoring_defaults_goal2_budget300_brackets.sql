-- Rebalance scoring defaults (team brainstorm, 2026-06-05):
--   * Goal scored 1.5 -> 2.0 (flat, all roles) so a goal is double an assist (1.0)
--   * Popularity penalty: same 6 ownership bands, more punishing high-ownership
--     values to suit the larger 300-credit economy
--   * MVP bonus: mirror of the popularity curve (rarer pick = bigger bonus)
-- These set the column-level DEFAULTS for future leagues; the live league row
-- and per-phase budgets are updated as data alongside this migration.

alter table league_engine_config alter column goal_bonus_gk  set default 2.00;
alter table league_engine_config alter column goal_bonus_def set default 2.00;
alter table league_engine_config alter column goal_bonus_mid set default 2.00;
alter table league_engine_config alter column goal_bonus_att set default 2.00;

alter table league_engine_config alter column popularity_brackets set default
  '[{"min_pct":0,"max_pct":10,"pct":0},
    {"min_pct":11,"max_pct":25,"pct":10},
    {"min_pct":26,"max_pct":45,"pct":25},
    {"min_pct":46,"max_pct":65,"pct":50},
    {"min_pct":66,"max_pct":80,"pct":60},
    {"min_pct":81,"max_pct":100,"pct":70}]'::jsonb;

alter table league_engine_config alter column mvp_bonus_brackets set default
  '[{"min_pct":0,"max_pct":10,"pct":70},
    {"min_pct":11,"max_pct":25,"pct":60},
    {"min_pct":26,"max_pct":45,"pct":50},
    {"min_pct":46,"max_pct":65,"pct":25},
    {"min_pct":66,"max_pct":80,"pct":10},
    {"min_pct":81,"max_pct":100,"pct":0}]'::jsonb;
