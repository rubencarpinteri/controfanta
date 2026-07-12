-- Extra-time knockout matches produce cumulative minutes above the old caps
-- (120' + ET stoppage, observed 130+ in ARG-SUI WC quarterfinal). The old
-- caps made every post-finish stat upsert for ET matches fail with a check
-- violation, blocking late stat corrections (Lautaro Martínez's ET goal).
-- Applied to production 2026-07-12 via MCP apply_migration.
alter table fm_player_match_stats drop constraint chk_fm_pms_minutes;
alter table fm_player_match_stats add constraint chk_fm_pms_minutes check (minutes_played >= 0 and minutes_played <= 150);
alter table player_match_stats drop constraint chk_minutes;
alter table player_match_stats add constraint chk_minutes check (minutes_played >= 0 and minutes_played <= 150);
