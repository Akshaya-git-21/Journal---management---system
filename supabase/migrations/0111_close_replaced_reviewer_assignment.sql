-- ==========================================
-- Module 111: "Decision Unavailable -- 1 reviewer invited, awaiting response"
-- shown (and the round never completing) although every reviewer is either
-- submitted or replaced.
--
-- editor_select_replacement_reviewer() (0104/0106/0107) lets the Editor
-- replace an OVERDUE reviewer whose assignment is still INVITED/ACCEPTED.
-- Nothing ever closed that original assignment: the UI merely overlays a
-- "Replaced" badge (replaces_assignment_id), but the row stayed INVITED, so
-- submit_peer_review() (still_pending > 0) never moved the manuscript to
-- AWAITING_DECISION and the Decision tab counted it as an open invitation.
--
-- Fix: when the Coordinator accepts the replacement suggestion, the
-- superseded assignment is closed (DECLINED, reason 'Replaced by another
-- reviewer'). coordinator_accept_suggestion() and
-- coordinator_finalize_reviewer_suggestion() are otherwise identical to 0110;
-- coordinator_send_reviewer_invitations() (bulk send) is identical to 0105.
-- For already-affected manuscripts see
-- one_off_close_replaced_assignments_jms-2026-xpfoh.sql.
--
-- Depends on: 0110_accept_suggestion_editor_accept_recommendation.sql.
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
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED'
      and (assessment_status = 'SUBMITTED' or recommendation = 'ACCEPT')
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

  -- A replacement suggestion (replaces_assignment_id, 0106) supersedes an
  -- original assignment that was never answered / went overdue. That
  -- original row otherwise stays INVITED/ACCEPTED forever -- shown as
  -- "Replaced" in the UI but still counted as an open invitation by
  -- submit_peer_review() and the Decision tab, so the round never completes.
  if s.replaces_assignment_id is not null then
    update public.reviewer_assignments
    set status = 'DECLINED', responded_at = coalesce(responded_at, timezone('utc', now())),
        decline_reason = coalesce(decline_reason, 'Replaced by another reviewer')
    where id = s.replaces_assignment_id and status in ('INVITED','ACCEPTED');
  end if;

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
    where manuscript_id = s.manuscript_id and status = 'ACCEPTED'
      and (assessment_status = 'SUBMITTED' or recommendation = 'ACCEPT')
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

  -- A replacement suggestion (replaces_assignment_id, 0106) supersedes an
  -- original assignment that was never answered / went overdue. That
  -- original row otherwise stays INVITED/ACCEPTED forever -- shown as
  -- "Replaced" in the UI but still counted as an open invitation by
  -- submit_peer_review() and the Decision tab, so the round never completes.
  if s.replaces_assignment_id is not null then
    update public.reviewer_assignments
    set status = 'DECLINED', responded_at = coalesce(responded_at, timezone('utc', now())),
        decline_reason = coalesce(decline_reason, 'Replaced by another reviewer')
    where id = s.replaces_assignment_id and status in ('INVITED','ACCEPTED');
  end if;

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

create or replace function public.coordinator_send_reviewer_invitations(p_manuscript_id text, p_start_date date, p_end_date date)
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
  if p_start_date is null or p_end_date is null then
    raise exception 'A review timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

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

    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number, timeline_start_date, due_date)
    values (sug.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()), sug.revision_number, p_start_date, p_end_date);

    -- Same as coordinator_accept_suggestion(): close the assignment this
    -- replacement suggestion supersedes so it stops counting as open.
    if sug.replaces_assignment_id is not null then
      update public.reviewer_assignments
      set status = 'DECLINED', responded_at = coalesce(responded_at, timezone('utc', now())),
          decline_reason = coalesce(decline_reason, 'Replaced by another reviewer')
      where id = sug.replaces_assignment_id and status in ('INVITED','ACCEPTED');
    end if;

    perform public._notify(
      reviewer_profile.id, 'REVIEW_INVITATION', sug.manuscript_id,
      'You are invited to review: ' || m.title,
      'Review Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY')
    );
  end loop;

  return query select * from public.reviewer_assignments
    where manuscript_id = p_manuscript_id order by invited_at desc limit pending_count;
end;
$$;

revoke all on function public.coordinator_send_reviewer_invitations(text, date, date) from public;
grant execute on function public.coordinator_send_reviewer_invitations(text, date, date) to authenticated;
