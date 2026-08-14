-- ==========================================
-- Module 8: Reviewer Assignment Workflow
-- Coordinator actions on editor-suggested reviewers
--
-- Adds the reviewer suggestion evaluation workflow:
-- 1. Editor submits 2+ reviewer suggestions with evaluation
-- 2. Coordinator reviews suggestions on Review Board
-- 3. Coordinator can: Accept & Assign, Decline, Replace, or Direct Assign
-- 4. When 2 reviewers assigned: Finalize board
-- 5. Manuscript transitions to UNDER_REVIEW
-- 6. Reviewer invitations sent
--
-- New table: editor_reviewer_actions (tracks coordinator decisions on suggestions)
-- New RPCs: coordinator_accept_suggestion, coordinator_decline_suggestion,
--           coordinator_replace_suggestion, coordinator_assign_reviewer_directly,
--           finalize_reviewer_board
--
-- Depends on: 0002_manuscripts_workflow.sql
-- Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. New table: track coordinator actions on editor suggestions
-- ------------------------------------------

create table if not exists public.editor_reviewer_actions (
  id uuid primary key default gen_random_uuid(),
  manuscript_id text not null references public.manuscripts(id) on delete cascade,
  suggestion_id uuid not null references public.manuscript_suggested_reviewers(id) on delete cascade,
  action text not null check (action in ('ACCEPTED','DECLINED','REPLACED')),
  replacement_reviewer_id uuid references public.profiles(id),
  decline_reason text,
  coordinator_id uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_editor_reviewer_actions_manuscript on public.editor_reviewer_actions(manuscript_id);
create index if not exists idx_editor_reviewer_actions_suggestion on public.editor_reviewer_actions(suggestion_id);

-- ------------------------------------------
-- 2. RLS on editor_reviewer_actions
-- ------------------------------------------

alter table public.editor_reviewer_actions enable row level security;

drop policy if exists "editor_reviewer_actions_select" on public.editor_reviewer_actions;
create policy "editor_reviewer_actions_select" on public.editor_reviewer_actions
  for select using (
    public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.assigned_editor_id = auth.uid())
  );

drop policy if exists "editor_reviewer_actions_insert" on public.editor_reviewer_actions;
create policy "editor_reviewer_actions_insert" on public.editor_reviewer_actions
  for insert with check (
    public.is_active_coordinator()
    and coordinator_id = auth.uid()
  );

-- No update/delete allowed (immutable audit trail)
revoke update, delete on public.editor_reviewer_actions from authenticated;

-- ------------------------------------------
-- 3. New RPC: Coordinator accepts a suggestion
-- ------------------------------------------

create or replace function public.coordinator_accept_suggestion(p_suggestion_id uuid)
returns public.editor_reviewer_actions language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  reviewer_profile public.profiles;
  action_record public.editor_reviewer_actions;
  existing_count int;
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

  -- Suggested reviewer must exist as active REVIEWER profile
  select * into reviewer_profile from public.profiles
  where email = s.email and role = 'REVIEWER' and status = 'ACTIVE';

  if reviewer_profile.id is null then
    raise exception 'Suggested reviewer is not an active reviewer account';
  end if;

  -- Check if this reviewer already assigned to this manuscript
  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  -- Check no action already taken on this suggestion
  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
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

  return action_record;
end;
$$;

revoke all on function public.coordinator_accept_suggestion(uuid) from public;
grant execute on function public.coordinator_accept_suggestion(uuid) to authenticated;

-- ------------------------------------------
-- 4. New RPC: Coordinator declines a suggestion
-- ------------------------------------------

create or replace function public.coordinator_decline_suggestion(
  p_suggestion_id uuid,
  p_reason text default ''
)
returns public.editor_reviewer_actions language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  action_record public.editor_reviewer_actions;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may decline reviewer suggestions';
  end if;

  -- Get and lock the suggestion
  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  -- Must be an EDITOR suggestion
  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be declined';
  end if;

  -- Get the manuscript
  select * into m from public.manuscripts where id = s.manuscript_id;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  -- Check no action already taken on this suggestion
  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

  -- Record the coordinator action
  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, decline_reason, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'DECLINED', p_reason, auth.uid()
  ) returning * into action_record;

  return action_record;
end;
$$;

revoke all on function public.coordinator_decline_suggestion(uuid, text) from public;
grant execute on function public.coordinator_decline_suggestion(uuid, text) to authenticated;

-- ------------------------------------------
-- 5. New RPC: Coordinator replaces a suggestion with different reviewer
-- ------------------------------------------

create or replace function public.coordinator_replace_suggestion(
  p_suggestion_id uuid,
  p_replacement_reviewer_id uuid
)
returns public.editor_reviewer_actions language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  replacement public.profiles;
  action_record public.editor_reviewer_actions;
  assignment public.reviewer_assignments;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may replace reviewer suggestions';
  end if;

  -- Get and lock the suggestion
  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  -- Must be an EDITOR suggestion
  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be replaced';
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

  -- Verify replacement reviewer exists and is active
  select * into replacement from public.profiles where id = p_replacement_reviewer_id;
  if replacement.id is null or replacement.role is distinct from 'REVIEWER' or replacement.status is distinct from 'ACTIVE' then
    raise exception 'Replacement reviewer is not an active reviewer account';
  end if;

  -- Check if replacement is already assigned to this manuscript
  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = p_replacement_reviewer_id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  -- Check no action already taken on this suggestion
  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

  -- Record the coordinator action
  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, replacement_reviewer_id, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'REPLACED', p_replacement_reviewer_id, auth.uid()
  ) returning * into action_record;

  -- Create reviewer assignment for replacement
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    s.manuscript_id, p_replacement_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now())
  ) returning * into assignment;

  -- Send notification to replacement reviewer
  perform public._notify(
    p_replacement_reviewer_id,
    'REVIEW_INVITATION',
    s.manuscript_id,
    'You are invited to review: ' || m.title,
    'The coordinator has selected you as a reviewer for this manuscript.'
  );

  return action_record;
