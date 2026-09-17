-- ==========================================
-- Module 102: the Coordinator's per-suggestion "Accept & Assign" button
-- (coordinator_accept_suggestion / coordinator_finalize_reviewer_suggestion,
-- 0008/0009) is a THIRD path that creates a reviewer_assignments row
-- directly -- like coordinator_replace_reviewer (Module 101), it never went
-- through the Review Timeline requirement (Module 98). Every path that
-- invites a reviewer now requires and stores a start/end date.
-- ==========================================

create or replace function public.coordinator_accept_suggestion(p_suggestion_id uuid, p_start_date date, p_end_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  reviewer_profile public.profiles;
  action_record public.editor_reviewer_actions;
  assignment public.reviewer_assignments;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may accept reviewer suggestions';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'A review timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be accepted';
  end if;

  select * into m from public.manuscripts where id = s.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  if not exists (
    select 1 from public.editor_assignments
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) then
    raise exception 'Editor has not submitted an assessment yet';
  end if;

  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

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

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, timeline_start_date, due_date
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), p_start_date, p_end_date
  ) returning * into assignment;

  perform public._notify(
    reviewer_profile.id,
    'REVIEW_INVITATION',
    s.manuscript_id,
    'You are invited to review: ' || m.title,
    'Review Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY')
  );

  return jsonb_build_object('status', 'ASSIGNED', 'action', to_jsonb(action_record));
end;
$$;

revoke all on function public.coordinator_accept_suggestion(uuid, date, date) from public;
grant execute on function public.coordinator_accept_suggestion(uuid, date, date) to authenticated;

drop function if exists public.coordinator_accept_suggestion(uuid);

create or replace function public.coordinator_finalize_reviewer_suggestion(
  p_suggestion_id uuid,
  p_reviewer_id uuid,
  p_start_date date,
  p_end_date date
)
returns public.editor_reviewer_actions language plpgsql security definer set search_path = public as $$
declare
  s public.manuscript_suggested_reviewers;
  m public.manuscripts;
  reviewer_profile public.profiles;
  action_record public.editor_reviewer_actions;
  assignment public.reviewer_assignments;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may accept reviewer suggestions';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'A review timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

  select * into s from public.manuscript_suggested_reviewers where id = p_suggestion_id for update;
  if s.id is null then
    raise exception 'Suggestion not found';
  end if;

  if s.suggested_by is distinct from 'EDITOR' then
    raise exception 'Only editor suggestions can be accepted';
  end if;

  select * into m from public.manuscripts where id = s.manuscript_id for update;
  if m.id is null then
    raise exception 'Manuscript not found';
  end if;

  if m.status is distinct from 'EDITOR_REVIEW' then
    raise exception 'Manuscript is not in editor review stage (status=%)', m.status;
  end if;

  if not exists (
    select 1 from public.editor_assignments
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED' and assessment_status = 'SUBMITTED'
  ) then
    raise exception 'Editor has not submitted an assessment yet';
  end if;

  if exists (
    select 1 from public.editor_reviewer_actions where suggestion_id = p_suggestion_id
  ) then
    raise exception 'An action has already been taken on this suggestion';
  end if;

  select * into reviewer_profile from public.profiles where id = p_reviewer_id;
  if reviewer_profile.id is null or reviewer_profile.role is distinct from 'REVIEWER' or reviewer_profile.status is distinct from 'ACTIVE' then
    raise exception 'Reviewer account is not an active reviewer account';
  end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, timeline_start_date, due_date
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), p_start_date, p_end_date
  ) returning * into assignment;

  perform public._notify(
    reviewer_profile.id,
    'REVIEW_INVITATION',
    s.manuscript_id,
    'You are invited to review: ' || m.title,
    'Review Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY')
  );

  return action_record;
end;
$$;

revoke all on function public.coordinator_finalize_reviewer_suggestion(uuid, uuid, date, date) from public;
grant execute on function public.coordinator_finalize_reviewer_suggestion(uuid, uuid, date, date) to authenticated;

drop function if exists public.coordinator_finalize_reviewer_suggestion(uuid, uuid);
