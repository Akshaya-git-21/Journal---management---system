-- ==========================================
-- Module 44: reviewer re-review rounds (revision_number > 0) no longer
-- repeat the full 10-question questionnaire -- the reviewer already
-- answered it for the original submission and is only confirming whether
-- this specific revision addressed what they flagged, same simplification
-- EditorRevisionReview.tsx already gives the Editor instead of repeating
-- EditorEvaluationFormTab.tsx's full first-round form. Frontend
-- (ReviewerWorkspace.tsx) now sends an empty responses array for a
-- re-review round; submit_peer_review() must accept that instead of
-- rejecting it as "questionnaire not answered".
--
-- Depends on: 0034_reviewer_replacement_round_isolation.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.submit_peer_review(
  p_assignment_id uuid,
  p_responses jsonb,
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
  active_count int;
  is_rereview_round boolean;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Assignment not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your review'; end if;
  if a.status is distinct from 'ACCEPTED' then raise exception 'You must accept the invitation before submitting a review'; end if;

  is_rereview_round := a.revision_number > 0;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;
  if coalesce(trim(p_comments_to_author), '') = '' then
    raise exception 'Comments to Author are required';
  end if;

  if is_rereview_round then
    -- Re-review round: the questionnaire is optional (frontend sends []),
    -- but if it's non-empty (e.g. a future caller still fills it in) it
    -- still has to be well-formed -- just not required.
    if jsonb_typeof(p_responses) is distinct from 'array' then
      raise exception 'Responses must be an array';
    end if;
  else
    if jsonb_typeof(p_responses) is distinct from 'array' or jsonb_array_length(p_responses) is distinct from array_length(required, 1) then
      raise exception 'All % questionnaire questions must be answered', array_length(required, 1);
    end if;
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

  if not is_rereview_round and array_length(seen, 1) is distinct from array_length(required, 1) then
    raise exception 'All % questionnaire questions must be answered', array_length(required, 1);
  end if;

  update public.reviewer_assignments set
    status = 'SUBMITTED', submitted_at = timezone('utc', now()),
    recommendation = p_recommendation,
    comments_to_author = p_comments_to_author, comments_to_editor = p_comments_to_editor,
    screening_responses = p_responses
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  -- Scoped to THIS round only -- a prior round's terminal rows (always
  -- SUBMITTED/DECLINED by the time a later round exists) never counted
  -- anyway, but a same-round decline must now also block completion until
  -- it's replaced (active_count requirement below), instead of being
  -- silently treated as "not pending".
  select count(*) into still_pending from public.reviewer_assignments
  where manuscript_id = a.manuscript_id and revision_number = a.revision_number and status in ('INVITED','ACCEPTED');
  select count(*) into active_count from public.reviewer_assignments
  where manuscript_id = a.manuscript_id and revision_number = a.revision_number and status != 'DECLINED';

  if still_pending = 0 and active_count >= 2 and m.status = 'UNDER_REVIEW' then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = a.manuscript_id;
    perform public._record_transition(a.manuscript_id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', a.manuscript_id, 'All reviews are in for: ' || m.title);
    end if;
  end if;

  return a;
end;
$$;

revoke all on function public.submit_peer_review(uuid, jsonb, text, text, text) from public;
grant execute on function public.submit_peer_review(uuid, jsonb, text, text, text) to authenticated;
