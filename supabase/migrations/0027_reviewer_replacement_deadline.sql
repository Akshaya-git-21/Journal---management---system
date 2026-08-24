-- ==========================================
-- Module 27: Reviewer decline replacement -- 2-day Editor window, then
-- Coordinator fallback. Works while the manuscript is still EDITOR_REVIEW
-- (not just UNDER_REVIEW, which is all 0024 supported), since with the
-- accept-gated Peer Review transition (0026) a decline now routinely
-- happens before the manuscript ever reaches UNDER_REVIEW.
--
-- No new deadline column: the 2-day window is derived entirely from the
-- declined reviewer_assignments row's existing responded_at timestamp
-- (responded_at + interval '2 days'), which is set by the existing
-- respond_to_review_invite() (0002/0026). This is a real DB timestamp, not
-- a frontend timer -- the UI just computes against it.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0008_reviewer_assignment_workflow.sql,
-- 0024_coordinator_replace_declined_reviewer.sql, 0026_editor_reviewer_selection.sql.
-- Safe to re-run.
-- ==========================================

-- 0. Cleanup: 0025 dropped the 4-arg submit_editor_recommendation() overload
--    before creating its 5-arg replacement, but the original 2-arg overload
--    from 0002 (never dropped by 0018/0020, which each added new overloads
--    instead of replacing it) is still present, and still ambiguous against
--    the 5-arg version for any caller that passes only p_manuscript_id/
--    p_recommendation. The app itself always sends all 5 named params, so
--    this hasn't broken the UI -- fixing it now for any other caller.
drop function if exists public.submit_editor_recommendation(text, text);

-- 1. Broaden coordinator_replace_reviewer()'s manuscript-status check.
--    Everything else about it (declined-row validation, active-reviewer
--    validation, notify) is unchanged from 0024.
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
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  insert into public.reviewer_assignments (
    manuscript_id, reviewer_id, assigned_by, status, invited_at
  ) values (
    declined.manuscript_id, p_replacement_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now())
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

-- 2. Editor selects a single replacement reviewer for a declined slot,
--    within their 2-day window. Same shape as editor_select_reviewers()
--    (0026) but for exactly one reviewer -- coordinator_send_reviewer_invitations
--    (0026) already handles any number of pending EDITOR suggestions, so no
--    change is needed there to invite this one.
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
  if m.status is distinct from 'EDITOR_REVIEW' then raise exception 'Manuscript is not awaiting a replacement reviewer (status=%)', m.status; end if;

  select * into reviewer from public.profiles where id = p_replacement_reviewer_id and role = 'REVIEWER' and status = 'ACTIVE';
  if reviewer.id is null then raise exception 'Reviewer is not an active reviewer account'; end if;

  if exists (
    select 1 from public.reviewer_assignments
    where manuscript_id = declined.manuscript_id and reviewer_id = p_replacement_reviewer_id and status != 'DECLINED'
  ) then
    raise exception 'This reviewer is already assigned to this manuscript';
  end if;

  if exists (
    select 1 from public.manuscript_suggested_reviewers sr
    where sr.manuscript_id = declined.manuscript_id and sr.suggested_by = 'EDITOR' and sr.email = reviewer.email
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
  ) then
    raise exception 'This reviewer has already been selected and is awaiting an invitation';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note)
  values (declined.manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '')
  returning * into inserted;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', declined.manuscript_id, 'Editor selected a replacement reviewer: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return inserted;
end;
$$;

revoke all on function public.editor_select_replacement_reviewer(uuid, uuid) from public;
grant execute on function public.editor_select_replacement_reviewer(uuid, uuid) to authenticated;
