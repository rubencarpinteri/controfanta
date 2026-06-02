-- ============================================================
-- Controfanta — submit_lineup() with Trust Boundary
-- Migration: 20260318000007_submit_lineup_ownership
-- ============================================================
-- Replaces the Phase-3 version of submit_lineup() with one
-- that performs full ownership and integrity checks INSIDE the
-- RPC itself, so the function is safe to call directly from
-- authenticated clients without relying on server-action guards.
--
-- Security additions vs Migration 004:
--   A. Resolve caller identity via auth.uid() — actor cannot be spoofed
--   B. Verify team ownership: fantasy_teams.manager_id = auth.uid()
--      (league admins bypass this and may act on behalf of any team)
--   C. Verify matchday belongs to the same league as the team
--   D. Verify formation belongs to the same league as the team
--   E. Verify every slot_id in assignments belongs to p_formation_id
--   F. Verify every player_id in assignments is in the team's active
--      roster (team_roster_entries.released_at IS NULL)
-- ============================================================

create or replace function submit_lineup(
  p_team_id        uuid,
  p_matchday_id    uuid,
  p_formation_id   uuid,
  p_is_draft       boolean,
  p_actor_user_id  uuid,   -- kept for API compatibility; overridden by auth.uid() internally
  p_source_ip      text,
  -- JSON array of assignment objects:
  -- [{player_id, slot_id, is_bench, bench_order, assigned_mantra_role}]
  p_assignments    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id         uuid;
  v_team_league_id    uuid;
  v_team_manager_id   uuid;
  v_is_admin          boolean;

  v_submission_id     uuid := gen_random_uuid();
  v_submission_number int;
  v_matchday_status   matchday_status;
  v_status            lineup_status;
  v_submitted_at      timestamptz;

  v_bad_slot_count    int;
  v_bad_player_count  int;
begin

  -- --------------------------------------------------------
  -- Security A: Resolve caller — cannot be spoofed via argument
  -- --------------------------------------------------------
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'AUTH_REQUIRED: caller must be authenticated';
  end if;

  -- Force actor to match the actual caller (prevents audit spoofing)
  p_actor_user_id := v_caller_id;

  -- --------------------------------------------------------
  -- Security B: Verify team ownership
  -- --------------------------------------------------------
  select manager_id, league_id
  into v_team_manager_id, v_team_league_id
  from fantasy_teams
  where id = p_team_id;

  if not found then
    raise exception 'TEAM_NOT_FOUND: team % does not exist', p_team_id;
  end if;

  -- Check if caller is a league admin for this team's league
  select exists (
    select 1 from league_users
    where user_id   = v_caller_id
      and league_id = v_team_league_id
      and role      = 'league_admin'
  ) into v_is_admin;

  -- Non-admin callers must own the team
  if not v_is_admin and v_team_manager_id != v_caller_id then
    raise exception
      'TEAM_NOT_OWNED: caller % does not own team %', v_caller_id, p_team_id;
  end if;

  -- --------------------------------------------------------
  -- Security C: Verify matchday belongs to team's league
  -- (Also locks the row for the duration of the transaction)
  -- --------------------------------------------------------
  select status
  into v_matchday_status
  from matchdays
  where id         = p_matchday_id
    and league_id  = v_team_league_id
  for update;

  if not found then
    raise exception
      'MATCHDAY_NOT_FOUND: matchday % not found in league %', p_matchday_id, v_team_league_id;
  end if;

  if v_matchday_status != 'open' then
    raise exception
      'MATCHDAY_NOT_OPEN: matchday status is "%" — submissions only allowed when status is "open"',
      v_matchday_status;
  end if;

  -- --------------------------------------------------------
  -- Security D: Verify formation belongs to team's league
  -- --------------------------------------------------------
  if not exists (
    select 1 from formations
    where id        = p_formation_id
      and league_id = v_team_league_id
      and is_active = true
  ) then
    raise exception
      'FORMATION_INVALID: formation % not found or not active in league %', p_formation_id, v_team_league_id;
  end if;

  -- --------------------------------------------------------
  -- Security E: Verify all slot_ids in assignments belong to the formation
  -- --------------------------------------------------------
  select count(*)
  into v_bad_slot_count
  from jsonb_array_elements(p_assignments) as a
  where not exists (
    select 1 from formation_slots fs
    where fs.id           = (a->>'slot_id')::uuid
      and fs.formation_id = p_formation_id
  );

  if v_bad_slot_count > 0 then
    raise exception
      'SLOT_MISMATCH: % slot(s) in the payload do not belong to formation %', v_bad_slot_count, p_formation_id;
  end if;

  -- --------------------------------------------------------
  -- Security F: Verify all player_ids are in the team's active roster
  -- --------------------------------------------------------
  select count(*)
  into v_bad_player_count
  from jsonb_array_elements(p_assignments) as a
  where not exists (
    select 1 from team_roster_entries tre
    where tre.player_id = (a->>'player_id')::uuid
      and tre.team_id   = p_team_id
      and tre.released_at is null
  );

  if v_bad_player_count > 0 then
    raise exception
      'ROSTER_MISMATCH: % player(s) in the payload are not in team %''s active roster', v_bad_player_count, p_team_id;
  end if;

  -- --------------------------------------------------------
  -- Step 2: Determine lineup status and submitted_at
  -- --------------------------------------------------------
  if p_is_draft then
    v_status       := 'draft';
    v_submitted_at := null;
  else
    v_status       := 'submitted';
    v_submitted_at := now();
  end if;

  -- --------------------------------------------------------
  -- Step 3: Atomically get next submission_number
  -- The FOR UPDATE on matchdays above serializes concurrent submissions
  -- from the same team on the same matchday.
  -- --------------------------------------------------------
  select coalesce(max(submission_number), 0) + 1
  into v_submission_number
  from lineup_submissions
  where team_id    = p_team_id
    and matchday_id = p_matchday_id;

  -- --------------------------------------------------------
  -- Step 4: INSERT submission row (append-only)
  -- --------------------------------------------------------
  insert into lineup_submissions (
    id,
    team_id,
    matchday_id,
    formation_id,
    status,
    submission_number,
    submitted_at,
    actor_user_id,
    source_ip
  ) values (
    v_submission_id,
    p_team_id,
    p_matchday_id,
    p_formation_id,
    v_status,
    v_submission_number,
    v_submitted_at,
    p_actor_user_id,
    p_source_ip
  );

  -- --------------------------------------------------------
  -- Step 5: INSERT player assignment rows (append-only)
  -- UNIQUE(submission_id, player_id) prevents duplicate players.
  -- UNIQUE(submission_id, slot_id)   prevents double-filling a slot.
  -- --------------------------------------------------------
  insert into lineup_submission_players (
    submission_id,
    player_id,
    slot_id,
    is_bench,
    bench_order,
    assigned_mantra_role
  )
  select
    v_submission_id,
    (a->>'player_id')::uuid,
    (a->>'slot_id')::uuid,
    coalesce((a->>'is_bench')::boolean, false),
    (a->>'bench_order')::int,
    a->>'assigned_mantra_role'
  from jsonb_array_elements(p_assignments) as a;

  -- --------------------------------------------------------
  -- Step 6: UPSERT current pointer (intentionally mutable)
  -- --------------------------------------------------------
  insert into lineup_current_pointers (
    team_id,
    matchday_id,
    submission_id,
    updated_at
  ) values (
    p_team_id,
    p_matchday_id,
    v_submission_id,
    now()
  )
  on conflict (team_id, matchday_id)
  do update set
    submission_id = excluded.submission_id,
    updated_at    = now();

  -- --------------------------------------------------------
  -- Return result
  -- --------------------------------------------------------
  return jsonb_build_object(
    'submission_id',     v_submission_id,
    'submission_number', v_submission_number
  );

exception
  when unique_violation then
    raise exception
      'DUPLICATE_PLAYER_OR_SLOT: each player and each slot may appear at most once per submission';
end;
$$;

-- GRANT unchanged: authenticated users may call the function.
-- Ownership checks are now enforced inside the function via auth.uid().
revoke all on function submit_lineup from public;
grant execute on function submit_lineup to authenticated;
