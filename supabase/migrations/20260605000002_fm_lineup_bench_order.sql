-- Ordered bench for FantaMondiale lineups.
--
-- Bench substitution picks the first same-role bench player by this order
-- (module is king, strict role-locked, no cross-role fallback). NULL for
-- starters; 1..N for bench players in priority order.

ALTER TABLE fm_matchday_lineup_player
  ADD COLUMN IF NOT EXISTS bench_order int;

COMMENT ON COLUMN fm_matchday_lineup_player.bench_order IS
  'Ordered bench priority (1..N) for bench players; NULL for starters. Substitution picks the first same-role bench player by this order.';
