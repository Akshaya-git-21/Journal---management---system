-- ==========================================
-- Module 28 (Phase 2, Checkpoint A): Reviewer Yes/No peer-review questionnaire
-- (replaces the 7-criterion 1-10 numeric scoring form), plus a required
-- decline reason.
--
-- The 7 numeric score columns on reviewer_assignments (scientific_merit,
-- novelty_innovation, ...) and the old submit_review() signature are left in
-- place for historical rows -- nothing here drops them. New code stops
-- writing to them and uses the columns/RPC added below instead, mirroring
-- exactly how 0025_editor_screening_questionnaire.sql replaced the Editor's
-- numeric scoring with a Yes/No questionnaire.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0026_editor_reviewer_selection.sql.
-- Safe to re-run.
-- ==========================================

alter table public.reviewer_assignments add column if not exists screening_responses jsonb not null default '[]'::jsonb;
alter table public.reviewer_assignments add column if not exists decline_reason text;

-- The 10 fixed peer-review question ids -- a distinct set from the Editor's
-- screening questionnaire (public._screening_question_ids(), 0025).
create or replace function public._peer_review_question_ids()
returns text[] language sql immutable as $$
  select array[
    'focus_scope_relevance','theoretical_novelty','methodology_soundness','replicability_check',
    'structured_completeness','data_integrity','references_relevance','ethical_attestation',
    'structural_clarity','conclusion_justification'
  ];
$$;

-- Step: Reviewer submits their peer-review questionnaire + Comments to
-- Author + recommendation. Replaces submit_review() as the write path for
-- reviewer_assignments; keeps the exact same "last non-declined reviewer in
-- -> AWAITING_DECISION" completion trigger that submit_review() already had
-- (see 0002_manuscripts_workflow.sql lines ~690-701) -- unchanged, just
-- carried over into the new function body.
create or replace function public.submit_peer_review(
  p_assignment_id uuid,
  p_responses jsonb, -- [{"question_id":"focus_scope_relevance","answer":true,"reason":"..."}, ...]
  p_comments_to_author text,
  p_recommendation text,
  p_comments_to_editor text default ''
) returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  a public.reviewer_assignments;
  m public.manuscripts;
  required text[] := public._peer_review_question_ids();
  seen text[] := '{}';
  r jsonb;
  qid text;
  still_pending int;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your review'; end if;
  if a.status is distinct from 'ACCEPTED' then raise exception 'You must accept the invitation before submitting a review'; end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;
  if coalesce(trim(p_comments_to_author), '') = '' then
    raise exception 'Comments to Author are required';
  end if;

  if jsonb_typeof(p_responses) is distinct from 'array' or jsonb_array_length(p_responses) is distinct from array_length(required, 1) then
    raise exception 'All % questionnaire questions must be answered', array_length(required, 1);
  end if;

  for r in select * from jsonb_array_elements(p_responses) loop
    qid := r->>'question_id';
    if qid is null or not (qid = any(required)) then
      raise exception 'Unknown questionnaire question id: %', coalesce(qid, '<null>');
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
    raise exception 'All % questionnaire questions must be answered', array_length(required, 1);
  end if;

  update public.reviewer_assignments set
    status = 'SUBMITTED', submitted_at = timezone('utc', now()),
    recommendation = p_recommendation,
    comments_to_author = p_comments_to_author, comments_to_editor = p_comments_to_editor,
    screening_responses = p_responses
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  select count(*) into still_pending from public.reviewer_assignments
  where manuscript_id = a.manuscript_id and status in ('INVITED','ACCEPTED');

  if still_pending = 0 and m.status = 'UNDER_REVIEW' then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = a.manuscript_id;
    perform public._record_transition(a.manuscript_id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', a.manuscript_id, 'All reviews are in for: ' || m.title);
    end if;
  end if;

  return a;
end;
$$;

drop function if exists public.submit_review(uuid, text, text, text, int, int, int, int, int, int, int);
revoke all on function public.submit_peer_review(uuid, jsonb, text, text, text) from public;
grant execute on function public.submit_peer_review(uuid, jsonb, text, text, text) to authenticated;

-- Step: Reviewer accepts/declines, now with a required decline reason.
-- Extends respond_to_review_invite() (0002, accept-gating added in 0026)
-- with p_reason -- decline behavior (stays EDITOR_REVIEW, notifies Editor +
-- Coordinator, feeds the existing 0027 replacement-deadline mechanism) is
-- otherwise completely unchanged.
create or replace function public.respond_to_review_invite(p_assignment_id uuid, p_accept boolean, p_reason text default null)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  a public.reviewer_assignments;
  m public.manuscripts;
  active_count int;
  accepted_count int;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Invitation not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your invitation'; end if;
  if a.status is distinct from 'INVITED' then raise exception 'Invitation already responded to'; end if;
  if not p_accept and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to decline this invitation';
  end if;

  update public.reviewer_assignments
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end, responded_at = timezone('utc', now()),
      decline_reason = case when p_accept then decline_reason else p_reason end
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  if p_accept then
    select count(*) into active_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status != 'DECLINED';
    select count(*) into accepted_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status = 'ACCEPTED';

    if m.status = 'EDITOR_REVIEW' and active_count >= 2 and accepted_count >= 2 then
      update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()) where id = a.manuscript_id;
      perform public._record_transition(a.manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'respond_to_review_invite', 'Both reviewers accepted');
      if m.assigned_editor_id is not null then
        perform public._notify(m.assigned_editor_id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title);
      end if;
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    else
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'REVIEWER_ACCEPTED', a.manuscript_id, 'A reviewer accepted: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    end if;
  else
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, may need a replacement', coalesce(p_reason, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, please select a replacement: ' || m.title, coalesce(p_reason, ''));
    end if;
  end if;

  return a;
end;
$$;

drop function if exists public.respond_to_review_invite(uuid, boolean);
revoke all on function public.respond_to_review_invite(uuid, boolean, text) from public;
grant execute on function public.respond_to_review_invite(uuid, boolean, text) to authenticated;
