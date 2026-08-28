-- ==========================================
-- Module 42: "Move to Next Stage" (ACCEPT) on a revision-loop re-review
-- round never actually showed the reviewer picker, even though the UI
-- immediately jumped to the Suggestions tab and told the Editor to
-- "select 2 reviewers to continue" (EditorWorkspace.tsx's
-- onMoveToNextStage). EditorReviewerSelection (and the sidebar's
-- equivalent block) only renders when manuscript.status = 'EDITOR_REVIEW'
-- and the Editor's recommendation is 'ACCEPT'.
--
-- Root cause: submit_editor_recommendation()'s is_revision_loop_round
-- branch (introduced in 0038, last touched by 0040) unconditionally set
-- manuscripts.status = 'AWAITING_DECISION' regardless of p_recommendation
-- -- including ACCEPT. That contradicts 0038's own comment ("ACCEPT...
-- leaves it at EDITOR_REVIEW") and meant the manuscript skipped straight
-- past reviewer selection to the Coordinator's decision queue, so the
-- Reviewer Board list the Editor expected to pick from never appeared.
--
-- Fix: only move to AWAITING_DECISION for REJECT/MINOR_REVISION/
-- MAJOR_REVISION, matching the original (non-loop) screening round's
-- behavior at the bottom of this same function. ACCEPT now leaves the
-- manuscript's status untouched (already 'EDITOR_REVIEW' at this point),
-- so the reviewer-selection screen renders as intended.
--
-- Depends on: 0038_revision_loop_accept_and_author_response.sql,
-- 0040_peer_review_editor_comments.sql.
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

  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and (
    m.status = 'EDITOR_REVIEW'
    or (m.status = 'AWAITING_DECISION' and latest_rev.origin = 'PEER_REVIEW')
  );
  is_peer_review_round := not is_revision_loop_round and m.status = 'AWAITING_DECISION'
    and exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id);

  if not is_revision_loop_round and not is_peer_review_round and a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit the screening questionnaire before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  if not is_revision_loop_round and not is_peer_review_round
     and p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reject or return this manuscript to the author';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now()),
      action_reason = case when not is_revision_loop_round and not is_peer_review_round then p_reason else action_reason end,
      peer_review_comments = case when is_peer_review_round then p_comments else peer_review_comments end
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  if is_revision_loop_round then
    update public.manuscript_revisions
    set editor_comments = coalesce(p_comments, editor_comments),
        editor_checklist = coalesce(p_checklist, editor_checklist),
        editor_decision = p_recommendation,
        editor_decision_at = timezone('utc', now()),
        status = 'COMPLETED'
    where id = latest_rev.id;

    -- ACCEPT ("Move to Next Stage") stays at EDITOR_REVIEW so the reviewer
    -- selection screen picks it up next, exactly like the original
    -- screening round's ACCEPT path below. Only a Reject/Minor/Major
    -- decision here hands the manuscript to the Coordinator's queue.
    if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') then
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation');
    else
      perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
    end if;

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if is_peer_review_round then
    perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation', p_comments);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor decided on peer review: ' || m.title, coalesce(p_comments, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation', p_reason);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id,
      case when p_recommendation = 'REJECT' then 'Editor recommends rejection: ' else 'Editor requests revision: ' end || m.title,
      coalesce(p_reason, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

revoke all on function public.submit_editor_recommendation(text, text, text, jsonb, text) from public;
grant execute on function public.submit_editor_recommendation(text, text, text, jsonb, text) to authenticated;
