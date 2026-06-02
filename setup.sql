-- ============================================================
-- Mifuyu Health OS — Supabase setup
-- Paste this whole file into the Supabase SQL editor once and run it.
-- ============================================================

-- One table holds everything. One row per day.
-- The "notes" jsonb column carries that day's tracked data
-- (notes.pcos, notes.mounjaro, notes.mind, etc.).
-- A single sentinel row with date = '2000-01-01' holds all the
-- non-resetting config/data (medsList, injectionLog, weightLog,
-- doseHistory, joyJar, cycle, nsv, measurements, helps, appConfig).

create table if not exists public.daily_logs (
  user_id text not null,
  date    text not null,           -- 'YYYY-MM-DD' (or '2000-01-01' sentinel)
  notes   jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

-- Keep updated_at fresh on upsert
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch on public.daily_logs;
create trigger trg_touch before insert or update on public.daily_logs
for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- This is a single-user, private app. The simplest setup leaves
-- browser policies open (anon + authenticated, using(true)).
--
-- *** PRIVACY UPGRADE PATH ***
-- When you're ready to lock this down so only YOU can read/write,
-- turn on Supabase Auth and replace the open policies below with
-- ones scoped to your auth.uid(), e.g.:
--   using ( auth.uid() is not null )
-- and store your auth user id instead of the text 'mifuyu'.
-- ------------------------------------------------------------

alter table public.daily_logs enable row level security;

drop policy if exists "open_select" on public.daily_logs;
drop policy if exists "open_insert" on public.daily_logs;
drop policy if exists "open_update" on public.daily_logs;
drop policy if exists "open_delete" on public.daily_logs;

create policy "open_select" on public.daily_logs for select
  to anon, authenticated using (true);
create policy "open_insert" on public.daily_logs for insert
  to anon, authenticated with check (true);
create policy "open_update" on public.daily_logs for update
  to anon, authenticated using (true) with check (true);
create policy "open_delete" on public.daily_logs for delete
  to anon, authenticated using (true);

-- Done! Now paste your project URL + publishable key (sb_publishable_...)
-- into the CONFIG block at the top of index.html and reload.
