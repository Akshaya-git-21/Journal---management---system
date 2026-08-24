-- ==========================================
-- Module 32 (Phase 2, Checkpoint C continued): Editor decision on a
-- Reviewer re-review round.
--
-- 0031 lets the Coordinator route a PEER_REVIEW-origin revision back to
-- Reviewers (coordinator_send_revision_to_reviewers). Once they finish
-- re-reviewing, submit_peer_review()'s existing "last reviewer in" trigger
-- already parks the manuscript at AWAITING_DECISION (unchanged, revision-
-- number-agnostic). What was still missing: the Editor's decision on THAT
-- round needs to stamp the in-flight manuscript_revisions row (editor_decision/
-- editor_comments/status=COMPLETED) so the Coordinator's existing
-- pendingRevisionConfirm confirm-only UI (DecisionTab.tsx) picks it up --
-- exactly the same mechanism already built for the Editor-screening
-- revision loop, just keyed on origin='PEER_REVIEW' instead of assuming
-- EDITOR_REVIEW/'EDITOR_SCREENING'.
--
-- Fix: broaden is_revision_loop_round (0025/0029) to also match "an
-- in-flight PEER_REVIEW revision whose reviewers just finished" --
-- everything else in submit_editor_recommendation() is unchanged from 0029,
-- including the first-round is_peer_review_round branch (still correctly
-- excluded by is_revision_loop_round, since that branch requires no
-- UNDER_REVIEW revision to exist yet).
--
-- Depends on: 0029_editor_peer_review_decision_gate.sql, 0031_reviewer_revision_loop.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.submit_editor_recommendation(
  p_manuscript_id text,
  p_recommendation text,
  p_comments text default null,
  p_checklist jsonb default '[]'::jsonb,
  p_reason text default null
)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  latest_rev public.manuscript_revisions;
  is_revision_loop_round boolean;
  is_peer_review_round boolean;
  from_status text;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;
  from_status := m.status;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null then raise exception 'No active editor assignment found'; end if;

  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  -- Two "in progress, editor now deciding on this exact round" shapes:
  -- (a) Editor-screening revision loop -- manuscript sat at EDITOR_REVIEW
  --     while the Editor re-evaluated the author's upload directly.
  -- (b) Peer-review re-review loop (new, 0031) -- manuscript sat at
  --     UNDER_REVIEW while Reviewers re-reviewed, then submit_peer_review()
  --     already advanced it to AWAITING_DECISION once they finished; the
  --     Editor is now deciding on that same PEER_REVIEW-origin revision.
  -- Both stamp the same in-flight revision row and hand off to the
  -- Coordinator identically -- only the manuscript-status precondition
  -- differs, matching which "who was working on it" phase each came from.
  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and (
    m.status = 'EDITOR_REVIEW'
    or (m.status = 'AWAITING_DECISION' and latest_rev.origin = 'PEER_REVIEW')
  );
  -- First peer-review round only: reviews already pushed the manuscript to
  -- AWAITING_DECISION and at least one reviewer was ever assigned, but
  -- there's no in-flight PEER_REVIEW revision yet (is_revision_loop_round
  -- excludes that case) -- distinguishes this from the screening round's
  -- own AWAITING_DECISION (reject/revision), which always has zero
  -- reviewer_assignments since reviewers aren't selected until screening
  -- ACCEPTs.
  is_peer_review_round := not is_revision_loop_round and m.status = 'AWAITING_DECISION'
    and exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id);

  if not is_revision_loop_round and not is_peer_review_round and a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit the screening questionnaire before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  -- Only the screening round requires a mandatory reason (Reject Submission
  -- / Return to Author, per 0025); peer-review decisions get an optional
  -- "Editor Comments" via p_comments instead.
  if not is_revision_loop_round and not is_peer_review_round
     and p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reject or return this manuscript to the author';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now()),
      action_reason = case when not is_revision_loop_round and not is_peer_review_round then p_reason else action_reason end
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  if is_revision_loop_round then
    -- Stamp the decision onto the revision being decided and hand off to
    -- the Coordinator -- unchanged from 0020/0025, now also reached by the
    -- peer-review re-review case (b) above.
    update public.manuscript_revisions
    set editor_comments = coalesce(p_comments, editor_comments),
        editor_checklist = coalesce(p_checklist, editor_checklist),
        editor_decision = p_recommendation,
        editor_decision_at = timezone('utc', now()),
        status = 'COMPLETED'
    where id = latest_rev.id;

    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;

    perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if is_peer_review_round then
    -- First peer-review round: manuscript is already AWAITING_DECISION (no
    -- transition needed) -- this call's only job is to record a *fresh*
    -- Editor decision (with a newer recommendation_submitted_at than the
    -- reviews it's deciding on) so the frontend's confirm-only Coordinator
    -- gate has something current to show.
    perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation', p_comments);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor decided on peer review: ' || m.title, coalesce(p_comments, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') then
    -- Original round, Editor Reject / Return to Author: park at
    -- AWAITING_DECISION so the Coordinator's existing Decision tab
    -- (publish_decision) confirms it before the Author ever sees it.
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation', p_reason);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id,
      case when p_recommendation = 'REJECT' then 'Editor recommends rejection: ' else 'Editor requests revision: ' end || m.title,
      coalesce(p_reason, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  -- ACCEPT ("Move to Next Stage"): no transition, manuscript stays
  -- EDITOR_REVIEW -- this is the signal the reviewer-selection UI (0026)
  -- watches for.
  perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

revoke all on function public.submit_editor_recommendation(text, text, text, jsonb, text) from public;
grant execute on function public.submit_editor_recommendation(text, text, text, jsonb, text) to authenticated;
