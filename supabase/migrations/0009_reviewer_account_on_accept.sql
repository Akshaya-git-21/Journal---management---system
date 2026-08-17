-- ==========================================
-- Module 9: Allow accepting a reviewer suggestion whose reviewer has no
-- account yet, and let the Coordinator create that account inline.
--
-- Business rule change: an Editor may suggest a reviewer who does not yet
-- have a REVIEWER account. The Coordinator can still accept that
-- suggestion; if no matching active REVIEWER profile exists, the RPC now
-- returns a NEEDS_ACCOUNT signal instead of raising an error, and writes
-- nothing (no editor_reviewer_actions row, no reviewer_assignments row).
-- The Coordinator then creates the reviewer account (existing
-- /api/create-user + approve_user_role flow) and calls the new
-- coordinator_finalize_reviewer_suggestion RPC to record ACCEPTED and
-- create the assignment against the freshly created profile.
--
-- This guarantees we never end up with an ACCEPTED suggestion that has no
-- corresponding reviewer_assignment: nothing is written until a real,
-- active reviewer profile is resolved.
--
-- Depends on: 0008_reviewer_assignment_workflow.sql
-- Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. Replace coordinator_accept_suggestion: return jsonb status instead of
--    raising when no matching reviewer account exists.
-- ------------------------------------------

drop function if exists public.coordinator_accept_suggestion(uuid);

create or replace function public.coordinator_accept_suggestion(p_suggestion_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  reviewer_profile public.profiles;
  action_record public.editor_reviewer_actions;
  assignment public.reviewer_assignments;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may accept reviewer suggestions';
  end if;

  -- Get and lock the suggestion
  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  -- Must be an EDITOR suggestion
  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be accepted';
  end if;

  -- Get and lock the manuscript
  select * into m from public.manuscripts where id = s.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  -- Manuscript must be in EDITOR_REVIEW
  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  -- Verify editor has submitted assessment
  if not exists (
    select 1 from public.editor_assignments
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) then
    raise exception 'Editor has not submitted an assessment yet';
  end if;

  -- Check no action already taken on this suggestion
  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

  -- Suggested reviewer must exist as active REVIEWER profile.
  -- If not, do NOT fail -- signal the caller that an account must be
  -- created first. Nothing is written in this branch.
  select * into reviewer_profile from public.profiles
  where email = s.email and role = 'REVIEWER' and status = 'ACTIVE';

  if reviewer_profile.id is null then
    return jsonb_build_object(
      'status', 'NEEDS_ACCOUNT',
      'suggestion_id', s.id,
      'name', s.name,
      'email', s.email,
      'note', s.note
    );
  end if;

  -- Check if this reviewer already assigned to this manuscript
  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  -- Record the coordinator action
  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  -- Create the reviewer assignment
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now())
  ) returning * into assignment;

  -- Send notification to reviewer
  perform public._notify(
    reviewer_profile.id,
    'REVIEW_INVITATION',
    s.manuscript_id,
    'You are invited to review: ' || m.title,
    'The editor has recommended you as a reviewer for this manuscript.'
  );

  return jsonb_build_object('status', 'ASSIGNED', 'action', to_jsonb(action_record));
end;
$$;

revoke all on function public.coordinator_accept_suggestion(uuid) from public;
grant execute on function public.coordinator_accept_suggestion(uuid) to authenticated;

-- ------------------------------------------
-- 2. New RPC: finalize acceptance once the reviewer account now exists
--    (called after the Coordinator creates + approves the account).
-- ------------------------------------------

create or replace function public.coordinator_finalize_reviewer_suggestion(
  p_suggestion_id uuid,
  p_reviewer_id uuid
)
returns public.editor_reviewer_actions language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  reviewer_profile public.profiles;
  action_record public.editor_reviewer_actions;
  assignment public.reviewer_assignments;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may accept reviewer suggestions';
  end if;

  -- Get and lock the suggestion
  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  -- Must be an EDITOR suggestion
  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be accepted';
  end if;

  -- Get and lock the manuscript
  select * into m from public.manuscripts where id = s.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  -- Manuscript must be in EDITOR_REVIEW
  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  -- Verify editor has submitted assessment
  if not exists (
    select 1 from public.editor_assignments
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) then
    raise exception 'Editor has not submitted an assessment yet';
  end if;

  -- Check no action already taken on this suggestion (guards double-accept races)
  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

  -- Verify the reviewer account now exists and is active
  select * into reviewer_profile from public.profiles where id = p_reviewer_id;
  if reviewer_profile.id is null or reviewer_profile.role is distinct from 'REVIEWER' or reviewer_profile.status is distinct from 'ACTIVE' then
    raise exception 'Reviewer account is not an active reviewer account';
  end if;

  -- Check if this reviewer already assigned to this manuscript
  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  -- Record the coordinator action -- this fulfils the original suggestion,
  -- so it is recorded as ACCEPTED (not REPLACED).
  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  -- Create the reviewer assignment
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now())
  ) returning * into assignment;

  -- Send notification to reviewer
  perform public._notify(
    reviewer_profile.id,
    'REVIEW_INVITATION',
    s.manuscript_id,
    'You are invited to review: ' || m.title,
    'The editor has recommended you as a reviewer for this manuscript.'
  );

  return action_record;
end;
$$;

revoke all on function public.coordinator_finalize_reviewer_suggestion(uuid, uuid) from public;
grant execute on function public.coordinator_finalize_reviewer_suggestion(uuid, uuid) to authenticated;
