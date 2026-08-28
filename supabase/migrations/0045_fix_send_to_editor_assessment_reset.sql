-- ==========================================
-- Module 45: coordinator_send_revision_to_editor() reset the Editor's
-- assessment_status to NOT_STARTED unconditionally -- correct for a
-- screening-origin revision (no dedicated re-review screen exists for that
-- case; canEditEvaluation's fresh EditorEvaluationFormTab genuinely needs
-- to be re-openable), but wrong now that this RPC is also the universal
-- entry point for peer-review-origin revisions (0043_editor_initiated_
-- reviewer_recheck.sql made "send to Editor first" apply to every origin).
-- For a peer-review-origin revision the Editor never re-does the original
-- 10-question screening -- EditorRevisionReview.tsx (while manuscript.status
-- = EDITOR_REVIEW) and then the embedded Reviewers-tab decision card (once
-- reviews put it at AWAITING_DECISION) both key off other signals, but the
-- decision card's `!evaluationSubmitted` gate blocks on assessment_status
-- regardless of round type -- resetting it here permanently locked the
-- Editor out of ever deciding, since a peer-review-origin round never
-- re-submits the screening questionnaire.
--
-- Fix: only reset assessment_status for a screening-origin revision.
--
-- Depends on: 0018_coordinator_revision_gate.sql, 0043_editor_initiated_reviewer_recheck.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.coordinator_send_revision_to_editor(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rev public.manuscript_revisions;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send a revision to the editor';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then
    raise exception 'Manuscript is not awaiting a revision decision (status=%)', m.status;
  end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;
  if rev.id is null or rev.status is distinct from 'REVISION_SUBMITTED' then
    raise exception 'No submitted revision is ready to send to the editor';
  end if;

  update public.manuscript_revisions set status = 'UNDER_REVIEW' where id = rev.id;
  if rev.origin = 'EDITOR_SCREENING' then
    update public.editor_assignments set assessment_status = 'NOT_STARTED', assessment_submitted_at = null
    where manuscript_id = p_manuscript_id and status = 'ACCEPTED';
  end if;
  update public.manuscripts set status = 'EDITOR_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'EDITOR_REVIEW', 'coordinator_send_revision_to_editor');

  if m.assigned_editor_id is not null then
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    values (m.assigned_editor_id, 'REVISION_READY_FOR_REVIEW', p_manuscript_id, 'Revision ' || rev.revision_number || ' ready for your review: ' || m.title, '');
  end if;

  return m;
end;
$$;

revoke all on function public.coordinator_send_revision_to_editor(text) from public;
grant execute on function public.coordinator_send_revision_to_editor(text) to authenticated;
