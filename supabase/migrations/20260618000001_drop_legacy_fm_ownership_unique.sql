-- Drop the pre-multi-Lega unique constraint on fm_round_player_ownership.
--
-- Ownership is computed PER-LEGA: the same player can be owned in two different
-- Leghe within the same scoring round (the trademark per-lega popularity penalty).
-- The legacy UNIQUE (scoring_round_id, player_id) made that impossible and caused
-- runRoundEngine to 500 on the second Lega's ownership upsert
-- ("duplicate key value violates unique constraint
--  fm_round_player_ownership_scoring_round_id_player_id_key").
--
-- The correct constraint UNIQUE (league_competition_id, scoring_round_id, player_id)
-- already exists (fm_round_player_ownership_lega_round_player_unique) and is the
-- engine's onConflict target.
ALTER TABLE public.fm_round_player_ownership
  DROP CONSTRAINT IF EXISTS fm_round_player_ownership_scoring_round_id_player_id_key;
