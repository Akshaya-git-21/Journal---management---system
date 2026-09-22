-- ==========================================
-- Module 117: Activity log (Phase 2)
--
-- One append-only table, activity_log, records who did what across the app:
-- authentication, user management, workflow and system actions. Rows are
-- written only by SECURITY DEFINER functions/triggers and by the server
-- (service role). Admins can read and search it; nobody can edit or delete a
-- row -- an immutability trigger refuses UPDATE, DELETE and TRUNCATE for
-- every role, Admins included. Passwords are never stored.
--
-- History starts when this runs: earlier actions cannot be reconstructed.
--
-- Depends on: 0116 (is_active_admin, admin_activity_log). Safe to re-run.
-- ==========================================

-- 1. Table: rename the Phase 1 admin_activity_log if it exists, else create ----
do $$
begin
  if to_regclass('public.admin_activity_log') is not null and to_regclass('public.activity_log') is null then
    alter table public.admin_activity_log rename to activity_log;
  end if;
end $$;

create table if not exists public.activity_log (
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

alter table public.activity_log add column if not exists category text;
alter table public.activity_log add column if not exists manuscript_id text;
alter table public.activity_log add column if not exists manuscript_title text;

-- Allow the one-off back-fill below (the immutability trigger is (re)created after it).
drop trigger if exists trg_activity_log_no_change on public.activity_log;
drop trigger if exists trg_activity_log_no_truncate on public.activity_log;
update public.activity_log set category = 'user_management' where category is null;

create index if not exists idx_activity_log_created on public.activity_log (created_at desc);
create index if not exists idx_activity_log_category on public.activity_log (category, created_at desc);
create index if not exists idx_activity_log_manuscript on public.activity_log (manuscript_id);
create index if not exists idx_activity_log_actor on public.activity_log (actor_id);

-- 2. Access: only Admins can read; nobody but SECURITY DEFINER code / the server writes
alter table public.activity_log enable row level security;

drop policy if exists "admin_activity_log_select_admin" on public.activity_log;
drop policy if exists "activity_log_select_admin" on public.activity_log;
create policy "activity_log_select_admin" on public.activity_log
  for select using (public.is_active_admin());

revoke all on table public.activity_log from anon, authenticated;
grant select on table public.activity_log to authenticated;

-- 3. Append-only: refuse UPDATE / DELETE / TRUNCATE for every role ------------
create or replace function public._activity_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The activity log is append-only: records cannot be changed or deleted.';
end;
$$;

create trigger trg_activity_log_no_change
  before update or delete on public.activity_log
  for each row execute function public._activity_log_immutable();

create trigger trg_activity_log_no_truncate
  before truncate on public.activity_log
  for each statement execute function public._activity_log_immutable();

-- 4. The single writer used by every trigger ---------------------------------
--    Logging must never break the action being logged, so it swallows errors.
create or replace function public._log_activity(
  p_category text,
  p_action text,
  p_target_id uuid default null,
  p_manuscript_id text default null,
  p_details jsonb default '{}'::jsonb,
  p_actor uuid default auth.uid()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  t record;
  m record;
begin
  select id, name, email, role into a from public.profiles where id = p_actor;
  select id, name, email, coalesce(role, requested_role) as role into t from public.profiles where id = p_target_id;
  select id, title into m from public.manuscripts where id = p_manuscript_id;

  insert into public.activity_log
    (category, action, actor_id, actor_name, actor_email, actor_role,
     target_id, target_name, target_email, target_role, manuscript_id, manuscript_title, details)
  values
    (p_category, p_action, p_actor, a.name, a.email, a.role,
     p_target_id, t.name, t.email, t.role, p_manuscript_id, coalesce(m.title, p_details->>'title'),
     coalesce(p_details, '{}'::jsonb));
exception when others then
  raise warning 'activity log write failed: %', sqlerrm;
end;
$$;

revoke all on function public._log_activity(text, text, uuid, text, jsonb, uuid) from public, anon, authenticated;

-- 5. Workflow: every status transition already goes through audit_log --------
create or replace function public._trg_activity_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(new.action);
begin
  -- These are logged with the person concerned by the assignment triggers below.
  if v_action in ('assign_editor', 'assign_reviewers', 'editor_accept', 'editor_decline', 'respond_to_review_invite') then
    return new;
  end if;
  perform public._log_activity(
    'workflow', v_action, null, coalesce(new.manuscript_id, new.metadata->>'manuscript_id'),
    jsonb_strip_nulls(jsonb_build_object('from_status', new.before_status, 'to_status', new.after_status, 'title', new.metadata->>'title')),
    new.actor_id);
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_activity_audit_log on public.audit_log;
create trigger trg_activity_audit_log after insert on public.audit_log
  for each row execute function public._trg_activity_audit_log();

-- 6. Editor assignments -------------------------------------------------------
create or replace function public._trg_activity_editor_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._log_activity('workflow', 'editor_assigned', new.editor_id, new.manuscript_id,
      jsonb_strip_nulls(jsonb_build_object('timeline_end', new.timeline_end_date)));
  elsif old.status is distinct from new.status and new.status in ('ACCEPTED', 'DECLINED') then
    perform public._log_activity('workflow',
      case when new.status = 'ACCEPTED' then 'editor_assignment_accepted' else 'editor_assignment_declined' end,
      null, new.manuscript_id, jsonb_strip_nulls(jsonb_build_object('reason', new.action_reason)));
  end if;
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_activity_editor_assignments on public.editor_assignments;
create trigger trg_activity_editor_assignments after insert or update on public.editor_assignments
  for each row execute function public._trg_activity_editor_assignments();

-- 7. Reviewer invitations and reviews ----------------------------------------
create or replace function public._trg_activity_reviewer_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._log_activity('workflow', 'reviewer_invited', new.reviewer_id, new.manuscript_id,
      jsonb_strip_nulls(jsonb_build_object('due_date', new.due_date, 'round', new.revision_number)));
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'ACCEPTED' then
      perform public._log_activity('workflow', 'reviewer_accepted', null, new.manuscript_id, '{}'::jsonb);
    elsif new.status = 'DECLINED' then
      perform public._log_activity('workflow', 'reviewer_declined', null, new.manuscript_id,
        jsonb_strip_nulls(jsonb_build_object('reason', new.decline_reason)));
    elsif new.status = 'SUBMITTED' then
      perform public._log_activity('workflow', 'review_submitted', null, new.manuscript_id,
        jsonb_strip_nulls(jsonb_build_object('recommendation', new.recommendation, 'round', new.revision_number)));
    end if;
  end if;

  if old.replacement_requested_at is null and new.replacement_requested_at is not null then
    perform public._log_activity('workflow', 'reviewer_replacement_requested', new.reviewer_id, new.manuscript_id, '{}'::jsonb);
  end if;
  if new.last_reminder_sent_at is distinct from old.last_reminder_sent_at and new.last_reminder_sent_at is not null then
    perform public._log_activity('workflow', 'reviewer_reminder_sent', new.reviewer_id, new.manuscript_id, '{}'::jsonb);
  end if;
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_activity_reviewer_assignments on public.reviewer_assignments;
create trigger trg_activity_reviewer_assignments after insert or update on public.reviewer_assignments
  for each row execute function public._trg_activity_reviewer_assignments();

-- 8. Revisions ---------------------------------------------------------------
create or replace function public._trg_activity_revisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._log_activity('workflow', 'revision_requested', null, new.manuscript_id,
    jsonb_strip_nulls(jsonb_build_object('revision_number', new.revision_number, 'decision_type', new.decision_type)));
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_activity_revisions on public.manuscript_revisions;
create trigger trg_activity_revisions after insert on public.manuscript_revisions
  for each row execute function public._trg_activity_revisions();

-- 9. Accounts changed by a signed-in user (server-side changes log themselves)
create or replace function public._trg_activity_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    -- Self sign-ups only; accounts created by an Admin/Coordinator are logged by the server.
    if (new.metadata->>'invited_by') is null then
      perform public._log_activity('user_management', 'user_signed_up', new.id, null,
        jsonb_build_object('requested_role', new.requested_role, 'status', new.status), new.id);
    end if;
    return new;
  end if;

  if auth.uid() is null then return new; end if;
  if (new.metadata->>'invited_by') is not null and old.status = 'PENDING_APPROVAL' and new.status = 'ACTIVE' then
    return new;  -- auto-activation of an account a Coordinator just created
  end if;

  if old.status is distinct from new.status then
    v_action := case
      when old.status = 'PENDING_APPROVAL' and new.status = 'ACTIVE' then 'signup_approved'
      when old.status = 'PENDING_APPROVAL' and new.status = 'REJECTED' then 'signup_rejected'
      when new.status = 'INACTIVE' then 'user_deactivated'
      when new.status = 'ACTIVE' then 'user_activated'
      when new.status = 'DELETED' then 'user_deleted'
      else 'user_status_changed' end;
    perform public._log_activity('user_management', v_action, new.id, null,
      jsonb_build_object('changes', jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status))));
  end if;
  if old.role is not null and old.role is distinct from new.role then
    perform public._log_activity('user_management', 'user_role_changed', new.id, null,
      jsonb_build_object('changes', jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role))));
  end if;
  if lower(coalesce(old.email, '')) is distinct from lower(coalesce(new.email, '')) then
    perform public._log_activity('user_management', 'user_email_changed', new.id, null,
      jsonb_build_object('changes', jsonb_build_object('email', jsonb_build_object('from', old.email, 'to', new.email))));
  end if;
  if old.name is distinct from new.name then
    perform public._log_activity('user_management', 'user_updated', new.id, null,
      jsonb_build_object('changes', jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name))));
  end if;
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_activity_profiles on public.profiles;
create trigger trg_activity_profiles after insert or update on public.profiles
  for each row execute function public._trg_activity_profiles();

