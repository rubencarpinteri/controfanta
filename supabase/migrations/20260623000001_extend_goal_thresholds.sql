-- Extend goal_thresholds for leagues that still use the old 6-entry default
-- (stopped at { min: 94.5, goals: 6 }). Appends entries up to 12 goals so
-- high-scoring teams in WC2026 are no longer capped at 6.
--
-- Only patches rows where the array length is exactly 7 (the 0-goal sentinel
-- plus 6 scoring entries) AND the last entry is { min: 94.5, goals: 6 }.
-- Leagues with custom thresholds are left untouched.

UPDATE public.league_engine_config
SET goal_thresholds = '[
  {"min": 0,     "goals": 0},
  {"min": 64.5,  "goals": 1},
  {"min": 70.5,  "goals": 2},
  {"min": 76.5,  "goals": 3},
  {"min": 82.5,  "goals": 4},
  {"min": 88.5,  "goals": 5},
  {"min": 94.5,  "goals": 6},
  {"min": 100.5, "goals": 7},
  {"min": 106.5, "goals": 8},
  {"min": 112.5, "goals": 9},
  {"min": 118.5, "goals": 10},
  {"min": 124.5, "goals": 11},
  {"min": 130.5, "goals": 12}
]'::jsonb
WHERE jsonb_array_length(goal_thresholds) = 7
  AND goal_thresholds @> '[{"min": 94.5, "goals": 6}]'::jsonb
  AND NOT goal_thresholds @> '[{"min": 100.5}]'::jsonb;
