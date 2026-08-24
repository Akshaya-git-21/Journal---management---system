-- ==========================================
-- Module 34 (Phase 2 edge-case fixes): reviewer decline / replacement during
-- a RE-REVIEW round (revision_number > 0).
--
-- Root cause of every bug fixed here: coordinator_send_revision_to_reviewers()
-- (0031) sets manuscripts.status = 'UNDER_REVIEW' *immediately* when a
-- revision is sent back to reviewers -- unlike the original round, where
-- respond_to_review_invite() only moves the manuscript to UNDER_REVIEW once
-- both reviewers have actually ACCEPTED (0026/0030). Several places assumed
-- "UNDER_REVIEW" always means "both reviewers already accepted", which is no
-- longer true for a re-review round, and several places writing a new
-- reviewer_assignments row for a replacement never carried revision_number
-- through, silently defaulting every replacement to round 0 regardless of
-- which round the decline actually happened in.
--
-- Found while validating spec Test 5 (reviewer declines during re-review)
-- against real data -- none of this was exercised by Checkpoint C's
-- happy-path verification, which never had a mid-re-review decline.
--
-- Depends on: 0027_reviewer_replacement_deadline.sql,
-- 0028_reviewer_peer_review_questionnaire.sql, 0031_reviewer_revision_loop.sql.
-- Safe to re-run.
-- ==========================================

-- 0. Columns needed to carry the round through the replacement pipeline, and
--    to dedupe the Coordinator deadline-expired fallback notification (7).
alter table public.manuscript_suggested_reviewers add column if not exists revision_number int not null default 0;
alter table public.reviewer_assignments add column if not exists deadline_notified boolean not null default false;

-- 1. submit_peer_review(): the "last reviewer in" completion check counted
--    ALL reviewer_assignments rows for the manuscript regardless of round,
--    and never required a minimum of 2 non-declined reviewers. For the
--    original round this was masked by respond_to_review_invite()'s own gate
--    (a decline without a replacement keeps the manuscript at EDITOR_REVIEW,
--    so this function's own `m.status = 'UNDER_REVIEW'` guard never even ran).
--    For a re-review round there is no such gate -- the manuscript is already
--    UNDER_REVIEW the moment the Coordinator sends it to reviewers -- so a
--    same-round decline with no replacement yet was wrongly treated as "round
--    complete" the instant the other reviewer submitted. Fix: scope the count
--    to this reviewer's own revision_number, and require at least 2 active
--    (non-declined) assignments in that round before treating it as done.
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

-- 2. coordinator_replace_reviewer(): the replacement row it inserts must
--    stay in the SAME round as the declined slot it's replacing -- it always
--    defaulted to revision_number 0 before, silently pulling a round-1 (or
--    later) replacement back into round 0 and orphaning it from that round's
--    completion count.
create or replace function public.coordinator_replace_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid
)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  declined public.reviewer_assignments;
  m public.manuscripts;
  replacement public.profiles;
  assignment public.reviewer_assignments;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may replace a reviewer';
  end if;

  select * into declined from public.reviewer_assignments where id = p_declined_assignment_id for update;
  if declined.id is null then
    raise exception 'Reviewer assignment not found';
  end if;
  if declined.status is distinct from 'DECLINED' then
    raise exception 'This reviewer assignment was not declined (status=%)', declined.status;
  end if;

  select * into m from public.manuscripts where id = declined.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;
  if m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then
    raise exception 'This replacement path is only for a manuscript still in Editorial Review or already under review (status=%)', m.status;
  end if;

  select * into replacement from public.profiles where id = p_replacement_reviewer_id;
  if replacement.id is null or replacement.role is distinct from 'REVIEWER' or replacement.status is distinct from 'ACTIVE' then
    raise exception 'Replacement reviewer is not an active reviewer account';
  end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id
      and revision_number = declined.revision_number and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number
  ) values (
    declined.manuscript_id, p_replacement_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now()), declined.revision_number
  ) returning * into assignment;

  perform public._notify(
    p_replacement_reviewer_id,
    'REVIEW_INVITATION',
    declined.manuscript_id,
    'You are invited to review: ' || m.title,
    'The coordinator has selected you as a replacement reviewer for this manuscript.'
  );

  perform public._record_transition(declined.manuscript_id, m.status, m.status, 'coordinator_replace_reviewer');

  if m.assigned_editor_id is not null then
    perform public._notify(
      m.assigned_editor_id, 'COORDINATOR_ASSIGNED_REPLACEMENT', declined.manuscript_id,
      'Coordinator assigned a replacement reviewer: ' || m.title
    );
  end if;

  return assignment;
