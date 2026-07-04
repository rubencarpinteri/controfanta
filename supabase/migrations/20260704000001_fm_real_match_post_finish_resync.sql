-- ============================================================
-- Post-finish resync tracking for fm_real_match
-- ============================================================
-- SportMonks sometimes revises per-player stats (e.g. assists) a few
-- minutes AFTER a fixture is marked finished. The live-ratings cron stops
-- polling a fixture once it drops off /livescores/inplay, so a
-- post-finalization correction is otherwise never picked up.
--
-- finished_at: stamped the moment a match's status flips to 'finished'
--   (set by upsertFMPlayerStats). Anchor for the resync window — independent
--   of `updated_at`, which can be touched again later for unrelated reasons.
-- post_finish_resynced_at: stamped once the one-shot post-finish resync has
--   run for this match, so it fires exactly once per match.

alter table fm_real_match
  add column if not exists finished_at timestamptz null;

alter table fm_real_match
  add column if not exists post_finish_resynced_at timestamptz null;

-- Backfill: matches already finished before this migration get finished_at
-- set to updated_at as a best-effort anchor, and are marked already-resynced
-- so we don't try to resync a potentially very old match on the next tick.
update fm_real_match
  set finished_at = updated_at,
      post_finish_resynced_at = updated_at
  where status = 'finished'
    and finished_at is null;
