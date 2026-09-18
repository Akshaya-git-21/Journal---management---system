-- ==========================================
-- Module 108: two bugs surfaced testing the replacement flow end to end.
--
-- 1. "Could not find the function public.coordinator_accept_suggestion
--    (p_end_date, p_start_date, p_suggestion_id) in the schema cache" --
--    same drift pattern as 0105/0106/0107: this environment never actually
--    got 0102_accept_suggestion_requires_timeline.sql applied, so only the
--    old 1-argument coordinator_accept_suggestion(uuid) exists (or none at
--    all). Re-applies the 3-argument version unconditionally.
--
-- 2. coordinator_accept_suggestion() and coordinator_finalize_reviewer_
--    suggestion() both required manuscript.status = 'EDITOR_REVIEW' to
--    accept a suggestion -- correct for the original 2-reviewer selection,
--    but wrong for a REPLACEMENT suggestion (Module 106), which is picked
--    by the Editor while the manuscript is already UNDER_REVIEW (peer
--    review already started). Broadened to allow both, same reasoning
--    already applied to coordinator_replace_reviewer (0101) and
--    coordinator_send_revision_to_reviewers.
--
-- Depends on: 0102_accept_suggestion_requires_timeline.sql.
-- Safe to re-run.
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

  if m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then
    raise exception 'Manuscript is not awaiting a reviewer invitation (status=%)', m.status;
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
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id
      and revision_number = s.revision_number and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number, timeline_start_date, due_date
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), s.revision_number, p_start_date, p_end_date
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

do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'coordinator_accept_suggestion'
      and pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) then
    drop function public.coordinator_accept_suggestion(uuid);
  end if;
end $$;

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

  if m.status not in ('EDITOR_REVIEW', 'UNDER_REVIEW') then
    raise exception 'Manuscript is not awaiting a reviewer invitation (status=%)', m.status;
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
    where manuscript_id = s.manuscript_id and reviewer_id = reviewer_profile.id
      and revision_number = s.revision_number and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.editor_reviewer_actions (
    manuscript_id, suggestion_id, action, coordinator_id
  ) values (
    s.manuscript_id, p_suggestion_id, 'ACCEPTED', auth.uid()
  ) returning * into action_record;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number, timeline_start_date, due_date
  ) values (
    s.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), s.revision_number, p_start_date, p_end_date
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

do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'coordinator_finalize_reviewer_suggestion'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
  ) then
    drop function public.coordinator_finalize_reviewer_suggestion(uuid, uuid);
  end if;
end $$;
