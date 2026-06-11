-- Persist real-match lineup structure on player stats so the live board can
-- show titolari vs panchina, who came on, and who replaced whom.
-- All additive + nullable; safe to apply while a round is live.

alter table public.fm_player_match_stats
  add column if not exists is_starter boolean not null default false,
  add column if not exists subbed_on_minute integer,
  add column if not exists subbed_off_minute integer,
  -- The fm_player who replaced this player when he was subbed off.
  add column if not exists replacement_player_id uuid references public.fm_player(id),
  -- The fm_player this player replaced when he was subbed on.
  add column if not exists replaced_player_id uuid references public.fm_player(id),
  add column if not exists jersey_number integer,
  add column if not exists is_captain boolean not null default false;

comment on column public.fm_player_match_stats.is_starter is
  'Real-match starting XI (SportMonks lineup type_id 11), not fantasy starter.';
comment on column public.fm_player_match_stats.replacement_player_id is
  'fm_player who came on for this player (set on the player subbed off).';
comment on column public.fm_player_match_stats.replaced_player_id is
  'fm_player this player came on for (set on the player subbed on).';
