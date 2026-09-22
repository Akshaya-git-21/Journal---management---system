-- ==========================================
-- Module 119: Admin can edit role-level default permissions (Phase 3 follow-up)
--
-- 0118 only let an Admin override one person at a time. This adds the other
-- half of the hierarchy described in the spec (Role default permissions ->
-- Individual user overrides): an Admin can now change what a whole role gets
-- by default from the Access page, and drop down to a single person's
-- overrides only when needed.
--
-- Depends on: 0118 (role_module_permissions, is_active_admin, activity_log).
-- Safe to re-run.
-- ==========================================

create or replace function public.admin_set_role_permission(p_role text, p_module text, p_action text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Only an active Admin can change permissions';
  end if;
  if p_action not in ('VIEW','CREATE','EDIT','DELETE','EXPORT') then
    raise exception 'Invalid action: %', p_action;
  end if;
  if p_role = 'ADMIN' then
    raise exception 'Admin accounts always have full access and cannot be restricted';
  end if;
  if not exists (select 1 from public.role_module_permissions where role = p_role and module_key = p_module and action = p_action) then
    raise exception 'This module/action does not exist for this role';
  end if;

  update public.role_module_permissions
  set allowed = p_allowed
  where role = p_role and module_key = p_module and action = p_action;

  perform public._log_activity('access_control', 'role_permission_set', null, null,
    jsonb_build_object('role', p_role, 'module', p_module, 'action', p_action, 'allowed', p_allowed));
end;
$$;

revoke all on function public.admin_set_role_permission(text, text, text, boolean) from public;
grant execute on function public.admin_set_role_permission(text, text, text, boolean) to authenticated;

-- Live updates: so the Access page's role-defaults grid refreshes for every
-- open Admin session without a reload.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'role_module_permissions'
  ) then
    alter publication supabase_realtime add table public.role_module_permissions;
  end if;
end $$;

notify pgrst, 'reload schema';
