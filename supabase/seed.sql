-- ============================================================
-- Controfanta — Seed Data
-- ============================================================
-- Provides a realistic demo league with players, formations,
-- and role classification rules.
--
-- USAGE (local dev):
--   supabase db seed  (uses this file automatically)
-- OR:
--   psql <connection_string> < supabase/seed.sql
--
-- IMPORTANT: Supabase auth users cannot be created via raw SQL
-- in production. Use the Supabase dashboard or the service role
-- client to create auth users, then run this seed for data.
--
-- For local dev with `supabase start`, auth.users rows can be
-- inserted directly here.
-- ============================================================

-- Fixed UUIDs for reproducibility
do $$
declare
  league_id     uuid := 'a1000000-0000-0000-0000-000000000001';
  admin_id      uuid := 'b1000000-0000-0000-0000-000000000001';
  manager1_id   uuid := 'b1000000-0000-0000-0000-000000000002';
  manager2_id   uuid := 'b1000000-0000-0000-0000-000000000003';
  manager3_id   uuid := 'b1000000-0000-0000-0000-000000000004';
  team1_id      uuid := 'c1000000-0000-0000-0000-000000000001';
  team2_id      uuid := 'c1000000-0000-0000-0000-000000000002';
  team3_id      uuid := 'c1000000-0000-0000-0000-000000000003';
  f433_id       uuid := 'd1000000-0000-0000-0000-000000000001';
  f352_id       uuid := 'd1000000-0000-0000-0000-000000000002';

begin

