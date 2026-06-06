-- ============================================================
-- FM live round snapshot
-- ============================================================
-- One precomputed live-board row per (lega, round). Written by the
-- SportMonks ratings-tick cron (service role) every minute while a round
-- has a kicked-off match; read by the Live page. Keeping it precomputed
-- means the page never computes ownership/scores on the request path, and
-- cost scales with live leagues, not viewers × leagues × ticks.

create table fm_live_round_snapshot (
  league_competition_id uuid not null
    references fm_league_competition(id) on delete cascade,
  scoring_round_id uuid not null
    references fm_scoring_round(id) on delete cascade,
  snapshot jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (league_competition_id, scoring_round_id)
);

create index fm_live_round_snapshot_round_idx
  on fm_live_round_snapshot(scoring_round_id);

alter table fm_live_round_snapshot enable row level security;

-- Mirror fm_competition_standing: any authenticated user may read (private
-- league app); only super_admin may write via the API. The cron uses the
-- service role, which bypasses RLS.
create policy "fm_live_round_snapshot: auth read"
  on fm_live_round_snapshot for select
  to authenticated
  using (true);

create policy "fm_live_round_snapshot: super_admin write"
  on fm_live_round_snapshot for all
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());
