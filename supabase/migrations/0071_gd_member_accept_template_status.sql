-- ==========================================
-- Module 71: GD Member task acceptance, template selection, and a
-- self-reported work status, plus Coordinator-set start/end dates on
-- assignment.
--
-- Flow: Coordinator assigns a GD Member to a manuscript's production AND
-- picks a start/end date for the task (assign_gd_member, widened). The GD
-- Member must explicitly Accept the assignment (gd_member_accept_assignment)
-- before doing anything else; once accepted they pick which journal PDF
-- template they're using for this manuscript (gd_member_select_template);
-- from then on they can update a simple self-reported NOT_STARTED /
-- IN_PROGRESS / COMPLETED work status (gd_member_set_work_status) that the
-- Coordinator sees, independent of the detailed production_status/checklist
-- machinery -- the GD Member does the actual formatting work offline and
-- just keeps this one flag up to date.
-- ==========================================

alter table public.manuscript_production add column if not exists assigned_start_date date;
alter table public.manuscript_production add column if not exists assigned_end_date date;
alter table public.manuscript_production add column if not exists gd_accepted_at timestamptz;
alter table public.manuscript_production add column if not exists selected_template_id uuid references public.journal_templates(id);
alter table public.manuscript_production add column if not exists gd_work_status text not null default 'NOT_STARTED';
alter table public.manuscript_production drop constraint if exists manuscript_production_gd_work_status_check;
alter table public.manuscript_production add constraint manuscript_production_gd_work_status_check
  check (gd_work_status in ('NOT_STARTED','IN_PROGRESS','COMPLETED'));

-- Widen assign_gd_member to take the task's start/end dates and reset the
-- accept/template/work-status gate on every (re)assignment -- a new GD
-- Member must accept and pick a template fresh, they don't inherit the
-- previous assignee's state.
drop function if exists public.assign_gd_member(text, uuid);

create or replace function public.assign_gd_member(p_manuscript_id text, p_gd_member_id uuid, p_start_date date, p_end_date date)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; target public.profiles; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign a GD Member'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'Both a start date and end date are required'; end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

  select * into target from public.profiles where id = p_gd_member_id;
  if target.id is null or target.role is distinct from 'GD_MEMBER' or target.status is distinct from 'ACTIVE' then
    raise exception 'Target is not an active GD Member';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production
  set assigned_to = p_gd_member_id, assigned_at = timezone('utc', now()),
      assigned_start_date = p_start_date, assigned_end_date = p_end_date,
      gd_accepted_at = null, selected_template_id = null, gd_work_status = 'NOT_STARTED',
      updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'assign_gd_member',
    'Assigned GD Member: ' || target.name || ' (' || p_start_date || ' to ' || p_end_date || ')');
  perform public._notify(p_gd_member_id, 'GD_MEMBER_ASSIGNED', p_manuscript_id,
    'You were assigned to a manuscript in production: ' || coalesce(m.title, p_manuscript_id),
    'Task window: ' || p_start_date || ' to ' || p_end_date || '. Please accept the assignment to begin.');

  return p;
end;
$$;

revoke all on function public.assign_gd_member(text, uuid, date, date) from public;
grant execute on function public.assign_gd_member(text, uuid, date, date) to authenticated;

-- GD Member accepts the assignment -- hard gate, nothing else in production
-- is usable (client-side) until this is set. Idempotent: calling it again
-- once already accepted is a no-op rather than an error.
create or replace function public.gd_member_accept_assignment(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may accept it';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p.gd_accepted_at is not null then return p; end if;

  update public.manuscript_production
  set gd_accepted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'gd_member_accept_assignment',
    'GD Member accepted the production assignment');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'GD_MEMBER_ACCEPTED', p_manuscript_id, 'GD Member accepted the assignment: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.gd_member_accept_assignment(text) from public;
grant execute on function public.gd_member_accept_assignment(text) to authenticated;

-- GD Member picks which journal template they're using for this manuscript
-- -- only possible after accepting.
create or replace function public.gd_member_select_template(p_manuscript_id text, p_template_id uuid)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; t public.journal_templates;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may select its template';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.gd_accepted_at is null then raise exception 'Accept the assignment before selecting a template'; end if;

  select * into t from public.journal_templates where id = p_template_id;
  if t.id is null then raise exception 'Template not found'; end if;

  update public.manuscript_production
  set selected_template_id = p_template_id, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'gd_member_select_template',
    'GD Member selected template: ' || t.file_name);

  return p;
end;
$$;

revoke all on function public.gd_member_select_template(text, uuid) from public;
grant execute on function public.gd_member_select_template(text, uuid) to authenticated;

-- GD Member's self-reported work status -- purely informational for the
-- Coordinator, independent of production_status/the checklist.
create or replace function public.gd_member_set_work_status(p_manuscript_id text, p_status text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may set its work status';
  end if;
  if p_status not in ('NOT_STARTED','IN_PROGRESS','COMPLETED') then raise exception 'Invalid status'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.gd_accepted_at is null then raise exception 'Accept the assignment before updating work status'; end if;

  update public.manuscript_production
  set gd_work_status = p_status, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'gd_member_set_work_status',
    'GD Member set work status to ' || p_status);

  if p_status = 'COMPLETED' then
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'GD_MEMBER_WORK_COMPLETE', p_manuscript_id, 'GD Member marked their work complete: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.gd_member_set_work_status(text, text) from public;
grant execute on function public.gd_member_set_work_status(text, text) to authenticated;
