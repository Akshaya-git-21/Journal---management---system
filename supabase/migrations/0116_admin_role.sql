-- ==========================================
-- Module 116: Admin role (Phase 1)
--
-- Adds the ADMIN account role, the Admin's read access to every profile, an
-- append-only admin_activity_log, and stops Coordinators from approving Admin
-- sign-up requests. Nothing about how the other roles work is changed.
--
-- Depends on: 0001 (profiles, handle_new_user, approve_user_role), 0049
-- (GD_MEMBER in the role checks). Safe to re-run.
-- ==========================================

-- 1. ADMIN is an allowed role / requested role -----------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER','ADMIN'));

alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles add constraint profiles_requested_role_check
  check (requested_role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER','ADMIN'));

-- 2. Sign-up trigger: accept ADMIN as a requested role. Same behaviour as
--    before for every other role (Authors active at once, everyone else
--    pending approval). An Admin request stays PENDING_APPROVAL until an
--    existing Admin approves it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_role text := coalesce(new.raw_user_meta_data->>'requested_role', 'AUTHOR');
begin
  if req_role not in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER','ADMIN') then
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

-- 3. is_active_admin() + Admin can read every profile ---------------------
create or replace function public.is_active_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated;

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_active_admin());

-- 4. Coordinators cannot approve an Admin request (only an Admin can, through
--    the Admin console). Identical to the 0001 function otherwise.
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

  if exists (select 1 from public.profiles where id = target_id and requested_role = 'ADMIN') then
    raise exception 'Admin accounts can only be approved by an Admin';
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

-- 5. Admin activity log: append-only, written only by the server (service
--    role); Admins can read it. Never holds passwords. No foreign keys on
--    purpose, so entries survive the deletion of the people they mention.
create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  action text not null,
  target_id uuid,
  target_name text,
  target_email text,
  target_role text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_admin_activity_log_created on public.admin_activity_log (created_at desc);

alter table public.admin_activity_log enable row level security;

drop policy if exists "admin_activity_log_select_admin" on public.admin_activity_log;
create policy "admin_activity_log_select_admin" on public.admin_activity_log
  for select using (public.is_active_admin());

revoke all on table public.admin_activity_log from anon, authenticated;
grant select on table public.admin_activity_log to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------
-- FIRST ADMIN (run once, by hand):
-- 1. On the login screen choose Register, pick "Admin" and sign up. The request
--    waits as PENDING_APPROVAL.
-- 2. In the SQL Editor run (with your email):
--      update public.profiles
--      set role = 'ADMIN', status = 'ACTIVE'
--      where email = 'you@example.com' and requested_role = 'ADMIN';
-- After that, every other Admin request is approved from the Admin console.
-- ------------------------------------------
