-- ==========================================
-- Module 98: Reviewer Timeline & Reminder -- same pattern as Module 97's
-- Editorial Timeline, applied to reviewer invitations.
--
-- 1. coordinator_send_reviewer_invitations() now requires a Start/End Date
--    (the deadline given to both reviewers being invited in this batch),
--    stored on reviewer_assignments. due_date already existed as a column
--    (previously never set by any RPC) -- reused here as the End Date /
--    deadline; timeline_start_date is new.
-- 2. Whether the review is done is already tracked -- status = 'SUBMITTED'.
--    No new tracking needed.
-- 3. coordinator_send_reviewer_reminder(): Coordinator-only, refuses once
--    already submitted, stamps last_reminder_sent_at, and notifies the
--    reviewer through the existing workflow_notifications system (already
--    real-time via NotificationBell.tsx).
-- ==========================================

alter table public.reviewer_assignments add column if not exists timeline_start_date date;
alter table public.reviewer_assignments add column if not exists last_reminder_sent_at timestamptz;

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

-- Old signature is superseded -- drop it so the client can't accidentally
-- call the dateless version and silently skip the timeline.
drop function if exists public.coordinator_send_reviewer_invitations(text);

-- Coordinator-only: manual reminder to a specific invited/accepted reviewer
-- about their pending review.
create or replace function public.coordinator_send_reviewer_reminder(p_reviewer_assignment_id uuid)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare a public.reviewer_assignments; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this reminder'; end if;

  select * into a from public.reviewer_assignments where id = p_reviewer_assignment_id for update;
  if a.id is null then raise exception 'Reviewer assignment not found'; end if;
  if a.status = 'SUBMITTED' then
    raise exception 'This reviewer has already submitted their review -- no reminder needed';
  end if;
  if a.status = 'DECLINED' then
    raise exception 'This reviewer declined the invitation -- no reminder to send';
  end if;

  select * into m from public.manuscripts where id = a.manuscript_id;

  update public.reviewer_assignments set last_reminder_sent_at = timezone('utc', now())
  where id = a.id returning * into a;

  perform public._notify(a.reviewer_id, 'REVIEWER_TIMELINE_REMINDER', a.manuscript_id,
    'Reminder: review due -- ' || coalesce(m.title, a.manuscript_id),
    case when a.due_date is not null
      then 'Please complete your review by ' || to_char(a.due_date, 'DD Mon YYYY') || '.'
      else 'Please complete your review as soon as possible.' end);

  return a;
end;
$$;

revoke all on function public.coordinator_send_reviewer_reminder(uuid) from public;
grant execute on function public.coordinator_send_reviewer_reminder(uuid) to authenticated;