end;
$$;

revoke all on function public.coordinator_replace_reviewer(uuid, uuid) from public;
grant execute on function public.coordinator_replace_reviewer(uuid, uuid) to authenticated;

-- 3. editor_select_replacement_reviewer(): broaden the status gate to also
--    allow UNDER_REVIEW (a re-review round is UNDER_REVIEW from the moment
--    the Coordinator sends it to reviewers -- see 0031 -- so restricting this
--    to EDITOR_REVIEW meant the Editor could never select a replacement for a
--    decline that happens during re-review at all). Also stamp the pending
--    suggestion with the declined slot's own revision_number so the
--    Coordinator's invitation (step 4 below) lands it in the right round.
create or replace function public.editor_select_replacement_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid
) returns public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare
  declined public.reviewer_assignments;
  m public.manuscripts;
  reviewer public.profiles;
  inserted public.manuscript_suggested_reviewers;
begin
  select * into declined from public.reviewer_assignments where id = p_declined_assignment_id for update;
  if declined.id is null then raise exception 'Reviewer assignment not found'; end if;
  if declined.status is distinct from 'DECLINED' then raise exception 'This reviewer assignment was not declined (status=%)', declined.status; end if;

  select * into m from public.manuscripts where id = declined.manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may select a replacement reviewer'; end if;
  if m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then raise exception 'Manuscript is not awaiting a replacement reviewer (status=%)', m.status; end if;

  select * into reviewer from public.profiles where id = p_replacement_reviewer_id and role = 'REVIEWER' and status = 'ACTIVE';
  if reviewer.id is null then raise exception 'Reviewer is not an active reviewer account'; end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id
      and revision_number = declined.revision_number and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  if exists (
    select 1 from public.manuscript_suggested_reviewers sr
    where sr.manuscript_id = declined.manuscript_id and sr.suggested_by = 'EDITOR' and sr.email = reviewer.email
      and sr.revision_number = declined.revision_number
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
  ) then
    raise exception 'This reviewer has already been selected and is awaiting an invitation';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note, revision_number)
  values (declined.manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '', declined.revision_number)
  returning * into inserted;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', declined.manuscript_id, 'Editor selected a replacement reviewer: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return inserted;
end;
$$;

revoke all on function public.editor_select_replacement_reviewer(uuid, uuid) from public;
grant execute on function public.editor_select_replacement_reviewer(uuid, uuid) to authenticated;

