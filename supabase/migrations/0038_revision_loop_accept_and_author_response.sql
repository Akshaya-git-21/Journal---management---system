-- ==========================================
-- Module 38: two fixes to the Editor's screening-revision re-review screen
-- (EditorRevisionReview.tsx), found live while wiring "Move to Next Stage"
-- to the existing reviewer-selection flow.
--
-- 1. submit_editor_recommendation()'s is_revision_loop_round branch always
--    parked the manuscript at AWAITING_DECISION, for every recommendation
--    including ACCEPT -- meaning "accepting" a resubmitted screening-stage
--    revision could never lead to reviewer selection, only straight to the
--    Coordinator's ACCEPT/REJECT call. The ORIGINAL round's ACCEPT ("Move to
--    Next Stage") deliberately does the opposite -- no transition, manuscript
--    stays EDITOR_REVIEW -- specifically so editor_select_reviewers() (0026)
--    and the reviewer-selection UI (EditorWorkspace.tsx's existing
--    `manuscript.status === 'EDITOR_REVIEW' && assignment.recommendation ===
--    'ACCEPT'` gate) pick it up. This makes the revision-loop round's ACCEPT
--    behave the same way, reusing that exact same reviewer-selection flow
--    instead of building a new one.
--
-- 2. Adds manuscript_revisions.author_response, populated by submit_revision()
--    -- previously the Author's "Response to Editor" note only ever landed
--    in manuscript_status_history.note (buried in a generic transition log,
--    not reliably attributable to one revision), so the Editor's re-review
--    screen had no way to show it at all.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0017_editor_revision_loop.sql,
-- 0018_coordinator_revision_gate.sql, 0029_editor_peer_review_decision_gate.sql.
-- Safe to re-run.
-- ==========================================

alter table public.manuscript_revisions add column if not exists author_response text;

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

  update public.manuscript_revisions
  set status = 'REVISION_SUBMITTED', submitted_at = timezone('utc', now()),
      author_response = nullif(trim(coalesce(p_response_note, '')), '')
  where id = rev.id;

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'REVISION_REQUESTED', 'submit_revision', p_response_note);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'REVISION_SUBMITTED', p_manuscript_id, 'Revision submitted for review: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

create or replace function public.submit_editor_recommendation(
  p_manuscript_id text,
  p_recommendation text,
  p_comments text default null,
  p_checklist jsonb default '[]'::jsonb,
  p_reason text default null
) returns public.editor_assignments language plpgsql security definer set search_path = public as $$
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

  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW';
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
      action_reason = case when not is_revision_loop_round and not is_peer_review_round then p_reason else action_reason end
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

    if p_recommendation = 'ACCEPT' then
      -- "Move to Next Stage" on a resubmitted revision -- same as the
      -- original round's ACCEPT: no manuscript status transition, so the
      -- existing reviewer-selection flow (editor_select_reviewers, 0026;
      -- EditorReviewerSelection.tsx's `status === 'EDITOR_REVIEW' &&
      -- recommendation === 'ACCEPT'` gate) picks this up unmodified.
      perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor approved the revision, selecting reviewers: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    else
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation');
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    end if;
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
