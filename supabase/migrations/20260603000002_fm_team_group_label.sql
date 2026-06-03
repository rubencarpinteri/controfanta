-- Official tournament group (e.g. "Group A" .. "Group L" for the World Cup
-- group stage), sourced from SportMonks standings. Drives the "Rose
-- Nazionali" page which lists every squad divided by group. Nullable:
-- knockout-only competitions or teams without a drawn group stay NULL.

ALTER TABLE public.fm_national_team
  ADD COLUMN IF NOT EXISTS group_label TEXT;
