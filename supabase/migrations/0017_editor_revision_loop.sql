-- ==========================================
-- Module 17: Close the revision loop -- editor decision on a resubmitted
-- revision now actually moves the manuscript forward.
--
-- Bug: submit_revision() (0002) correctly moves REVISION_REQUESTED ->
-- EDITOR_REVIEW when the author resubmits, and resets the editor's
-- assessment_status so they re-evaluate. But after the editor re-evaluates
-- and records a recommendation via submit_editor_recommendation() (0002),
-- nothing ever moves manuscripts.status forward again -- it was designed
-- only to attach a recommendation for the *original* review round, where
-- the Coordinator's own finalize_reviewer_board() / peer-review pipeline is
-- what eventually reaches AWAITING_DECISION. A revision cycle has no
-- reviewers to route through in this app's simplified re-review flow, so
-- the manuscript stayed stuck at EDITOR_REVIEW forever after every revision
-- resubmission -- the same class of bug as the original finalize_reviewer_
-- board stuck-manuscript issue (0014), but for the revision loop instead.
--
-- Fix: when the editor's recommendation is recorded while the *latest*
-- manuscript_revisions row is REVISION_SUBMITTED (i.e. the author just
-- resubmitted and the editor is now deciding on that specific resubmission,
-- as opposed to the original submission), automatically:
--   - recommendation = ACCEPT           -> manuscripts.status = AWAITING_DECISION
--                                          (sent straight to the Coordinator's
--                                          Decision tab, no re-review needed)
--   - recommendation = MINOR/MAJOR_REVISION -> a new revision cycle: mark the
--                                          current revision COMPLETED, insert
--                                          revision_number+1 (AWAITING_AUTHOR_UPLOAD,
--                                          decision_type = the new recommendation),
--                                          manuscripts.status = REVISION_REQUESTED
--   - recommendation = REJECT           -> manuscripts.status = REJECTED
-- The very first review round (no revision involved) is untouched --
-- submit_editor_recommendation still only attaches a recommendation there,
-- same as before.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0011_publisher_and_reasons.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.submit_editor_recommendation(p_manuscript_id text, p_recommendation text)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  latest_rev public.manuscript_revisions;
  next_status text;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null then raise exception 'No active editor assignment found'; end if;
  if a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit your evaluation before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  -- Is this recommendation deciding a resubmitted revision? Only then do we
  -- auto-advance the manuscript; the original review round is unaffected.
  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  if latest_rev.id is not null and latest_rev.status = 'REVISION_SUBMITTED' and m.status = 'EDITOR_REVIEW' then
    if p_recommendation = 'ACCEPT' then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'AWAITING_DECISION';
    elsif p_recommendation in ('MINOR_REVISION', 'MAJOR_REVISION') then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, decision_type, status)
      values (p_manuscript_id, latest_rev.revision_number + 1, auth.uid(), '', p_recommendation, 'AWAITING_AUTHOR_UPLOAD');
      update public.manuscripts set status = 'REVISION_REQUESTED', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'REVISION_REQUESTED';
    elsif p_recommendation = 'REJECT' then
      update public.manuscript_revisions set status = 'COMPLETED' where id = latest_rev.id;
      update public.manuscripts set status = 'REJECTED', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      next_status := 'REJECTED';
    end if;

    if next_status is not null then
      perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', next_status, 'submit_editor_recommendation');
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
      return a;
    end if;
  end if;

  -- Original review round: just record the recommendation, no auto-transition.
  perform public._record_transition(p_manuscript_id, m.status, m.status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;
