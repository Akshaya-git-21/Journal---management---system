-- ==========================================
-- Module 114: Journal settings
--
-- A single row ('main') holding the Coordinator-managed journal configuration
-- (workflow rules, journal profile, access rules) as JSON. Everyone signed in
-- can read it (the app applies these values); only an active Coordinator can
-- change it.
--
-- Safe to re-run.
-- ==========================================

create table if not exists public.journal_settings (
  id text primary key default 'main' check (id = 'main'),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.journal_settings enable row level security;

drop policy if exists "journal_settings_select" on public.journal_settings;
create policy "journal_settings_select" on public.journal_settings
  for select to authenticated using (true);

drop policy if exists "journal_settings_insert_coordinator" on public.journal_settings;
create policy "journal_settings_insert_coordinator" on public.journal_settings
  for insert to authenticated with check (public.is_active_coordinator());

drop policy if exists "journal_settings_update_coordinator" on public.journal_settings;
create policy "journal_settings_update_coordinator" on public.journal_settings
  for update to authenticated using (public.is_active_coordinator()) with check (public.is_active_coordinator());

grant select, insert, update on public.journal_settings to authenticated;

insert into public.journal_settings (id) values ('main') on conflict (id) do nothing;

notify pgrst, 'reload schema';
