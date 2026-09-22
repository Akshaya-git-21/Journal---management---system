-- ==========================================
-- Module 118: Module-wise access control (Phase 3)
--
-- Adds a granular View/Create/Edit/Delete/Export permission per (role, module)
-- as a set of defaults, plus a per-user override table an Admin can edit from
-- the Access page. Nothing changes for anyone until an Admin edits a specific
-- person's overrides -- the seeded defaults reproduce exactly what each role
-- can already do today. ADMIN is intentionally excluded from both tables:
-- an Admin always has full access (checked first in has_permission()), so it
-- can never lock itself, or the last Admin, out of the app.
--
-- Depends on: 0001 (profiles), 0116 (is_active_admin), 0117 (activity_log).
-- Safe to re-run.
-- ==========================================

-- 1. Role default permissions -------------------------------------------------
create table if not exists public.role_module_permissions (
  role text not null,
  module_key text not null,
  action text not null check (action in ('VIEW','CREATE','EDIT','DELETE','EXPORT')),
  allowed boolean not null default false,
  primary key (role, module_key, action)
);

-- 2. Per-user overrides ---------------------------------------------------------
create table if not exists public.user_module_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null,
  action text not null check (action in ('VIEW','CREATE','EDIT','DELETE','EXPORT')),
  allowed boolean not null,
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, module_key, action)
);

create index if not exists idx_user_module_overrides_user on public.user_module_permission_overrides (user_id);

-- 3. RLS: only an active Admin can read either table; all writes go through
--    the SECURITY DEFINER RPCs below (never direct client insert/update).
alter table public.role_module_permissions enable row level security;
alter table public.user_module_permission_overrides enable row level security;

drop policy if exists "role_module_permissions_select_admin" on public.role_module_permissions;
create policy "role_module_permissions_select_admin" on public.role_module_permissions
  for select using (public.is_active_admin());

drop policy if exists "user_module_permission_overrides_select_admin" on public.user_module_permission_overrides;
create policy "user_module_permission_overrides_select_admin" on public.user_module_permission_overrides
  for select using (public.is_active_admin());

revoke all on table public.role_module_permissions from anon, authenticated;
grant select on table public.role_module_permissions to authenticated;
revoke all on table public.user_module_permission_overrides from anon, authenticated;
grant select on table public.user_module_permission_overrides to authenticated;

-- 4. Seed role defaults: exactly reproduces what each role can do today -------
truncate table public.role_module_permissions;
insert into public.role_module_permissions (role, module_key, action, allowed) values
  -- COORDINATOR -- matches CoordinatorWorkspace's 9 sections as they work today
  ('COORDINATOR','DASHBOARD','VIEW',true),
  ('COORDINATOR','MANUSCRIPT_QUEUE','VIEW',true), ('COORDINATOR','MANUSCRIPT_QUEUE','DELETE',true),
  ('COORDINATOR','EDITORIAL_BOARD','VIEW',true), ('COORDINATOR','EDITORIAL_BOARD','CREATE',true), ('COORDINATOR','EDITORIAL_BOARD','EDIT',true),
    ('COORDINATOR','EDITORIAL_BOARD','DELETE',true), ('COORDINATOR','EDITORIAL_BOARD','EXPORT',true),
  ('COORDINATOR','REVIEWERS','VIEW',true), ('COORDINATOR','REVIEWERS','CREATE',true), ('COORDINATOR','REVIEWERS','EDIT',true), ('COORDINATOR','REVIEWERS','DELETE',true),
  ('COORDINATOR','PUBLISHERS','VIEW',true), ('COORDINATOR','PUBLISHERS','CREATE',true), ('COORDINATOR','PUBLISHERS','EDIT',true), ('COORDINATOR','PUBLISHERS','DELETE',true),
  ('COORDINATOR','GD_MEMBERS','VIEW',true), ('COORDINATOR','GD_MEMBERS','CREATE',true), ('COORDINATOR','GD_MEMBERS','EDIT',true), ('COORDINATOR','GD_MEMBERS','DELETE',true),
  ('COORDINATOR','REPORTS','VIEW',true),
  ('COORDINATOR','SETTINGS','VIEW',true), ('COORDINATOR','SETTINGS','EXPORT',true),
  ('COORDINATOR','AUDIT_TRAIL','VIEW',true),

  -- EDITOR -- the 3 filter groups EditorWorkspace already has
  ('EDITOR','SUBMISSIONS','VIEW',true), ('EDITOR','SUBMISSIONS','EDIT',true),
  ('EDITOR','REVIEW_STAGES','VIEW',true), ('EDITOR','REVIEW_STAGES','EDIT',true),
  ('EDITOR','COPYEDIT_PRODUCTION','VIEW',true), ('EDITOR','COPYEDIT_PRODUCTION','EDIT',true),

  -- REVIEWER -- the 3 nav groups ReviewerWorkspace already has
  ('REVIEWER','MY_ASSIGNMENTS','VIEW',true), ('REVIEWER','MY_ASSIGNMENTS','EDIT',true), ('REVIEWER','MY_ASSIGNMENTS','DELETE',true),
  ('REVIEWER','REVIEW_STATUS','VIEW',true),
  ('REVIEWER','ADDITIONAL_MODULES','VIEW',true),

  -- PUBLISHER -- the 3 sections PublisherWorkspace already has
  ('PUBLISHER','SCHEDULED_PUBLICATIONS','VIEW',true), ('PUBLISHER','SCHEDULED_PUBLICATIONS','EDIT',true),
  ('PUBLISHER','PUBLICATION_QUEUE','VIEW',true), ('PUBLISHER','PUBLICATION_QUEUE','EDIT',true),
  ('PUBLISHER','PUBLISHED_ARTICLES','VIEW',true), ('PUBLISHER','PUBLISHED_ARTICLES','EXPORT',true),

  -- GD_MEMBER -- the 2 sections GDMemberWorkspace already has
  ('GD_MEMBER','PRODUCTION','VIEW',true), ('GD_MEMBER','PRODUCTION','EDIT',true),
  ('GD_MEMBER','PUBLICATION','VIEW',true), ('GD_MEMBER','PUBLICATION','EDIT',true),

  -- AUTHOR -- the single section AuthorWorkspace already has
  ('AUTHOR','MY_SUBMISSIONS','VIEW',true), ('AUTHOR','MY_SUBMISSIONS','CREATE',true), ('AUTHOR','MY_SUBMISSIONS','EDIT',true)
