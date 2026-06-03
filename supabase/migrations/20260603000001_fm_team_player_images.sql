-- Add official image URLs sourced from SportMonks so the FantaMondiale UI
-- can render real team crests, country flags, and player photos instead of
-- flag emojis (which render inconsistently across platforms, e.g. Scotland).
--
-- All columns are nullable: existing rows stay valid, and the seed script
-- (scripts/seed-fm-from-sportmonks.ts) backfills them from SportMonks.
-- flag_emoji is intentionally kept for backward-compatibility / fallback.

ALTER TABLE public.fm_national_team
  ADD COLUMN IF NOT EXISTS logo_url TEXT,  -- SportMonks team crest (team.image_path)
  ADD COLUMN IF NOT EXISTS flag_url TEXT;  -- Country flag image (country.image_path)

ALTER TABLE public.fm_player
  ADD COLUMN IF NOT EXISTS photo_url TEXT; -- SportMonks player headshot (player.image_path)