-- ============================================================
-- AUTH USERS (local dev only)
-- In production: create via Supabase dashboard or Auth API
-- ============================================================

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role
) values
  (admin_id,    'admin@fantacalcio.local',    crypt('password123', gen_salt('bf')), now(), '{"username":"admin","full_name":"Admin Lega"}',    now(), now(), 'authenticated', 'authenticated'),
  (manager1_id, 'ruben@fantacalcio.local',    crypt('password123', gen_salt('bf')), now(), '{"username":"ruben","full_name":"Ruben C."}',       now(), now(), 'authenticated', 'authenticated'),
  (manager2_id, 'marco@fantacalcio.local',    crypt('password123', gen_salt('bf')), now(), '{"username":"marco","full_name":"Marco B."}',       now(), now(), 'authenticated', 'authenticated'),
  (manager3_id, 'luca@fantacalcio.local',     crypt('password123', gen_salt('bf')), now(), '{"username":"luca","full_name":"Luca T."}',         now(), now(), 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- ============================================================
-- PROFILES (auto-created by trigger, but explicit here for seed)
-- ============================================================

insert into profiles (id, username, full_name, is_super_admin) values
  (admin_id,    'admin',  'Admin Lega', true),
  (manager1_id, 'ruben',  'Ruben C.',   false),
  (manager2_id, 'marco',  'Marco B.',   false),
  (manager3_id, 'luca',   'Luca T.',    false)
on conflict (id) do nothing;

-- ============================================================
-- LEAGUE
-- ============================================================

insert into leagues (id, name, season_name, timezone, scoring_mode, display_rounding, lock_behavior, advanced_bonuses_enabled, bench_size)
values (
  league_id,
  'Controfanta 2025/26',
  '2025/26',
  'Europe/Rome',
  'head_to_head',
  'one_decimal',
  'auto',
  false,
  7
)
on conflict (id) do nothing;

-- ============================================================
-- LEAGUE USERS
-- ============================================================

insert into league_users (league_id, user_id, role) values
  (league_id, admin_id,    'league_admin'),
  (league_id, manager1_id, 'manager'),
  (league_id, manager2_id, 'manager'),
  (league_id, manager3_id, 'manager')
on conflict (league_id, user_id) do nothing;

-- ============================================================
-- ROLE CLASSIFICATION RULES
-- E → DEF is the default for this league
-- ============================================================

insert into role_classification_rules (league_id, mantra_role, default_rating_class, updated_by)
values (league_id, 'E', 'DEF', admin_id)
on conflict (league_id, mantra_role) do update set default_rating_class = excluded.default_rating_class;

-- ============================================================
-- FANTASY TEAMS
-- ============================================================

insert into fantasy_teams (id, league_id, manager_id, name) values
  (team1_id, league_id, manager1_id, 'FC Statistico'),
  (team2_id, league_id, manager2_id, 'Matematica FC'),
  (team3_id, league_id, manager3_id, 'Algoritmo United')
on conflict (id) do nothing;

-- ============================================================
-- FORMATIONS
-- These are EXAMPLES. No official Mantra logic is hardcoded.
-- The admin fully controls slot definitions.
-- ============================================================

insert into formations (id, league_id, name, description, is_active) values
  (f433_id, league_id, '4-3-3 Mantra', 'Quattro difensori, tre centrocampisti, tre attaccanti', true),
  (f352_id, league_id, '3-5-2 Mantra', 'Tre difensori centrali, cinque di centrocampo, due punte', true)
on conflict (id) do nothing;

-- 4-3-3 slots (starters)
insert into formation_slots (formation_id, slot_name, slot_order, allowed_mantra_roles, is_bench, bench_order) values
  (f433_id, 'GK',  1, ARRAY['Por'],             false, null),
  (f433_id, 'DC1', 2, ARRAY['Dc'],              false, null),
  (f433_id, 'DC2', 3, ARRAY['Dc'],              false, null),
  (f433_id, 'DD',  4, ARRAY['Dd', 'E'],         false, null),
  (f433_id, 'DS',  5, ARRAY['Ds', 'E'],         false, null),
  (f433_id, 'M1',  6, ARRAY['M', 'C', 'E'],     false, null),
  (f433_id, 'M2',  7, ARRAY['M', 'C', 'E'],     false, null),
  (f433_id, 'M3',  8, ARRAY['M', 'C'],          false, null),
  (f433_id, 'W1',  9, ARRAY['W', 'T', 'A'],     false, null),
  (f433_id, 'W2', 10, ARRAY['W', 'T', 'A'],     false, null),
  (f433_id, 'CF', 11, ARRAY['A', 'Pc', 'T'],    false, null),
  -- Bench (permissive: all roles accepted)
  (f433_id, 'B1', 12, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 1),
  (f433_id, 'B2', 13, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 2),
  (f433_id, 'B3', 14, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 3),
  (f433_id, 'B4', 15, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 4),
  (f433_id, 'B5', 16, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 5),
  (f433_id, 'B6', 17, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 6),
  (f433_id, 'B7', 18, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 7)
on conflict (formation_id, slot_name) do nothing;

-- 3-5-2 slots (starters)
insert into formation_slots (formation_id, slot_name, slot_order, allowed_mantra_roles, is_bench, bench_order) values
  (f352_id, 'GK',  1, ARRAY['Por'],             false, null),
  (f352_id, 'DC1', 2, ARRAY['Dc'],              false, null),
  (f352_id, 'DC2', 3, ARRAY['Dc'],              false, null),
  (f352_id, 'DC3', 4, ARRAY['Dc'],              false, null),
  (f352_id, 'DD',  5, ARRAY['Dd', 'E'],         false, null),
  (f352_id, 'DS',  6, ARRAY['Ds', 'E'],         false, null),
  (f352_id, 'M1',  7, ARRAY['M', 'C'],          false, null),
  (f352_id, 'M2',  8, ARRAY['M', 'C'],          false, null),
  (f352_id, 'M3',  9, ARRAY['M', 'C', 'E'],     false, null),
  (f352_id, 'A1', 10, ARRAY['A', 'Pc', 'T'],    false, null),
  (f352_id, 'A2', 11, ARRAY['A', 'Pc', 'T'],    false, null),
  -- Bench
  (f352_id, 'B1', 12, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 1),
  (f352_id, 'B2', 13, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 2),
  (f352_id, 'B3', 14, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 3),
  (f352_id, 'B4', 15, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 4),
  (f352_id, 'B5', 16, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 5),
  (f352_id, 'B6', 17, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 6),
  (f352_id, 'B7', 18, ARRAY['Por', 'Dc', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc'], true, 7)
on conflict (formation_id, slot_name) do nothing;

-- ============================================================
-- SAMPLE PLAYERS (league-scoped, not a global database)
-- Includes examples of the ambiguous 'E' role (classified as DEF
-- per the league's role_classification_rules above).
-- ============================================================

insert into league_players (league_id, full_name, club, mantra_roles, primary_mantra_role, rating_class, is_active) values
  -- Goalkeepers
  (league_id, 'Mike Maignan',       'Milan',    ARRAY['Por'],        'Por', 'GK',  true),
  (league_id, 'André Onana',        'Inter',    ARRAY['Por'],        'Por', 'GK',  true),
  (league_id, 'Ivan Provedel',      'Lazio',    ARRAY['Por'],        'Por', 'GK',  true),

  -- Defenders - Dc
  (league_id, 'Alessandro Bastoni', 'Inter',    ARRAY['Dc'],         'Dc',  'DEF', true),
  (league_id, 'Francesco Acerbi',   'Inter',    ARRAY['Dc'],         'Dc',  'DEF', true),
  (league_id, 'Matteo Gabbia',      'Milan',    ARRAY['Dc'],         'Dc',  'DEF', true),
  (league_id, 'Gleison Bremer',     'Juve',     ARRAY['Dc'],         'Dc',  'DEF', true),
  (league_id, 'Daniele Rugani',     'Juve',     ARRAY['Dc'],         'Dc',  'DEF', true),

  -- Defenders - Dd/Ds
  (league_id, 'Giovanni Di Lorenzo','Napoli',   ARRAY['Dd'],         'Dd',  'DEF', true),
  (league_id, 'Denzel Dumfries',    'Inter',    ARRAY['Dd', 'E'],    'Dd',  'DEF', true),
  (league_id, 'Theo Hernandez',     'Milan',    ARRAY['Ds'],         'Ds',  'DEF', true),

  -- Ambiguous E role — classified as DEF per league rule
  (league_id, 'Federico Dimarco',   'Inter',    ARRAY['Ds', 'E'],    'E',   'DEF', true),
  (league_id, 'Valentino Lazaro',   'Inter',    ARRAY['Dd', 'E'],    'E',   'DEF', true),

  -- Midfielders - M/C
  (league_id, 'Nicolò Barella',     'Inter',    ARRAY['M', 'C'],     'M',   'MID', true),
  (league_id, 'Hakan Calhanoglu',   'Inter',    ARRAY['M', 'C'],     'C',   'MID', true),
  (league_id, 'Henrikh Mkhitaryan', 'Inter',    ARRAY['M', 'C'],     'M',   'MID', true),
  (league_id, 'Tijjani Reijnders',  'Milan',    ARRAY['M', 'C'],     'M',   'MID', true),
  (league_id, 'Adrien Rabiot',      'Milan',    ARRAY['M', 'C'],     'M',   'MID', true),

  -- Midfielders - W (classified as MID)
  (league_id, 'Rafael Leão',        'Milan',    ARRAY['W', 'T'],     'W',   'MID', true),
  (league_id, 'Matteo Politano',    'Napoli',   ARRAY['W'],          'W',   'MID', true),

  -- Attackers - A/Pc/T
  (league_id, 'Lautaro Martinez',   'Inter',    ARRAY['A', 'Pc'],    'A',   'ATT', true),
  (league_id, 'Marcus Thuram',      'Inter',    ARRAY['A', 'T'],     'A',   'ATT', true),
  (league_id, 'Romelu Lukaku',      'Napoli',   ARRAY['A', 'Pc'],    'A',   'ATT', true),
  (league_id, 'Khvicha Kvaratskhelia','Napoli', ARRAY['W', 'A', 'T'],'A',   'ATT', true),
  (league_id, 'Dusan Vlahovic',     'Juve',     ARRAY['A', 'Pc'],    'A',   'ATT', true),
  (league_id, 'Victor Osimhen',     'Napoli',   ARRAY['A', 'Pc'],    'A',   'ATT', true)
on conflict (league_id, full_name, club) do nothing;

-- ============================================================
-- AUDIT LOG: seed import event
-- ============================================================

insert into audit_logs (league_id, actor_user_id, action_type, entity_type, metadata_json)
values (
  league_id,
  admin_id,
  'roster_import',
  'league',
  '{"source": "seed.sql", "note": "Initial demo data"}'::jsonb
);

end $$;
