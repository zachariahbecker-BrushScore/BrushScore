-- BrushScore — allow writes to the special-awards ballot
--
-- WHAT THIS FIXES
--
-- The write policies on brushscore_kv were written when the app kept a show
-- in three rows. The special-awards ballot added a fourth, brushscore:votes,
-- and the allow-list was never widened to match. Every ballot write has
-- therefore been rejected by row-level security since the ballot shipped,
-- which surfaces in the app as:
--
--     Not saved - check your connection and redo that vote.
--
-- Nothing is wrong with the connection, the anon key, or the payload. The
-- database is refusing the key by name.
--
-- Safe to run on a live show. It replaces two policies and touches no data.
-- The version-history table and its trigger are not affected.

-- =====================================================================
-- The four keys the app writes
-- =====================================================================

drop policy if exists "public insert" on brushscore_kv;
drop policy if exists "public update" on brushscore_kv;

create policy "public insert" on brushscore_kv
  for insert with check (
    key in (
      'brushscore:config',
      'brushscore:entries',
      'brushscore:groups',
      'brushscore:votes'
    )
  );

create policy "public update" on brushscore_kv
  for update using (
    key in (
      'brushscore:config',
      'brushscore:entries',
      'brushscore:groups',
      'brushscore:votes'
    )
  ) with check (
    key in (
      'brushscore:config',
      'brushscore:entries',
      'brushscore:groups',
      'brushscore:votes'
    )
  );

-- Still deliberately no delete policy: rows are overwritten, never removed.

-- =====================================================================
-- Confirm
-- =====================================================================
--
-- Expect three policies on brushscore_kv (public read / public insert /
-- public update) and one on brushscore_kv_history (history read).

select tablename, policyname, cmd
from pg_policies
where tablename in ('brushscore_kv', 'brushscore_kv_history')
order by tablename, policyname;

-- Which of the four rows actually exist. A missing brushscore:votes row is
-- expected and normal before this fix: no vote has ever been able to land.
-- It is created by the first successful ballot save.

select key, updated_at, pg_column_size(value) as bytes
from brushscore_kv
order by key;