end;
$$;

revoke all on function public.coordinator_replace_suggestion(uuid, uuid) from public;
grant execute on function public.coordinator_replace_suggestion(uuid, uuid) to authenticated;

-- ------------------------------------------
-- 6. New RPC: Coordinator assigns reviewer without suggestion
-- ------------------------------------------

create or replace function public.coordinator_assign_reviewer_directly(
  p_manuscript_id text,
  p_reviewer_id uuid
)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  reviewer public.profiles;
  assignment public.reviewer_assignments;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may assign reviewers';
  end if;

  -- Get and lock the manuscript
  select * into m from public.manuscripts where id = p_manuscript_id for update;
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
    where manuscript_id = p_manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) then
    raise exception 'Editor has not submitted an assessment yet';
  end if;

  -- Verify reviewer exists and is active
  select * into reviewer from public.profiles where id = p_reviewer_id;
  if reviewer.id is null or reviewer.role is distinct from 'REVIEWER' or reviewer.status is distinct from 'ACTIVE' then
    raise exception 'Reviewer is not an active reviewer account';
  end if;

  -- Check if reviewer is already assigned to this manuscript
  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = p_manuscript_id and reviewer_id = p_reviewer_id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  -- Create the reviewer assignment
  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    p_manuscript_id, p_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now())
  ) returning * into assignment;

  -- Send notification to reviewer
  perform public._notify(
    p_reviewer_id,
    'REVIEW_INVITATION',
    p_manuscript_id,
    'You are invited to review: ' || m.title,
    'The coordinator has selected you as a reviewer for this manuscript.'
  );

  return assignment;
end;
$$;

revoke all on function public.coordinator_assign_reviewer_directly(text, uuid) from public;
grant execute on function public.coordinator_assign_reviewer_directly(text, uuid) to authenticated;

-- ------------------------------------------
-- 7. New RPC: Finalize reviewer board and transition to UNDER_REVIEW
-- ------------------------------------------

create or replace function public.finalize_reviewer_board(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  reviewer_count int;
  assignment public.reviewer_assignments;
begin
  -- Validate coordinator role
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may finalize the reviewer board';
  end if;

  -- Get and lock the manuscript
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  -- Manuscript must be in EDITOR_REVIEW
  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  -- Count active (non-declined) assignments
  select count(*) into reviewer_count from public.reviewer_assignments
  where manuscript_id = p_manuscript_id and status in ('INVITED', 'ACCEPTED');

  -- Must have exactly 2 active reviewers
  if reviewer_count < 2 then
    raise exception 'Exactly 2 reviewers are required, but only % are assigned', reviewer_count;
  end if;

  -- All assigned reviewers must be active
  if exists (
    select 1 from public.reviewer_assignments ra
    inner join public.profiles p on ra.reviewer_id = p.id
    where ra.manuscript_id = p_manuscript_id
    and ra.status in ('INVITED', 'ACCEPTED')
    and (p.role is distinct from 'REVIEWER' or p.status is distinct from 'ACTIVE')
  ) then
    raise exception 'One or more assigned reviewers are not active reviewer accounts';
  end if;

  -- Transition manuscript to UNDER_REVIEW
  update public.manuscripts
  set status = 'UNDER_REVIEW', updated_at = timezone('utc', now())
  where id = p_manuscript_id
  returning * into m;

  -- Record the transition
  perform public._record_transition(
    p_manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'finalize_reviewer_board',
    'Reviewer board finalized with 2 assigned reviewers'
  );

  -- Notify coordinator (or could notify editor)
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'REVIEWER_BOARD_FINALIZED', p_manuscript_id, 'Reviewer board finalized: ' || m.title, 'The manuscript has been sent to peer review.'
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return m;
end;
$$;

revoke all on function public.finalize_reviewer_board(text) from public;
grant execute on function public.finalize_reviewer_board(text) to authenticated;

-- ------------------------------------------
-- 8. Improve submit_editor_assessment to validate suggestions
-- ------------------------------------------

-- ALTER the existing submit_editor_assessment to validate that suggested reviewers exist as REVIEWER profiles
-- Note: The original RPC is in 0002_manuscripts_workflow.sql
-- We enhance validation but keep the same signature for backward compatibility

-- Actually, we won't modify it here - the UI will validate on frontend before calling
-- Backend accepts JSONB array of {name, email, note} and stores as-is
-- Coordinator actions require reviewer to exist in REVIEWER role

-- This allows editors to suggest anyone (external reviewers, future profiles, etc)
-- But coordinators can only ACCEPT suggestions where the reviewer exists as ACTIVE REVIEWER profile

-- ------------------------------------------
-- 9. Done
-- ------------------------------------------

-- This migration adds the complete reviewer suggestion workflow:
-- 1. Editor submits suggestions (already in 0002, via submit_editor_assessment)
-- 2. Coordinator can ACCEPT/DECLINE/REPLACE suggestions on Review Board
-- 3. Coordinator can ASSIGN reviewers not in suggestions
-- 4. After 2 reviewers assigned, coordinator can FINALIZE board
-- 5. Manuscript transitions to UNDER_REVIEW automatically
-- 6. Reviewer invitations are sent via notifications

