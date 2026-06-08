-- Atomic, RLS-safe enrollment of a Lega into a global FM tournament.
--
-- Why: optLegaIntoFMCompetitionAction built a globally-unique slug by querying
-- existing slugs client-side, but that SELECT is RLS-filtered (a league admin
-- only sees their own league's rows). So it couldn't see slugs owned by other
-- leagues, regenerated a colliding slug, and the INSERT hit the unique
-- constraint — a 500 that surfaced to users as "the button does nothing".
--
-- This SECURITY DEFINER function generates the slug seeing ALL rows and inserts
-- atomically. Idempotent: returns the existing instance id if already enrolled.

create or replace function opt_lega_into_fm(
  p_league_id uuid,
  p_fm_competition_id uuid,
  p_base_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_status text;
  v_existing_id uuid;
  v_slug text;
  n int := 2;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select (is_super_admin() or exists (
            select 1 from league_users lu
             where lu.league_id = p_league_id
               and lu.user_id = v_uid
               and lu.role = 'league_admin'))
    into v_is_admin;
  if not v_is_admin then raise exception 'not a league admin'; end if;

  select status::text into v_status from fm_competition where id = p_fm_competition_id;
  if v_status is null then raise exception 'competition not found'; end if;
  if v_status in ('completed','archived') then raise exception 'enrollment closed'; end if;

  select id into v_existing_id from fm_league_competition
   where league_id = p_league_id and fm_competition_id = p_fm_competition_id;
  if v_existing_id is not null then return v_existing_id; end if;

  v_slug := p_base_slug;
  while exists (select 1 from fm_league_competition where slug = v_slug) loop
    v_slug := p_base_slug || '-' || n;
    n := n + 1;
  end loop;

  insert into fm_league_competition (league_id, fm_competition_id, slug, created_by)
    values (p_league_id, p_fm_competition_id, v_slug, v_uid)
    returning id into v_existing_id;

  return v_existing_id;
end;
$$;

revoke execute on function opt_lega_into_fm(uuid, uuid, text) from public, anon;
grant execute on function opt_lega_into_fm(uuid, uuid, text) to authenticated;
