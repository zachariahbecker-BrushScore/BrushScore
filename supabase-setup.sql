-- Run this once in your Supabase project's SQL editor (Database > SQL Editor).
-- It creates the single key/value table BrushScore uses for the show config
-- and the entries list.

create table if not exists brushscore_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security is on by default for new tables in Supabase.
-- These policies keep this a no-login shared tool (matching the original
-- Claude artifact's model): anyone with your site's link can read and write.
-- If you later add real accounts, tighten these policies to check auth.uid().
alter table brushscore_kv enable row level security;

create policy "public read" on brushscore_kv
  for select using (true);

create policy "public insert" on brushscore_kv
  for insert with check (true);

create policy "public update" on brushscore_kv
  for update using (true);
