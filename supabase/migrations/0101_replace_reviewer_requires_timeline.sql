-- ==========================================
-- Module 101: coordinator_replace_reviewer() -- the Coordinator's direct
-- "Replace Reviewer" action for a declined slot -- creates a
-- reviewer_assignments row the same way coordinator_send_reviewer_invitations()
-- does, but never went through Module 98's Review Timeline requirement.
-- Every invitation should carry a timeline visible to both the Coordinator
-- and the Reviewer, regardless of which path created it.
-- ==========================================

create or replace function public.coordinator_replace_reviewer(
  p_declined_assignment_id uuid,
  p_replacement_reviewer_id uuid,
  p_start_date date,
  p_end_date date
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
  if p_start_date is null or p_end_date is null then
    raise exception 'A review timeline start and end date are required';
  end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;

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
    manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number, timeline_start_date, due_date
  ) values (
    declined.manuscript_id, p_replacement_reviewer_id, auth.uid(), 'INVITED', timezone('utc', now()), declined.revision_number, p_start_date, p_end_date
  ) returning * into assignment;

  perform public._notify(
    p_replacement_reviewer_id,
    'REVIEW_INVITATION',
    declined.manuscript_id,
    'You are invited to review: ' || m.title,
    'Review Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY')
  );

  perform public._record_transition(declined.manuscript_id, m.status, m.status, 'coordinator_replace_reviewer');

  if m.assigned_editor_id is not null then
    perform public._notify(
      m.assigned_editor_id, 'COORDINATOR_ASSIGNED_REPLACEMENT', declined.manuscript_id,
      'A replacement reviewer was assigned: ' || m.title
    );
  end if;

  return assignment;
end;
$$;

revoke all on function public.coordinator_replace_reviewer(uuid, uuid, date, date) from public;
grant execute on function public.coordinator_replace_reviewer(uuid, uuid, date, date) to authenticated;

drop function if exists public.coordinator_replace_reviewer(uuid, uuid);
