-- ==========================================
-- Module 1: Authentication & RBAC
-- Real per-account roles, enforced server-side.
--
-- Design notes:
-- * A profile row is created ONLY by the handle_new_user() trigger on
--   auth.users insert, never by a direct client INSERT. This closes the
--   previous hole where a client could insert profiles.role = 'COORDINATOR'
--   directly (the old RLS policy only checked auth.uid() = id, not the
--   value being written).
-- * AUTHOR accounts activate immediately (matches the workflow's entry
--   point: "Author submits manuscript"). EDITOR / REVIEWER / COORDINATOR /
--   PUBLISHER accounts start PENDING_APPROVAL with role = NULL and grant
--   no access until a Coordinator approves them via approve_user_role().
-- * role/status are never directly UPDATE-able by the row owner (column
--   grants below revoke them for `authenticated`) -- only the
--   SECURITY DEFINER approve_user_role() function can change them, and it
--   re-checks the caller is an ACTIVE COORDINATOR before doing so.
-- * This file is safe to (re)run against a project that already has an
--   older `profiles` table (e.g. from a pre-Module-1 version of this app):
--   `CREATE TABLE IF NOT EXISTS` alone would silently skip adding the new
--   columns to an existing table, so every column is separately patched in
--   with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` below.
-- ==========================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists name text not null default '';
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists requested_role text not null default 'AUTHOR';
alter table public.profiles add column if not exists status text not null default 'PENDING_APPROVAL';
alter table public.profiles add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists approved_by uuid references auth.users(id);
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- `role` must be nullable: an account has no role at all until an
-- AUTHOR auto-activates or a Coordinator approves it. If this column
-- pre-existed (e.g. from before this migration) with a NOT NULL
-- constraint, drop it -- ALTER ... DROP NOT NULL is a safe no-op if the
-- column is already nullable.
alter table public.profiles alter column role drop not null;

-- Backfill rows that existed under an older schema (which had `role` but no
-- `requested_role`) so they carry a sensible requested_role instead of the
-- column default.
update public.profiles set requested_role = role where role is not null and requested_role = 'AUTHOR';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR'));

alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles add constraint profiles_requested_role_check
  check (requested_role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('ACTIVE','PENDING_APPROVAL','REJECTED'));

alter table public.profiles enable row level security;

-- A policy on `profiles` cannot query `profiles` directly in its USING
-- clause -- Postgres re-evaluates that same policy for the inner query,
-- which re-evaluates it again, forever ("infinite recursion detected in
-- policy"). The fix is this SECURITY DEFINER helper: it runs as the
-- function owner (the postgres role, which bypasses RLS), so the lookup
-- inside it never re-triggers the policy that calls it.
create or replace function public.is_active_coordinator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'COORDINATOR' and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_coordinator() from public;
grant execute on function public.is_active_coordinator() to authenticated;

-- Only the trigger (SECURITY DEFINER) creates rows; no direct client INSERT policy.
-- Row owners may SELECT their own profile; active Coordinators may SELECT every profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_select_coordinator" on public.profiles;
create policy "profiles_select_coordinator" on public.profiles
  for select using (public.is_active_coordinator());

-- Row owners may update their own row (name/metadata only -- see column grants below).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Lock down column-level write access: role/status/requested_role/approved_*
-- are only ever changed by the SECURITY DEFINER function below, which runs
-- as the function owner and therefore bypasses these grants.
revoke update on public.profiles from authenticated;
grant update (name, metadata) on public.profiles to authenticated;

-- ------------------------------------------
-- Auto-create the profile row when a new auth.users row appears.
-- Reads role/full_name out of the signup metadata the client supplied.
-- ------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_role text := coalesce(new.raw_user_meta_data->>'requested_role', 'AUTHOR');
begin
  if req_role not in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR') then
    req_role := 'AUTHOR';
  end if;

  insert into public.profiles (id, email, name, role, requested_role, status, metadata)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when req_role = 'AUTHOR' then 'AUTHOR' else null end,
    req_role,
    case when req_role = 'AUTHOR' then 'ACTIVE' else 'PENDING_APPROVAL' end,
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------
-- Coordinator-only: approve or reject a pending elevated-role account.
-- ------------------------------------------
create or replace function public.approve_user_role(target_id uuid, decision text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_status text;
  updated public.profiles;
begin
  if decision not in ('APPROVE','REJECT') then
    raise exception 'Invalid decision: %', decision;
  end if;

  select role, status into caller_role, caller_status
  from public.profiles where id = auth.uid();

  if caller_role is distinct from 'COORDINATOR' or caller_status is distinct from 'ACTIVE' then
    raise exception 'Only an active Coordinator may approve accounts';
  end if;

  update public.profiles
  set
    role = case when decision = 'APPROVE' then requested_role else role end,
    status = case when decision = 'APPROVE' then 'ACTIVE' else 'REJECTED' end,
    approved_by = auth.uid(),
    approved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = target_id and status = 'PENDING_APPROVAL'
  returning * into updated;

  if updated.id is null then
    raise exception 'No pending account found for %', target_id;
  end if;

  return updated;
end;
$$;

revoke all on function public.approve_user_role(uuid, text) from public;
grant execute on function public.approve_user_role(uuid, text) to authenticated;
