-- ==========================================
-- Module 107: a declined reviewer was still auto-revealed to the Editor
-- immediately (real "DECLINED" status + replacement picker), while an
-- overdue reviewer correctly waited for the Coordinator to explicitly
-- click "Notify Editor" / "Request Replacement" first. Both triggers must
-- follow the same flow: reviewer declines/goes overdue -> Coordinator sees
-- it immediately and can notify the Editor at their own pace -> only once
-- notified does the Editor see anything changed and get the replacement
-- picker. Until then the Editor's view still shows the reviewer as pending
-- invitation, same as before the decline/overdue happened.
--
-- editor_select_replacement_reviewer() now requires replacement_requested_at
-- for a DECLINED assignment too, not just an overdue one.
--
-- Depends on: 0106_track_which_assignment_a_replacement_replaces.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.editor_select_replacement_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid
) returns public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare
  declined public.reviewer_assignments;
  m public.manuscripts;
  reviewer public.profiles;
  inserted public.manuscript_suggested_reviewers;
  is_overdue boolean;
begin
  select * into declined from public.reviewer_assignments where id = p_declined_assignment_id for update;
  if declined.id is null then raise exception 'Reviewer assignment not found'; end if;

  is_overdue := declined.status in ('INVITED', 'ACCEPTED') and declined.due_date is not null and declined.due_date < current_date;
  if declined.status is distinct from 'DECLINED' and not is_overdue then
    raise exception 'This reviewer assignment does not need a replacement (status=%)', declined.status;
  end if;
  if declined.replacement_requested_at is null then
    raise exception 'The Coordinator has not requested a replacement for this reviewer yet';
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
    where sr.replaces_assignment_id = p_declined_assignment_id
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
  ) then
    raise exception 'A replacement has already been selected for this reviewer';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note, revision_number, replaces_assignment_id)
  values (declined.manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '', declined.revision_number, p_declined_assignment_id)
  returning * into inserted;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', declined.manuscript_id, 'Editor selected a replacement reviewer: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return inserted;
end;
$$;

revoke all on function public.editor_select_replacement_reviewer(uuid, uuid) from public;
grant execute on function public.editor_select_replacement_reviewer(uuid, uuid) to authenticated;
