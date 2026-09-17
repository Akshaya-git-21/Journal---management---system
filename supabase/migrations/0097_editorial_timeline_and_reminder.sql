-- ==========================================
-- Module 97: Editorial Timeline & Real-Time Reminder.
--
-- 1. assign_editor() now requires a Start/End Date (the deadline the
--    Coordinator gives the Editor for the first editorial evaluation),
--    stored on editor_assignments. Visible to both the Coordinator and the
--    assigned Editor (client reads the same row either side already has
--    access to via existing RLS -- no new policy needed).
-- 2. Whether the first evaluation is done is already tracked --
--    editor_assignments.assessment_status = 'SUBMITTED' (submit_editor_
--    assessment(), 0002/0025). No new tracking needed.
-- 3. coordinator_send_editor_reminder(): Coordinator-only, refuses once the
--    evaluation is already submitted, stamps last_reminder_sent_at, and
--    notifies the assigned Editor through the existing workflow_notifications
--    system -- already real-time (NotificationBell.tsx's postgres_changes
--    subscription), already shows title/body, already links to the
--    manuscript on click. No new delivery mechanism needed.
-- ==========================================

alter table public.editor_assignments add column if not exists timeline_start_date date;
alter table public.editor_assignments add column if not exists timeline_end_date date;
alter table public.editor_assignments add column if not exists last_reminder_sent_at timestamptz;

create or replace function public.assign_editor(p_manuscript_id text, p_editor_id uuid, p_start_date date, p_end_date date)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign an editor'; end if;
  if not exists (select 1 from public.profiles where id = p_editor_id and role = 'EDITOR' and status = 'ACTIVE') then
    raise exception 'Target is not an active Editor';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'An editorial timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'SUBMITTED' then raise exception 'Manuscript is not awaiting editor assignment (status=%)', m.status; end if;

  insert into public.editor_assignments (manuscript_id, editor_id, assigned_by, status, assessment_status, timeline_start_date, timeline_end_date)
  values (p_manuscript_id, p_editor_id, auth.uid(), 'INVITED', 'NOT_STARTED', p_start_date, p_end_date);

  update public.manuscripts set assigned_editor_id = p_editor_id, status = 'EDITOR_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'SUBMITTED', 'EDITOR_REVIEW', 'assign_editor');
  perform public._notify(p_editor_id, 'EDITOR_ASSIGNED', p_manuscript_id,
    'You have been assigned: ' || m.title,
    'Editorial Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY'));

  return m;
end;
$$;

revoke all on function public.assign_editor(text, uuid, date, date) from public;
grant execute on function public.assign_editor(text, uuid, date, date) to authenticated;

-- Coordinator-only: manual reminder to the assigned Editor about the
-- pending first editorial evaluation. Refuses once already submitted.
create or replace function public.coordinator_send_editor_reminder(p_manuscript_id text)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare a public.editor_assignments; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this reminder'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and status in ('INVITED', 'ACCEPTED')
  order by assigned_at desc limit 1
  for update;
  if a.id is null then raise exception 'No active editor assignment found for this manuscript'; end if;
  if a.assessment_status = 'SUBMITTED' then
    raise exception 'The editor has already completed the first evaluation -- no reminder needed';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id;

  update public.editor_assignments set last_reminder_sent_at = timezone('utc', now())
  where id = a.id returning * into a;

  perform public._notify(a.editor_id, 'EDITORIAL_TIMELINE_REMINDER', p_manuscript_id,
    'Reminder: editorial evaluation due -- ' || coalesce(m.title, p_manuscript_id),
    case when a.timeline_end_date is not null
      then 'Please complete your initial editorial evaluation by ' || to_char(a.timeline_end_date, 'DD Mon YYYY') || '.'
      else 'Please complete your initial editorial evaluation as soon as possible.' end);

  return a;
end;
$$;

revoke all on function public.coordinator_send_editor_reminder(text) from public;
grant execute on function public.coordinator_send_editor_reminder(text) to authenticated;
