-- Track who generated the current Lega invite code so the join screen can
-- tell a new manager who invited them.

alter table leagues
  add column if not exists invite_token_created_by uuid references profiles(id) on delete set null;

comment on column leagues.invite_token_created_by is
  'Profile that generated the current reusable invite token/code.';