on conflict (role, module_key, action) do update set allowed = excluded.allowed;

-- 5. The single enforcement primitive: is this user allowed to do this? -------
--    ADMIN+ACTIVE is always true (never locked out). Otherwise a per-user
--    override wins if one exists, else the role default, else false.
create or replace function public.has_permission(p_user_id uuid, p_module text, p_action text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_override boolean;
  v_default boolean;
begin
  select role, status into v_role, v_status from public.profiles where id = p_user_id;
  if v_role is null or v_status is distinct from 'ACTIVE' then
    return false;
  end if;
  if v_role = 'ADMIN' then
    return true;
  end if;

  select allowed into v_override from public.user_module_permission_overrides
    where user_id = p_user_id and module_key = p_module and action = p_action;
  if v_override is not null then
    return v_override;
  end if;

  select allowed into v_default from public.role_module_permissions
    where role = v_role and module_key = p_module and action = p_action;
  return coalesce(v_default, false);
end;
$$;

revoke all on function public.has_permission(uuid, text, text) from public;
grant execute on function public.has_permission(uuid, text, text) to authenticated;

-- 6. The caller's own effective matrix, in one call (used on login) -----------
create or replace function public.get_my_permissions()
returns table(module_key text, action text, allowed boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_status text;
begin
  select role, status into v_role, v_status from public.profiles where id = auth.uid();
  if v_role is null or v_status is distinct from 'ACTIVE' then
    return;
  end if;
  if v_role = 'ADMIN' then
    return query
      select d.module_key, d.action, true
      from (select distinct rmp.module_key, rmp.action from public.role_module_permissions rmp) d;
    return;
  end if;

  return query
    select r.module_key, r.action,
      coalesce(o.allowed, r.allowed, false) as allowed
    from public.role_module_permissions r
    left join public.user_module_permission_overrides o
      on o.user_id = auth.uid() and o.module_key = r.module_key and o.action = r.action
    where r.role = v_role;
end;
$$;

revoke all on function public.get_my_permissions() from public;
grant execute on function public.get_my_permissions() to authenticated;

-- 7. Admin-only: read a specific person's role defaults + overrides + effective
create or replace function public.admin_get_user_permissions(p_user_id uuid)
returns table(module_key text, action text, role_default boolean, override boolean, effective boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.is_active_admin() then
    raise exception 'Only an active Admin can view another person''s permissions';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'No matching account was found';
  end if;
  if v_role = 'ADMIN' then
    return; -- Admins are always fully permitted; nothing to show/edit
  end if;

  return query
    select r.module_key, r.action, r.allowed as role_default, o.allowed as override,
      coalesce(o.allowed, r.allowed, false) as effective
    from public.role_module_permissions r
    left join public.user_module_permission_overrides o
      on o.user_id = p_user_id and o.module_key = r.module_key and o.action = r.action
    where r.role = v_role
    order by r.module_key, r.action;
end;
$$;

revoke all on function public.admin_get_user_permissions(uuid) from public;
grant execute on function public.admin_get_user_permissions(uuid) to authenticated;

-- 8. Admin-only: set / clear one person's override ------------------------------
create or replace function public.admin_set_user_permission_override(p_user_id uuid, p_module text, p_action text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_email text;
begin
  if not public.is_active_admin() then
    raise exception 'Only an active Admin can change permissions';
  end if;
  if p_action not in ('VIEW','CREATE','EDIT','DELETE','EXPORT') then
    raise exception 'Invalid action: %', p_action;
  end if;
  select role, name, email into v_role, v_name, v_email from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'No matching account was found';
  end if;
  if v_role = 'ADMIN' then
    raise exception 'Admin accounts always have full access and cannot be restricted';
  end if;

  insert into public.user_module_permission_overrides (user_id, module_key, action, allowed, updated_by, updated_at)
  values (p_user_id, p_module, p_action, p_allowed, auth.uid(), timezone('utc', now()))
  on conflict (user_id, module_key, action)
  do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  perform public._log_activity('access_control', 'permission_override_set', p_user_id, null,
    jsonb_build_object('module', p_module, 'action', p_action, 'allowed', p_allowed));
end;
$$;

revoke all on function public.admin_set_user_permission_override(uuid, text, text, boolean) from public;
grant execute on function public.admin_set_user_permission_override(uuid, text, text, boolean) to authenticated;

-- 9. Admin-only: clear an override (revert that cell to the role default) -----
create or replace function public.admin_clear_user_permission_override(p_user_id uuid, p_module text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Only an active Admin can change permissions';
  end if;

  delete from public.user_module_permission_overrides
    where user_id = p_user_id and module_key = p_module and action = p_action;

  perform public._log_activity('access_control', 'permission_override_cleared', p_user_id, null,
    jsonb_build_object('module', p_module, 'action', p_action));
end;
$$;

revoke all on function public.admin_clear_user_permission_override(uuid, text, text) from public;
grant execute on function public.admin_clear_user_permission_override(uuid, text, text) to authenticated;

-- 10. Layer the new module permission onto the one existing delete path that
--     maps directly to a module in the catalog: Manuscript Queue / DELETE.
--     Everything else about coordinator_delete_manuscripts() (0112) is
--     unchanged -- this only adds an additional guard alongside the existing
--     is_active_coordinator() check.
create or replace function public.coordinator_delete_manuscripts(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  deleted_count integer := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only an active Coordinator can delete manuscripts.';
  end if;
  if not public.has_permission(auth.uid(), 'MANUSCRIPT_QUEUE', 'DELETE') then
    raise exception 'You do not have permission to delete manuscripts.';
  end if;

  for m in
    select id, title, status from public.manuscripts
    where id = any(p_ids) and status <> 'DRAFT'
  loop
    insert into public.audit_log (actor_id, action, manuscript_id, before_status, after_status, metadata)
    values (auth.uid(), 'MANUSCRIPT_DELETED', null, m.status, null,
            jsonb_build_object('manuscript_id', m.id, 'title', m.title));
    delete from public.manuscripts where id = m.id;
    deleted_count := deleted_count + 1;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.coordinator_delete_manuscripts(text[]) from public;
grant execute on function public.coordinator_delete_manuscripts(text[]) to authenticated;

-- 11. Same additional-guard treatment for the Reviewer's own module: My
--     Active Assignments / DELETE, layered onto reviewer_delete_review_attachment (0091).
create or replace function public.reviewer_delete_review_attachment(p_attachment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ra public.reviewer_assignments;
  att public.reviewer_review_attachments;
begin
  if not public.has_permission(auth.uid(), 'MY_ASSIGNMENTS', 'DELETE') then
    raise exception 'You do not have permission to remove review attachments.';
  end if;

  select * into att from public.reviewer_review_attachments where id = p_attachment_id;
  if att.id is null then raise exception 'Attachment not found'; end if;

  select * into ra from public.reviewer_assignments where id = att.assignment_id;
  if ra.id is null or ra.reviewer_id is distinct from auth.uid() then
    raise exception 'Not your review attachment';
  end if;

  delete from public.reviewer_review_attachments where id = p_attachment_id;
end;
$$;

revoke all on function public.reviewer_delete_review_attachment(uuid) from public;
grant execute on function public.reviewer_delete_review_attachment(uuid) to authenticated;

-- 12. Live updates: so a signed-in person's own permission changes refresh
--     without a re-login.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_module_permission_overrides'
  ) then
    alter publication supabase_realtime add table public.user_module_permission_overrides;
  end if;
end $$;

notify pgrst, 'reload schema';
