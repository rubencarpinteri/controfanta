-- Competition-level coach tier: immutable for the whole tournament.
-- Replaces per-phase tiers (fm_phase_coach_tier) as the source of truth
-- consumed by the FM round engine. One row per coach. Frozen at the start
-- of the World Cup; the knockout coach matrix scores favoredness =
-- opponentTier - ownTier against this fixed assignment.
create table if not exists fm_competition_coach_tier (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition(id) on delete cascade,
  coach_id uuid not null references fm_coach(id) on delete cascade,
  tier fm_team_tier not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, coach_id)
);

create index if not exists idx_fm_competition_coach_tier_competition
  on fm_competition_coach_tier (competition_id);
