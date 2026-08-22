-- ==========================================
-- Migration 0024: Let a Coordinator replace a reviewer who declined after
-- the reviewer board was already finalized (manuscript status UNDER_REVIEW).
--
-- Gap: assign_reviewers, coordinator_assign_reviewer_directly, and
-- coordinator_replace_suggestion all require manuscripts.status =
-- 'EDITOR_REVIEW'. respond_to_review_invite lets a reviewer decline an
-- INVITED assignment at any time, with no manuscript-status check -- so a
-- reviewer can decline after finalize_reviewer_board() has already moved the
-- manuscript to UNDER_REVIEW, and no existing RPC lets the Coordinator add a
-- replacement at that point. (The manuscript still eventually reaches
-- AWAITING_DECISION once the surviving reviewer submits, since
-- submit_review()'s pending-count only looks at INVITED/ACCEPTED -- this is
-- about the Coordinator's ability to actually restore a second reviewer,
-- not about the manuscript getting stuck.)
--
-- This adds ONE new, narrowly-scoped RPC. It does not modify
-- assign_reviewers, coordinator_assign_reviewer_directly,
-- coordinator_replace_suggestion, finalize_reviewer_board, or
-- respond_to_review_invite, and does not touch the declined row or the
-- manuscript's status -- it only inserts a new INVITED reviewer_assignments
-- row, exactly like coordinator_assign_reviewer_directly does at
-- EDITOR_REVIEW, but scoped to a manuscript that is UNDER_REVIEW and has an
-- existing DECLINED assignment to point at.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0008_reviewer_assignment_workflow.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.coordinator_replace_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid
)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  declined public.reviewer_assignments;
  m public.manuscripts;
  replacement public.profiles;
  assignment public.reviewer_assignments;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may replace a reviewer';
  end if;

  select * into declined from public.reviewer_assignments where id = p_declined_assignment_id for update;
  if declined.id is null then
    raise exception 'Reviewer assignment not found';
  end if;
  if declined.status is distinct from 'DECLINED' then
    raise exception 'This reviewer assignment was not declined (status=%)', declined.status;
  end if;

  select * into m from public.manuscripts where id = declined.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;
  if m.status is distinct from 'UNDER_REVIEW' then
    raise exception 'This replacement path is only for a manuscript already under review (status=%)', m.status;
  end if;

  select * into replacement from public.profiles where id = p_replacement_reviewer_id;
  if replacement.id is null or replacement.role is distinct from 'REVIEWER' or replacement.status is distinct from 'ACTIVE' then
    raise exception 'Replacement reviewer is not an active reviewer account';
  end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    declined.manuscript_id, p_replacement_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now())
  ) returning * into assignment;

  perform public._notify(
    p_replacement_reviewer_id,
    'REVIEW_INVITATION',
    declined.manuscript_id,
    'You are invited to review: ' || m.title,
    'The coordinator has selected you as a replacement reviewer for this manuscript.'
  );

  return assignment;
end;
$$;

revoke all on function public.coordinator_replace_reviewer(uuid, uuid) from public;
grant execute on function public.coordinator_replace_reviewer(uuid, uuid) to authenticated;
