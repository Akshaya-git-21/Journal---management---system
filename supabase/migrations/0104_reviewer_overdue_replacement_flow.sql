-- ==========================================
-- Module 104: Overdue reviewers + Editor-only replacement selection.
--
-- Problem: a reviewer who simply never responds (never accepts, never
-- declines) has no path to a replacement at all -- the assignment just sits
-- at INVITED/ACCEPTED forever. Separately, coordinator_replace_reviewer()
-- (0101) lets the Coordinator pick a replacement reviewer directly, which no
-- longer matches the intended process: the Editor should always be the one
-- choosing the reviewer, for the original selection AND every replacement,
-- regardless of whether the trigger was a decline or the due date passing.
--
-- This migration:
-- 1. Adds reviewer_assignments.replacement_requested_at -- set when the
--    Coordinator explicitly asks the Editor to replace an overdue reviewer
--    (declines don't need this -- the Editor is already auto-alerted, see
--    getReviewerNeedingReplacement() in src/lib/workflow.ts).
-- 2. Adds coordinator_request_reviewer_replacement(): Coordinator-only,
--    works for a DECLINED assignment (same nudge coordinator_notify_editor_
--    reviewer_declined (0100) did) or a genuinely OVERDUE one (INVITED/
--    ACCEPTED with due_date already passed) -- stamps
--    replacement_requested_at and notifies the assigned Editor either way.
--    Supersedes and retires 0100.
-- 3. Broadens editor_select_replacement_reviewer()'s gate so it also accepts
--    an overdue assignment the Coordinator has explicitly requested a
--    replacement for, not just a declined one.
-- 4. Retires coordinator_replace_reviewer() (0101) -- the Coordinator no
--    longer picks a replacement reviewer directly, for declines or overdue.
--
-- "Overdue" itself is never stored -- it stays a computed condition
-- (status still INVITED/ACCEPTED, due_date < today), same as how the
-- Coordinator dashboard and Editor sidebar already derive it today.
--
-- Depends on: 0034_reviewer_replacement_round_isolation.sql,
-- 0098_reviewer_timeline_and_reminder.sql,
-- 0100_coordinator_notify_editor_reviewer_declined.sql,
-- 0101_replace_reviewer_requires_timeline.sql.
-- Safe to re-run.
-- ==========================================

alter table public.reviewer_assignments add column if not exists replacement_requested_at timestamptz;

-- 1. Coordinator-only: request a replacement for a declined OR overdue
--    reviewer. Idempotent -- can be called again to re-notify the Editor.
create or replace function public.coordinator_request_reviewer_replacement(p_reviewer_assignment_id uuid)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  a public.reviewer_assignments;
  m public.manuscripts;
  reviewer public.profiles;
  is_overdue boolean;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may request a reviewer replacement';
  end if;

  select * into a from public.reviewer_assignments where id = p_reviewer_assignment_id for update;
  if a.id is null then raise exception 'Reviewer assignment not found'; end if;

  is_overdue := a.status in ('INVITED', 'ACCEPTED') and a.due_date is not null and a.due_date < current_date;
  if a.status is distinct from 'DECLINED' and not is_overdue then
    raise exception 'This reviewer assignment is neither declined nor overdue (status=%)', a.status;
  end if;

  select * into m from public.manuscripts where id = a.manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is null then raise exception 'No Editor is assigned to this manuscript'; end if;

  select * into reviewer from public.profiles where id = a.reviewer_id;

  update public.reviewer_assignments set replacement_requested_at = timezone('utc', now())
  where id = p_reviewer_assignment_id returning * into a;

  perform public._notify(
    m.assigned_editor_id, 'REVIEWER_REPLACEMENT_REQUESTED', a.manuscript_id,
    'A reviewer replacement is needed: ' || coalesce(m.title, a.manuscript_id),
    case
      when a.status = 'DECLINED' then coalesce(reviewer.name, 'The reviewer') || ' declined the review invitation.'
      else coalesce(reviewer.name, 'The reviewer') || ' has not responded and is now overdue.'
    end
  );

  return a;
end;
$$;

revoke all on function public.coordinator_request_reviewer_replacement(uuid) from public;
grant execute on function public.coordinator_request_reviewer_replacement(uuid) to authenticated;

-- Superseded by coordinator_request_reviewer_replacement() above, which
-- covers the same decline-nudge case plus the new overdue case. Guarded --
-- some environments never had this function (or have it under a different
-- signature), and a revoke on a nonexistent function errors out the whole
-- migration otherwise.
do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'coordinator_notify_editor_reviewer_declined'
      and pg_get_function_identity_arguments(p.oid) = 'text, text'
  ) then
    revoke all on function public.coordinator_notify_editor_reviewer_declined(text, text) from authenticated;
  end if;
end $$;

-- 2. editor_select_replacement_reviewer(): broaden the status gate so an
--    overdue assignment the Coordinator has explicitly requested a
--    replacement for is also a valid target, not just a declined one.
create or replace function public.editor_select_replacement_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid
) returns public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare
  declined public.reviewer_assignments;
  m public.manuscripts;
  reviewer public.profiles;
  inserted public.manuscript_suggested_reviewers;
begin
  select * into declined from public.reviewer_assignments where id = p_declined_assignment_id for update;
  if declined.id is null then raise exception 'Reviewer assignment not found'; end if;

  if declined.status = 'DECLINED' then
    null; -- unchanged: the Editor can always act on a decline
  elsif declined.status in ('INVITED', 'ACCEPTED')
    and declined.due_date is not null and declined.due_date < current_date
    and declined.replacement_requested_at is not null then
    null; -- overdue AND the Coordinator explicitly requested a replacement
  else
    raise exception 'This reviewer assignment does not need a replacement (status=%)', declined.status;
  end if;

  select * into m from public.manuscripts where id = declined.manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may select a replacement reviewer'; end if;
  if m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then raise exception 'Manuscript is not awaiting a replacement reviewer (status=%)', m.status; end if;

  select * into reviewer from public.profiles where id = p_replacement_reviewer_id and role = 'REVIEWER' and status = 'ACTIVE';
  if reviewer.id is null then raise exception 'Reviewer is not an active reviewer account'; end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id
      and revision_number = declined.revision_number and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  if exists (
    select 1 from public.manuscript_suggested_reviewers sr
    where sr.manuscript_id = declined.manuscript_id and sr.suggested_by = 'EDITOR' and sr.email = reviewer.email
      and sr.revision_number = declined.revision_number
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
  ) then
    raise exception 'This reviewer has already been selected and is awaiting an invitation';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note, revision_number)
  values (declined.manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '', declined.revision_number)
  returning * into inserted;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', declined.manuscript_id, 'Editor selected a replacement reviewer: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return inserted;
end;
$$;

revoke all on function public.editor_select_replacement_reviewer(uuid, uuid) from public;
grant execute on function public.editor_select_replacement_reviewer(uuid, uuid) to authenticated;

-- 3. Retire the Coordinator's direct-pick-and-invite replacement path --
--    the Editor now always chooses the replacement reviewer, whether the
--    trigger was a decline or an overdue reviewer. Guarded the same way --
--    this environment may never have had this exact signature applied.
do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'coordinator_replace_reviewer'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, date, date'
  ) then
    revoke all on function public.coordinator_replace_reviewer(uuid, uuid, date, date) from authenticated;
  end if;
end $$;
