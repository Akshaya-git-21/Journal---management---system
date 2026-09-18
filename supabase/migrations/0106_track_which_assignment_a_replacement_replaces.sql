-- ==========================================
-- Module 106: fix a wrong heuristic. The frontend was guessing "this
-- declined/overdue reviewer has been replaced" from "more suggestions exist
-- for this round than 2 slots" -- but that breaks the moment TWO reviewers
-- in the same round need replacing and only ONE has actually gotten a
-- replacement picked so far: the other (still genuinely un-replaced) one
-- got wrongly flagged as "Replaced" too, because there was no way to tell
-- WHICH original assignment a given replacement suggestion was actually
-- for.
--
-- Fix: store that link explicitly.
--
-- 1. manuscript_suggested_reviewers.replaces_assignment_id -- set only when
--    the suggestion was created by editor_select_replacement_reviewer(),
--    pointing at the exact reviewer_assignments row it replaces. Null for
--    every ordinary (non-replacement) suggestion.
-- 2. editor_select_replacement_reviewer() now stamps this column so the
--    frontend can precisely match "is THIS specific assignment covered by a
--    pending replacement" instead of guessing from a count.
--
-- Depends on: 0104_reviewer_overdue_replacement_flow.sql.
-- Safe to re-run.
-- ==========================================

alter table public.manuscript_suggested_reviewers add column if not exists replaces_assignment_id uuid references public.reviewer_assignments(id);

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
