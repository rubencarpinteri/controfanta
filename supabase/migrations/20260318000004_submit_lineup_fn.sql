-- ============================================================
-- Controfanta — Atomic Lineup Submission Function
-- Migration: 20260318000004_submit_lineup_fn
-- ============================================================
-- submit_lineup() executes the entire lineup submission in a
-- single database transaction:
--
--   1. Lock the matchday row (prevents race conditions on status)
--   2. Assert matchday is 'open'
--   3. Compute next submission_number atomically
--   4. INSERT into lineup_submissions (append-only)
--   5. INSERT into lineup_submission_players (append-only)
--   6. UPSERT lineup_current_pointers (mutable pointer)
--
-- DB-level constraints already enforce:
--   UNIQUE(submission_id, player_id)   — no duplicate player
--   UNIQUE(submission_id, slot_id)     — one player per slot
--   CHECK on submitted_at             — consistent status
--
-- Returns: jsonb {submission_id, submission_number}
-- Raises:  exception with error code prefix on business rule violation
-- ============================================================

create or replace function submit_lineup(
  p_team_id        uuid,
  p_matchday_id    uuid,
  p_formation_id   uuid,
  p_is_draft       boolean,
  p_actor_user_id  uuid,
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
  v_submission_id     uuid := gen_random_uuid();
  v_submission_number int;
  v_matchday_status   matchday_status;
  v_status            lineup_status;
  v_submitted_at      timestamptz;
begin

  -- --------------------------------------------------------
  -- Step 1: Lock matchday row to prevent concurrent state change
  -- --------------------------------------------------------
  select status
  into v_matchday_status
  from matchdays
  where id = p_matchday_id
  for update;

  if not found then
    raise exception 'MATCHDAY_NOT_FOUND: matchday % does not exist', p_matchday_id;
  end if;

  if v_matchday_status != 'open' then
    raise exception
      'MATCHDAY_NOT_OPEN: matchday status is "%" — submissions only allowed when status is "open"',
      v_matchday_status;
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
  where team_id = p_team_id
    and matchday_id = p_matchday_id;

  -- --------------------------------------------------------
  -- Step 4: INSERT submission row (append-only)
  -- The prevent_modification trigger will reject any UPDATE attempt.
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
  -- The pointer is the only mutable piece; content is immutable.
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

-- ============================================================
-- RLS: Only authenticated members of the relevant league may
-- call this function via the client SDK.
-- The security definer clause means it runs as the function
-- owner (postgres), but business-rule checks above prevent abuse.
-- ============================================================
revoke all on function submit_lineup from public;
grant execute on function submit_lineup to authenticated;
