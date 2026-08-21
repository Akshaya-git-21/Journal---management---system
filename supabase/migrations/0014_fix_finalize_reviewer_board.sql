-- ==========================================
-- Module 14: Fix finalize_reviewer_board() so it can't leave a manuscript
-- permanently stuck at EDITOR_REVIEW.
--
-- Bug: the reviewer-suggestion-based assignment flow (coordinator_accept_
-- suggestion / coordinator_finalize_reviewer_suggestion, 0008) is the only
-- way reviewers get attached to a manuscript in the current UI, and
-- finalize_reviewer_board() was the ONLY function that ever moved the
-- manuscript out of EDITOR_REVIEW into UNDER_REVIEW. Its "at least 2
-- reviewers" check only counted status IN ('INVITED','ACCEPTED') -- so if
-- the Coordinator never got around to clicking "finalize" before both
-- reviewers had already submitted their reviews (status='SUBMITTED'), the
-- count came back 0 and the RPC refused to run at all, with no other path
-- forward. The manuscript sits at EDITOR_REVIEW forever, submit_review()'s
-- own auto-transition to AWAITING_DECISION never fires (it requires
-- status='UNDER_REVIEW'), and the Coordinator's Decision tab is permanently
-- blocked on "manuscript to reach Awaiting Decision".
--
-- Fix: count SUBMITTED reviewers too, and if every assigned reviewer has
-- already submitted, skip straight to AWAITING_DECISION instead of landing
-- on UNDER_REVIEW and getting stuck there a second time.
--
-- Depends on: 0008_reviewer_assignment_workflow.sql. Safe to re-run.
-- ==========================================

create or replace function public.finalize_reviewer_board(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  reviewer_count int;
  all_submitted boolean;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may finalize the reviewer board';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  select count(*) into reviewer_count from public.reviewer_assignments
  where manuscript_id = p_manuscript_id and status in ('INVITED', 'ACCEPTED', 'SUBMITTED');

  if reviewer_count < 2 then
    raise exception 'Exactly 2 reviewers are required, but only % are assigned', reviewer_count;
  end if;

  if exists (
    select 1 from public.reviewer_assignments ra
    inner join public.profiles p on ra.reviewer_id = p.id
    where ra.manuscript_id = p_manuscript_id
    and ra.status in ('INVITED', 'ACCEPTED', 'SUBMITTED')
    and (p.role is distinct from 'REVIEWER' or p.status is distinct from 'ACTIVE')
  ) then
    raise exception 'One or more assigned reviewers are not active reviewer accounts';
  end if;

  select not exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = p_manuscript_id and status in ('INVITED', 'ACCEPTED')
  ) into all_submitted;

  if all_submitted then
    update public.manuscripts
    set status = 'AWAITING_DECISION', updated_at = timezone('utc', now())
    where id = p_manuscript_id
    returning * into m;

    perform public._record_transition(
      p_manuscript_id, 'EDITOR_REVIEW', 'AWAITING_DECISION', 'finalize_reviewer_board',
      'Reviewer board finalized -- all assigned reviews were already submitted'
    );
  else
    update public.manuscripts
    set status = 'UNDER_REVIEW', updated_at = timezone('utc', now())
    where id = p_manuscript_id
    returning * into m;

    perform public._record_transition(
      p_manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'finalize_reviewer_board',
      'Reviewer board finalized with 2 assigned reviewers'
    );
  end if;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'REVIEWER_BOARD_FINALIZED', p_manuscript_id, 'Reviewer board finalized: ' || m.title,
    case when all_submitted then 'All reviews were already in -- the manuscript is now awaiting a decision.' else 'The manuscript has been sent to peer review.' end
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return m;
end;
$$;