-- 10. Settings: old -> new for every value that changed -----------------------
create or replace function public._trg_activity_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grp text;
  k text;
  v jsonb;
  oldv jsonb;
  changes jsonb := '{}'::jsonb;
begin
  for grp in select jsonb_object_keys(coalesce(new.settings, '{}'::jsonb)) loop
    if jsonb_typeof(new.settings->grp) = 'object' then
      for k, v in select key, value from jsonb_each(new.settings->grp) loop
        oldv := case when tg_op = 'UPDATE' and jsonb_typeof(old.settings->grp) = 'object' then old.settings->grp->k else null end;
        if oldv is distinct from v then
          changes := changes || jsonb_build_object(grp || '.' || k, jsonb_build_object('from', oldv, 'to', v));
        end if;
      end loop;
    end if;
  end loop;
  if changes <> '{}'::jsonb then
    perform public._log_activity('system', 'settings_changed', null, null, jsonb_build_object('changes', changes));
  end if;
  return new;
exception when others then
  -- a logging problem must never block the action being logged
  raise warning 'activity log trigger failed: %', sqlerrm;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.journal_settings') is not null then
    drop trigger if exists trg_activity_settings on public.journal_settings;
    create trigger trg_activity_settings after insert or update on public.journal_settings
      for each row execute function public._trg_activity_settings();
  end if;
