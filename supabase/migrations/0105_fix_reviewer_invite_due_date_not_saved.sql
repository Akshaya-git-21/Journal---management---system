-- ==========================================
-- Module 105: coordinator_send_reviewer_invitations() on this environment
-- was not actually persisting due_date on the reviewer_assignments row it
-- creates (Review Timeline showed "Start: <date> * Deadline: --" even
-- though a valid End Date was submitted and saved as timeline_start_date
-- correctly) -- same signature drift already seen with
-- coordinator_replace_reviewer/coordinator_notify_editor_reviewer_declined
-- in 0104. This re-applies the exact 0098 definition unconditionally so
-- due_date is set going forward, regardless of whatever version is
-- currently live.
--
-- Depends on: 0098_reviewer_timeline_and_reminder.sql.
-- Safe to re-run.
-- ==========================================

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

drop function if exists public.coordinator_send_reviewer_invitations(text);
