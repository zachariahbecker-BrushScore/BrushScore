-- BrushScore — undo the write restrictions
--
-- Run this ONLY as a diagnostic. It puts the write policies back to fully
-- permissive, exactly as they were before the hardening.
--
-- Purpose: if saving starts working again after running this, the key
-- allow-list was the cause and we know where to look. If saving still
-- fails, the problem is somewhere else entirely — the anon key, the
-- payload, or the network — and the policies were never involved.
--
-- The version-history table and its trigger are NOT touched by this file.
-- Your safety net stays in place either way.

drop policy if exists "public insert" on brushscore_kv;
drop policy if exists "public update" on brushscore_kv;

create policy "public insert" on brushscore_kv
  for insert with check (true);

create policy "public update" on brushscore_kv
  for update using (true) with check (true);

-- Confirm what is now in force. You should see three policies on
-- brushscore_kv (public read / public insert / public update) and one on
-- brushscore_kv_history (history read).
select tablename, policyname, cmd
from pg_policies
where tablename in ('brushscore_kv', 'brushscore_kv_history')
order by tablename, policyname;
