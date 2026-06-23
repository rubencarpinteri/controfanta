-- Extend goal_thresholds for leagues using the step-4 pattern that stopped at
-- { min: 90, goals: 8 }. Continues the same step-4 cadence up to 15 goals so
-- high-scoring teams in WC2026 are no longer capped.

-- First migration (extend_goal_thresholds) was a no-op — it targeted step-6
-- rows which don't exist. This one correctly targets step-4 rows stopping at 90.

UPDATE public.league_engine_config
SET goal_thresholds = '[
  {"min": 0,   "goals": 0},
  {"min": 62,  "goals": 1},
  {"min": 66,  "goals": 2},
  {"min": 70,  "goals": 3},
  {"min": 74,  "goals": 4},
  {"min": 78,  "goals": 5},
  {"min": 82,  "goals": 6},
  {"min": 86,  "goals": 7},
  {"min": 90,  "goals": 8},
  {"min": 94,  "goals": 9},
  {"min": 98,  "goals": 10},
  {"min": 102, "goals": 11},
  {"min": 106, "goals": 12},
  {"min": 110, "goals": 13},
  {"min": 114, "goals": 14},
  {"min": 118, "goals": 15}
]'::jsonb
WHERE goal_thresholds @> '[{"min": 90, "goals": 8}]'::jsonb
  AND NOT goal_thresholds @> '[{"min": 94}]'::jsonb;
