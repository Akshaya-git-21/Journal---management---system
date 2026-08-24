-- ==========================================
-- Module 29 (Phase 2, Checkpoint B): Editor-authoritative peer-review
-- decision.
--
-- Gap found: once both peer reviews are in, submit_review()/submit_peer_review()
-- already parks the manuscript at AWAITING_DECISION, but nothing then
-- required the Editor to actually look at those reviews and record a fresh
-- decision before the Coordinator's Decision tab unlocked its free 4-button
-- picker (Accept/Minor/Major/Reject) -- it only checked that *some* editor
-- recommendation existed, which was already true from the Phase 1 screening
-- step's ACCEPT ("Move to Next Stage"). This migration doesn't change that
-- gating logic itself (that's a frontend fix, in DecisionTab.tsx /
-- EditorWorkspace.tsx) -- it fixes the two backend issues that make the
-- fresh-decision flow actually work correctly once the frontend starts
-- relying on it:
--
-- 1. submit_editor_recommendation()'s reason requirement for
--    REJECT/MINOR_REVISION/MAJOR_REVISION was written for the *screening*
--    round (0025) and unconditionally applied to every non-revision-loop
--    call -- including a peer-review-round decision, which the frontend
--    won't collect a mandatory reason for (spec only requires a reason for
--    screening reject/revision; peer-review decisions get an optional
--    "Editor Comments" field instead, via the existing p_comments param).
-- 2. The audit trail for that same branch hardcoded 'EDITOR_REVIEW' as the
--    from_status, which is simply wrong once called from a manuscript
--    that's already AWAITING_DECISION (the peer-review round) -- harmless
--    to the actual manuscript.status value (unchanged either way), but
--    wrong in manuscript_status_history/audit_log.
--
-- Also tags each manuscript_revisions row with its origin (EDITOR_SCREENING
-- vs PEER_REVIEW), so Checkpoint C's Coordinator "send to Reviewers" action
-- knows which revisions should route back through Reviewers vs the Editor.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0025_editor_screening_questionnaire.sql,
-- 0028_reviewer_peer_review_questionnaire.sql.
-- Safe to re-run.
-- ==========================================

alter table public.manuscript_revisions add column if not exists origin text not null default 'EDITOR_SCREENING';
alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_origin_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_origin_check check (origin in ('EDITOR_SCREENING', 'PEER_REVIEW'));

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

  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW';
  -- Peer-review round: reviews already pushed the manuscript to
  -- AWAITING_DECISION (submit_peer_review) and at least one reviewer was
  -- ever assigned -- distinguishes this from the screening round's own
  -- AWAITING_DECISION (reject/revision), which always has zero
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
    -- Revision-loop round: unchanged from 0020 -- stamp the decision onto
    -- the revision being decided and hand off to the Coordinator.
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
    -- Peer-review round: manuscript is already AWAITING_DECISION (no
    -- transition needed) -- this call's only job is to record a *fresh*
    -- Editor decision (with a newer recommendation_submitted_at than the
    -- reviews it's deciding on) so the frontend's confirm-only Coordinator
    -- gate has something current to show. Optional Editor Comments ride on
    -- p_comments, surfaced by the frontend, not persisted to a revision row
    -- here (there may not be one yet -- publish_decision creates it).
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

-- Extend publish_decision(): tag each newly-created revision row with its
-- origin, based on whether any reviewer_assignments exist for the
-- manuscript at the moment the revision is opened. Everything else in this
-- function is unchanged from 0002.
create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rec text; next_status text; rev_count int; rev_origin text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish a decision'; end if;
  if p_decision not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Manuscript is not awaiting a decision (status=%)', m.status; end if;

  select recommendation into rec from public.editor_assignments
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED' order by assigned_at desc limit 1;
  if rec is null then raise exception 'Editor has not submitted a recommendation yet'; end if;

  next_status := case p_decision
    when 'ACCEPT' then 'ACCEPTED'
    when 'REJECT' then 'REJECTED'
    else 'REVISION_REQUESTED'
  end;

  update public.manuscripts set status = next_status, updated_at = timezone('utc', now()) where id = p_manuscript_id;

  if next_status = 'REVISION_REQUESTED' then
    select count(*) into rev_count from public.manuscript_revisions where manuscript_id = p_manuscript_id;
    rev_origin := case when exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id)
      then 'PEER_REVIEW' else 'EDITOR_SCREENING' end;
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status, origin)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD', rev_origin);
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

revoke all on function public.publish_decision(text, text, text) from public;
grant execute on function public.publish_decision(text, text, text) to authenticated;
