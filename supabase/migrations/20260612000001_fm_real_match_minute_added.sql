-- Stoppage / added minutes for the live clock display (e.g. 90+4).
-- `minute` holds the period-base minute (45/90/105/120) when in stoppage,
-- otherwise the running minute; `minute_added` holds the stoppage overflow.
alter table fm_real_match
  add column if not exists minute_added integer null;
