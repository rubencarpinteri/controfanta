-- Atomic league creation via SECURITY DEFINER, replacing direct INSERTs.
--
-- Why: createLeagueAction inserted into leagues then read the row back
-- (.select().single()). The leagues SELECT policy requires league membership,
-- but the league_users row is only inserted afterwards — so the read-back was
-- denied by RLS, surfacing as "new row violates row-level security policy".
-- A SECURITY DEFINER function creates both rows atomically, sidestepping the
-- chicken-and-egg and preventing orphan leagues with no admin.

create or replace function create_league(p_name text, p_season_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_league_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(trim(p_name)) < 2 then
    raise exception 'invalid name';
  end if;
  if char_length(trim(p_season_name)) < 1 then
    raise exception 'invalid season';
  end if;

  insert into leagues (name, season_name)
    values (trim(p_name), trim(p_season_name))
    returning id into v_league_id;

  insert into league_users (league_id, user_id, role)
    values (v_league_id, v_uid, 'league_admin');

  return v_league_id;
end;
$$;

revoke execute on function create_league(text, text) from public, anon;
grant execute on function create_league(text, text) to authenticated;

-- Remove the direct-insert policies added in the previous migration: creation
-- now goes through the function, and dropping them prevents adminless leagues.
drop policy if exists "leagues: authenticated insert" on leagues;
drop policy if exists "league_users: self insert as admin" on league_users;
