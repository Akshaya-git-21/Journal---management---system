-- ==========================================
-- Module 18: Coordinator gate between Author revision submission and Editor
-- re-review.
--
-- Previously submit_revision() (0002) moved a resubmitted manuscript
-- straight from REVISION_REQUESTED to EDITOR_REVIEW the instant the author
-- clicked send -- there was no Coordinator checkpoint in between, unlike
-- the original submission (which requires the Coordinator to explicitly
-- assign_editor()). This adds that missing gate: the Author's submission
-- now stops at "submitted, awaiting Coordinator review"; only once the
-- Coordinator explicitly forwards it does the Editor's queue unlock.
--
-- Reuses the existing manuscript_revisions.status column rather than adding
-- a new manuscripts.status value (would require a manuscripts_status_check
-- migration and touching the exhaustive Record<ManuscriptStatus,...> maps in
-- every workspace for no functional gain -- manuscripts.status simply stays
-- REVISION_REQUESTED for the entire "with author or with coordinator" span):
--   AWAITING_AUTHOR_UPLOAD -> REVISION_SUBMITTED (now means "with coordinator",
--   not "with editor" as before) -> UNDER_REVIEW (now used: "with editor") ->
--   COMPLETED (unchanged).
--
-- Depends on: 0002_manuscripts_workflow.sql, 0017_editor_revision_loop.sql.
-- Safe to re-run.
-- ==========================================

-- 1. submit_revision no longer jumps to EDITOR_REVIEW or resets the editor's
--    assessment -- it just marks the revision submitted and leaves the
--    manuscript at REVISION_REQUESTED for the Coordinator to review.
create or replace function public.submit_revision(p_manuscript_id text, p_response_note text default '')
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rev public.manuscript_revisions;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Only the author may submit a revision'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then raise exception 'No revision is pending (status=%)', m.status; end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id and status = 'AWAITING_AUTHOR_UPLOAD' order by revision_number desc limit 1;
  if rev.id is null then raise exception 'No pending revision record found'; end if;

  update public.manuscript_revisions set status = 'REVISION_SUBMITTED', submitted_at = timezone('utc', now()) where id = rev.id;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'REVISION_REQUESTED', 'submit_revision', p_response_note);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'REVISION_SUBMITTED', p_manuscript_id, 'Revision submitted for review: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

-- 2. Coordinator-only: forward a submitted revision to the assigned Editor.
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
  update public.editor_assignments set assessment_status = 'NOT_STARTED', assessment_submitted_at = null
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED';
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

-- 3. submit_editor_recommendation now advances the loop when the latest
--    revision is UNDER_REVIEW (editor actively deciding it), not
--    REVISION_SUBMITTED (which now means "with coordinator", not "with
--    editor" -- see above).
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

  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  if latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW' then
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