-- 4. coordinator_send_reviewer_invitations(): read each pending suggestion's
--    own revision_number instead of always inserting the new
--    reviewer_assignments row at the default (0). The original 2-reviewer
--    selection is always revision_number 0 (its suggestions are created with
--    the column's default), so this is a no-op for that path -- only the
--    replacement path (3 above) now supplies a non-zero value.
create or replace function public.coordinator_send_reviewer_invitations(p_manuscript_id text)
returns setof public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  sug public.manuscript_suggested_reviewers;
  reviewer_profile public.profiles;
  pending_count int;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send reviewer invitations';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select count(*) into pending_count
  from public.manuscript_suggested_reviewers sr
  where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
    and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id);
  if pending_count = 0 then
    raise exception 'No pending reviewer selections to invite';
  end if;

  for sug in
    select * from public.manuscript_suggested_reviewers sr
    where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
    order by sr.created_at
  loop
    select * into reviewer_profile from public.profiles
    where email = sug.email and role = 'REVIEWER' and status = 'ACTIVE';
    if reviewer_profile.id is null then
      raise exception 'Selected reviewer % is not an active reviewer account', sug.name;
    end if;

    if exists (
      select 1 from public.reviewer_assignments
      where manuscript_id = sug.manuscript_id and reviewer_id = reviewer_profile.id
        and revision_number = sug.revision_number and status != 'DECLINED'
    ) then
      raise exception 'Reviewer % is already assigned to this manuscript', reviewer_profile.name;
    end if;

    insert into public.editor_reviewer_actions (manuscript_id, suggestion_id, action, coordinator_id)
    values (sug.manuscript_id, sug.id, 'ACCEPTED', auth.uid());

    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number)
    values (sug.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), sug.revision_number);

    perform public._notify(
      reviewer_profile.id, 'REVIEW_INVITATION', sug.manuscript_id,
      'You are invited to review: ' || m.title,
      'The coordinator has sent your review invitation.'
    );
  end loop;

  return query select * from public.reviewer_assignments
    where manuscript_id = p_manuscript_id order by invited_at desc limit pending_count;
end;
$$;

revoke all on function public.coordinator_send_reviewer_invitations(text) from public;
grant execute on function public.coordinator_send_reviewer_invitations(text) to authenticated;

-- 5. New RPC: lazily notify Coordinators once a reviewer-replacement
--    deadline has expired with no Editor action taken (spec item 6). There is
--    no cron/background worker in this project, so -- consistent with how
--    every other "notification" in this schema is produced (an insert made
--    during a normal RPC call, not a scheduled job) -- this is a cheap,
--    idempotent check the frontend calls opportunistically (Coordinator
--    dashboard/Review Board load). deadline_notified (0 above) makes it
--    safe to call repeatedly: each expired, un-replaced decline is reported
--    to Coordinators exactly once.
create or replace function public.notify_expired_reviewer_replacements()
returns int language plpgsql security definer set search_path = public as $$
declare
  ra public.reviewer_assignments;
  m public.manuscripts;
  notified_count int := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may check reviewer replacement deadlines';
  end if;

  for ra in
    select * from public.reviewer_assignments
    where status = 'DECLINED'
      and responded_at is not null
      and responded_at < timezone('utc', now()) - interval '2 days'
      and not deadline_notified
      -- Editor already picked someone for this exact slot -- not expired.
      and not exists (
        select 1 from public.manuscript_suggested_reviewers sr
        where sr.manuscript_id = reviewer_assignments.manuscript_id
          and sr.suggested_by = 'EDITOR'
          and sr.revision_number = reviewer_assignments.revision_number
      )
      -- Slot already filled by a replacement -- not expired/pending either.
      and not exists (
        select 1 from public.reviewer_assignments a2
        where a2.manuscript_id = reviewer_assignments.manuscript_id
          and a2.revision_number = reviewer_assignments.revision_number
          and a2.id <> reviewer_assignments.id
          and a2.status != 'DECLINED'
          and a2.invited_at > reviewer_assignments.responded_at
      )
  loop
    select * into m from public.manuscripts where id = ra.manuscript_id;
    if m.id is null or m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then
      continue;
    end if;

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REPLACEMENT_DEADLINE_EXPIRED', ra.manuscript_id,
      'The reviewer replacement deadline has expired. Please assign a replacement reviewer: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

    update public.reviewer_assignments set deadline_notified = true where id = ra.id;
    notified_count := notified_count + 1;
  end loop;

  return notified_count;
end;
$$;

revoke all on function public.notify_expired_reviewer_replacements() from public;
grant execute on function public.notify_expired_reviewer_replacements() to authenticated;
