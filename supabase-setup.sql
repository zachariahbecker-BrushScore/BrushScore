-- BrushScore — Supabase setup
--
-- Safe to re-run on an existing project: every statement is guarded, and
-- nothing here touches or deletes data you already have.
--
-- Sections:
--   1. The key/value table the app reads and writes
--   2. Tamper-proof version history + how to restore
--   3. Access policies (read/write rules)
--   4. Optional: lock the show down once judging is finished

-- =====================================================================
-- 1. The table
-- =====================================================================

create table if not exists brushscore_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 2. Version history — the safety net
-- =====================================================================
--
-- The app keeps the whole show in three rows (config, entries, groups), so
-- every save replaces a whole row. That makes a mistake — or a malicious
-- wipe — a single UPDATE away.
--
-- This records the PREVIOUS value every time a row changes. Nothing is ever
-- really lost: the worst case becomes "restore the version from before it
-- happened," which is one statement.

create table if not exists brushscore_kv_history (
  id bigserial primary key,
  key text not null,
  value jsonb not null,
  saved_at timestamptz not null default now()
);

create index if not exists brushscore_kv_history_key_time
  on brushscore_kv_history (key, saved_at desc);

-- SECURITY DEFINER lets the trigger write history even though the public
-- role has no INSERT policy on that table — which is the point: the app can
-- never write or erase its own audit trail.
create or replace function brushscore_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into brushscore_kv_history (key, value) values (old.key, old.value);
  return new;
end;
$$;

drop trigger if exists brushscore_kv_snapshot on brushscore_kv;
create trigger brushscore_kv_snapshot
  before update on brushscore_kv
  for each row execute function brushscore_snapshot();

-- ---------------------------------------------------------------------
-- HOW TO RESTORE  (run these by hand in the SQL editor if something goes wrong)
-- ---------------------------------------------------------------------
--
-- Step 1 — look at recent versions of the entry list, newest first.
-- `entries` tells you how many registrations each version held, so a wipe
-- shows up immediately as a sudden drop to 0.
--
--   select id, saved_at,
--          case when jsonb_typeof(value) = 'array'
--               then jsonb_array_length(value) end as entries
--   from brushscore_kv_history
--   where key = 'brushscore:entries'
--   order by saved_at desc
--   limit 25;
--
-- Step 2 — restore the version you want, using its id from step 1.
-- (Restoring is itself an UPDATE, so it gets snapshotted too — you can
-- always undo the undo.)
--
--   update brushscore_kv
--   set value = (select value from brushscore_kv_history where id = 12345),
--       updated_at = now()
--   where key = 'brushscore:entries';
--
-- Then refresh the app. The same works for 'brushscore:config' and
-- 'brushscore:groups'.

-- =====================================================================
-- 3. Access policies
-- =====================================================================

alter table brushscore_kv enable row level security;
alter table brushscore_kv_history enable row level security;

drop policy if exists "public read" on brushscore_kv;
drop policy if exists "public insert" on brushscore_kv;
drop policy if exists "public update" on brushscore_kv;

-- Anyone with the link can read. That is the design: registrants, desk
-- staff and judges all share one link and there are no accounts.
create policy "public read" on brushscore_kv
  for select using (true);

-- Writes are limited to the three keys the app actually uses. This does not
-- stop a determined person editing a real key, but it does stop the table
-- being filled with junk rows, which is the cheap drive-by attack.
create policy "public insert" on brushscore_kv
  for insert with check (
    key in ('brushscore:config', 'brushscore:entries', 'brushscore:groups')
  );

create policy "public update" on brushscore_kv
  for update using (
    key in ('brushscore:config', 'brushscore:entries', 'brushscore:groups')
  ) with check (
    key in ('brushscore:config', 'brushscore:entries', 'brushscore:groups')
  );

-- Deliberately NO delete policy on brushscore_kv: rows are only ever
-- overwritten, never removed, so nothing can drop a row outright.

-- History is readable but nothing else. No insert policy (only the
-- SECURITY DEFINER trigger writes it), no update policy, no delete policy —
-- so the audit trail cannot be altered or erased through the app's key.
drop policy if exists "history read" on brushscore_kv_history;
create policy "history read" on brushscore_kv_history
  for select using (true);

-- =====================================================================
-- 4. Optional — freeze the show when judging is done
-- =====================================================================
--
-- Once results are published and you no longer need writes, this makes the
-- whole show read-only. Nothing can change it until you re-enable writes.
-- Worth doing between shows, when the app is idle but still online.
--
--   drop policy if exists "public insert" on brushscore_kv;
--   drop policy if exists "public update" on brushscore_kv;
--
-- To open it again, re-run section 3 of this file.