end $$;

-- 11. Admin search (filters run in the database; RLS still limits it to Admins)
create or replace function public._like_pattern(p text)
returns text
language sql
immutable
as $$
  select '%' || regexp_replace(coalesce(p, ''), '([\\%_])', '\\\1', 'g') || '%';
$$;

create or replace function public.admin_activity_search(
  p_role text default null,
  p_category text default null,
  p_action text default null,
  p_person text default null,
  p_manuscript text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns setof public.activity_log
language sql
stable
security invoker
set search_path = public
as $$
  select a.*
  from public.activity_log a
  where public.is_active_admin()
    and (nullif(p_role, '') is null or a.actor_role = p_role)
    and (nullif(p_category, '') is null or a.category = p_category)
    and (nullif(p_action, '') is null or a.action = p_action)
    and (nullif(p_person, '') is null
         or a.actor_name ilike public._like_pattern(p_person) or a.actor_email ilike public._like_pattern(p_person)
         or a.target_name ilike public._like_pattern(p_person) or a.target_email ilike public._like_pattern(p_person))
    and (nullif(p_manuscript, '') is null
         or a.manuscript_id ilike public._like_pattern(p_manuscript) or a.manuscript_title ilike public._like_pattern(p_manuscript))
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (nullif(p_q, '') is null
         or (coalesce(a.action, '') || ' ' || coalesce(a.actor_name, '') || ' ' || coalesce(a.actor_email, '') || ' ' ||
             coalesce(a.target_name, '') || ' ' || coalesce(a.target_email, '') || ' ' || coalesce(a.manuscript_id, '') || ' ' ||
             coalesce(a.manuscript_title, '') || ' ' || a.details::text) ilike public._like_pattern(p_q))
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_activity_search(text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.admin_activity_search(text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;

-- 12. Live updates -------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
end $$;

notify pgrst, 'reload schema';
