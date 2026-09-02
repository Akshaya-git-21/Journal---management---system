-- ==========================================
-- Module 49: GD Member (Production Member) role.
--
-- Adds a new account role for internal production/copyediting staff,
-- created directly by the Coordinator the same way Editor/Reviewer/
-- Publisher accounts already are (see api/create-user.ts + lib/auth.ts).
-- Deliberately NOT the Publisher role (Publisher is an external, per-
-- manuscript-assigned party -- see 0011_publisher_and_reasons.sql) and
-- deliberately NOT granted any Coordinator privilege: is_active_coordinator()
-- below is untouched, so a GD Member never passes it and gets none of the
-- Coordinator-only RLS policies or RPCs (approve_user_role,
-- start_production, etc.).
--
-- Depends on: 0001_profiles_rbac.sql (profiles role/requested_role check
-- constraints, handle_new_user()). Safe to re-run.
-- ==========================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER'));

alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles add constraint profiles_requested_role_check
  check (requested_role in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_role text := coalesce(new.raw_user_meta_data->>'requested_role', 'AUTHOR');
begin
  if req_role not in ('AUTHOR','EDITOR','REVIEWER','PUBLISHER','COORDINATOR','GD_MEMBER') then
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

-- Mirrors is_active_coordinator() -- not used by any policy yet (the GD
-- Member workspace is currently self-contained, no shared-table reads), but
-- kept here so a future production-module RLS grant for GD Member has a
-- single, consistent helper to check against instead of inlining the role
-- string everywhere.
create or replace function public.is_active_gd_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'GD_MEMBER' and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_gd_member() from public;
grant execute on function public.is_active_gd_member() to authenticated;
