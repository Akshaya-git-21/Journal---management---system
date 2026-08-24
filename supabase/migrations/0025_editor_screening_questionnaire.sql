-- ==========================================
-- Module 25: Initial Editorial Screening questionnaire (replaces the
-- 7-criterion 1-10 numeric scoring form for the Editor's first-round
-- evaluation) + Coordinator-gated Reject/Return-to-Author for round 1.
--
-- The 7 numeric score columns on editor_assignments (scientific_merit,
-- novelty_innovation, ...) and submit_editor_assessment() are left in place
-- untouched -- they hold historical data for manuscripts already evaluated
-- and nothing here drops them. New code stops writing to them and uses the
-- columns/RPC added below instead.
--
-- Also extends submit_editor_recommendation() (last modified in
-- 0020_coordinator_gated_revision_decision.sql) so that a REJECT or
-- MINOR_REVISION/MAJOR_REVISION ("Return to Author") recommendation on the
-- ORIGINAL round -- not just later revision-loop rounds -- parks the
-- manuscript at AWAITING_DECISION for the Coordinator to confirm via the
-- existing publish_decision() RPC, instead of leaving it silently
-- unresolved at EDITOR_REVIEW. ACCEPT ("Move to Next Stage") keeps today's
-- behavior of no transition -- the manuscript stays EDITOR_REVIEW and the
-- Editor proceeds to reviewer selection (0026).
--
-- Depends on: 0002_manuscripts_workflow.sql, 0020_coordinator_gated_revision_decision.sql.
-- Safe to re-run.
-- ==========================================

alter table public.editor_assignments add column if not exists screening_responses jsonb not null default '[]'::jsonb;
alter table public.editor_assignments add column if not exists screening_comments text;
alter table public.editor_assignments add column if not exists action_reason text;

-- The 10 fixed screening question ids the questionnaire must cover.
-- Kept as a SQL constant (not a table) since the question set is part of
-- the workflow definition, not editable data.
create or replace function public._screening_question_ids()
returns text[] language sql immutable as $$
  select array[
    'scope_fit','novelty_significance','scientific_soundness','completeness',
    'guidelines_compliance','ethical_compliance','disclosures',
    'research_integrity','language_clarity','reviewer_suitability'
  ];
$$;

-- Step: Editor submits the 10-question Yes/No screening questionnaire +
-- comments. Replaces submit_editor_assessment() as the gate that reviewer
-- selection (0026) checks -- same assessment_status = 'SUBMITTED' contract.
create or replace function public.submit_editor_screening(
  p_assignment_id uuid,
  p_responses jsonb, -- [{"question_id":"scope_fit","answer":true,"reason":"..."}, ...]
  p_comments text default ''
) returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare
  a public.editor_assignments;
  required text[] := public._screening_question_ids();
  seen text[] := '{}';
  r jsonb;
  qid text;
begin
  select * into a from public.editor_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.editor_id is distinct from auth.uid() then raise exception 'Not your assignment'; end if;
  if a.status is distinct from 'ACCEPTED' then raise exception 'You must accept the assignment before submitting the screening'; end if;

  if jsonb_typeof(p_responses) is distinct from 'array' or jsonb_array_length(p_responses) is distinct from array_length(required, 1) then
    raise exception 'All % screening questions must be answered', array_length(required, 1);
  end if;

  for r in select * from jsonb_array_elements(p_responses) loop
    qid := r->>'question_id';
    if qid is null or not (qid = any(required)) then
      raise exception 'Unknown screening question id: %', coalesce(qid, '<null>');
    end if;
    if r->'answer' is null or jsonb_typeof(r->'answer') is distinct from 'boolean' then
      raise exception 'Question % is missing a Yes/No answer', qid;
    end if;
    if coalesce(trim(r->>'reason'), '') = '' then
      raise exception 'Question % is missing a required reason', qid;
    end if;
    if qid = any(seen) then
      raise exception 'Question % answered more than once', qid;
    end if;
    seen := seen || qid;
  end loop;

  if array_length(seen, 1) is distinct from array_length(required, 1) then
    raise exception 'All % screening questions must be answered', array_length(required, 1);
  end if;

  update public.editor_assignments set
    screening_responses = p_responses,
    screening_comments = p_comments,
    assessment_status = 'SUBMITTED', assessment_submitted_at = timezone('utc', now())
  where id = p_assignment_id returning * into a;

  perform public._record_transition(a.manuscript_id, 'EDITOR_REVIEW', 'EDITOR_REVIEW', 'submit_editor_screening');

  return a;
end;
$$;

revoke all on function public.submit_editor_screening(uuid, jsonb, text) from public;
grant execute on function public.submit_editor_screening(uuid, jsonb, text) to authenticated;

-- Step: Editor's final action on the Initial Editorial Screening. Extends
-- the existing submit_editor_recommendation() (0020) with p_reason (the
-- rejection/return-to-author reason) and makes the ORIGINAL round behave
-- like the revision-loop round already does: REJECT/MINOR_REVISION/
-- MAJOR_REVISION parks the manuscript at AWAITING_DECISION for the
-- Coordinator; ACCEPT ("Move to Next Stage") leaves it at EDITOR_REVIEW.
-- PostgREST resolves an RPC call by matching the named params sent against
-- a function's parameter list; leaving the old 4-arg overload in place
-- alongside this new 5-arg one would make every existing call (which only
-- sends 4 named params) ambiguous. Drop it first so there is exactly one
-- overload of this name.
drop function if exists public.submit_editor_recommendation(text, text, text, jsonb);

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
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null then raise exception 'No active editor assignment found'; end if;

  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and m.status = 'EDITOR_REVIEW';

  if not is_revision_loop_round and a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit the screening questionnaire before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  if not is_revision_loop_round and p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reject or return this manuscript to the author';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now()),
      action_reason = case when not is_revision_loop_round then p_reason else action_reason end
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

    perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', 'AWAITING_DECISION', 'submit_editor_recommendation');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') then
    -- Original round, Editor Reject / Return to Author: park at
    -- AWAITING_DECISION so the Coordinator's existing Decision tab
    -- (publish_decision) confirms it before the Author ever sees it.
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, 'EDITOR_REVIEW', 'AWAITING_DECISION', 'submit_editor_recommendation', p_reason);
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
  perform public._record_transition(p_manuscript_id, m.status, m.status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

revoke all on function public.submit_editor_recommendation(text, text, text, jsonb, text) from public;
grant execute on function public.submit_editor_recommendation(text, text, text, jsonb, text) to authenticated;
