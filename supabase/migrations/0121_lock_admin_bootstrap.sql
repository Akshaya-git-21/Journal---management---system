-- ==========================================
-- Module 121: Lock the Admin self-registration bootstrap
--
-- 0116 let anyone self-register with requested_role = 'ADMIN' (creating a
-- PENDING_APPROVAL admin application) -- intentional at the time, since that
-- was the only way to seed the very first Admin. The public Sign Up screen no
-- longer offers "Admin" as an option, but that's a UI-only restriction; a
-- direct call to Supabase Auth's signUp() could still request it.
--
-- Once at least one ACTIVE Admin exists, that bootstrap path is no longer
-- needed and shouldn't stay open: a self-requested ADMIN role now silently
-- falls back to AUTHOR (the same fallback already used for a genuinely
-- invalid role string), exactly like every other internal role
-- (COORDINATOR/PUBLISHER/GD_MEMBER already required Coordinator approval and
-- are unaffected here). This does not touch how an existing Admin creates
-- another Admin from People -- that path (src/lib/adminUsersHandler.ts,
-- action "create") writes role/status directly with the service role after
-- this trigger runs, so it is unaffected either way.
--
-- Depends on: 0116 (handle_new_user, is_active_admin). Safe to re-run.
-- ==========================================

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

  if req_role = 'ADMIN' and public.is_active_admin_bootstrap_complete() then
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

-- security definer, not is_active_admin() itself, so it can run before the
-- new row exists and without exposing who the admins are to the caller.
create or replace function public.is_active_admin_bootstrap_complete()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'ADMIN' and status = 'ACTIVE');
$$;

revoke all on function public.is_active_admin_bootstrap_complete() from public, anon, authenticated;

notify pgrst, 'reload schema';
