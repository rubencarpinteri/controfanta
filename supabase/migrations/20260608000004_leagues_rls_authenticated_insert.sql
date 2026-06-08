-- Allow any authenticated user to create a league (self-signup flow).
-- Previously only super_admin could insert, which blocked new self-registered users.
drop policy if exists "leagues: super_admin insert" on leagues;
create policy "leagues: authenticated insert"
  on leagues for insert
  to authenticated
  with check (true);

-- Allow a user to insert themselves as league_admin on league creation.
-- is_league_admin() cannot be used here because the league_users row doesn't exist yet.
create policy "league_users: self insert as admin"
  on league_users for insert
  to authenticated
  with check (user_id = auth.uid() and role = 'league_admin');
