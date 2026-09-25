-- ==========================================
-- Replace an Editor who never responded within the 4-day acceptance window.
--
-- * editor_assignments.status gains 'REPLACED' (the old assignment is kept as
--   history, never deleted) plus who/when/why.
-- * coordinator_replace_editor(): Coordinator-only. Allowed only when the
--   current INVITED assignment is 96+ hours old (the screen only offers the
--   button for new-rule assignments). A reason is
--   required. Marks the old assignment REPLACED, creates the new INVITED
--   assignment with its editorial timeline, points the manuscript at the new
--   editor, logs the transition, and notifies both editors. The manuscript
--   status is unchanged (stays EDITOR_REVIEW).
-- * A replaced Editor loses access: is_invited_editor_of() now ignores
--   REPLACED rows (no such rows exist before this migration, so nothing
--   changes for existing data).
-- The decline path is untouched (declines still reopen the manuscript for a
-- normal assign_editor()).
-- ==========================================

alter table public.editor_assignments drop constraint if exists editor_assignments_status_check;
alter table public.editor_assignments add constraint editor_assignments_status_check
  check (status in ('INVITED','ACCEPTED','DECLINED','REPLACED'));

alter table public.editor_assignments add column if not exists replaced_at timestamptz;
alter table public.editor_assignments add column if not exists replaced_by uuid references public.profiles(id);
alter table public.editor_assignments add column if not exists replacement_reason text;

create or replace function public.is_invited_editor_of(p_manuscript_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.editor_assignments
    where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status <> 'REPLACED'
  );
$$;

create or replace function public.coordinator_replace_editor(
  p_manuscript_id text, p_new_editor_id uuid, p_start_date date, p_end_date date, p_reason text
) returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare a public.editor_assignments; m public.manuscripts; new_name text; old_name text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may replace an editor'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required to replace an editor'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'An editorial timeline start and end date are required'; end if;
  if p_end_date < p_start_date then raise exception 'End date cannot be before the start date'; end if;
  if not exists (select 1 from public.profiles where id = p_new_editor_id and role = 'EDITOR' and status = 'ACTIVE') then
    raise exception 'Target is not an active Editor';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and status = 'INVITED'
  order by assigned_at desc limit 1
  for update;
  if a.id is null then raise exception 'There is no editor awaiting a response on this manuscript'; end if;
  if timezone('utc', now()) < a.assigned_at + interval '96 hours' then
    raise exception 'The editor can only be replaced after the 4-day acceptance window has passed';
  end if;
  if a.editor_id = p_new_editor_id then raise exception 'Please choose a different editor'; end if;

  update public.editor_assignments
  set status = 'REPLACED', replaced_at = timezone('utc', now()), replaced_by = auth.uid(), replacement_reason = btrim(p_reason)
  where id = a.id;

  insert into public.editor_assignments (manuscript_id, editor_id, assigned_by, status, assessment_status, timeline_start_date, timeline_end_date)
  values (p_manuscript_id, p_new_editor_id, auth.uid(), 'INVITED', 'NOT_STARTED', p_start_date, p_end_date);

  update public.manuscripts set assigned_editor_id = p_new_editor_id, updated_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  select name into old_name from public.profiles where id = a.editor_id;
  select name into new_name from public.profiles where id = p_new_editor_id;

  perform public._record_transition(p_manuscript_id, m.status, m.status, 'replace_editor',
    'Editor replaced: ' || coalesce(old_name, 'previous editor') || ' -> ' || coalesce(new_name, 'new editor') || '. Reason: ' || btrim(p_reason));

  perform public._notify(a.editor_id, 'EDITOR_REPLACED', p_manuscript_id,
    'You have been replaced on: ' || m.title,
    'The acceptance window passed without a response, so this manuscript was reassigned to another editor.');
  perform public._notify(p_new_editor_id, 'EDITOR_ASSIGNED', p_manuscript_id,
    'You have been assigned: ' || m.title,
    'Editorial Timeline: ' || to_char(p_start_date, 'DD Mon YYYY') || ' - ' || to_char(p_end_date, 'DD Mon YYYY'));

  return m;
end;
$$;

revoke all on function public.coordinator_replace_editor(text, uuid, date, date, text) from public;
grant execute on function public.coordinator_replace_editor(text, uuid, date, date, text) to authenticated;
