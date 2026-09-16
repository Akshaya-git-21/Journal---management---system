-- ==========================================
-- Let the Editor fill whatever reviewer slots are still open (1 or 2) from
-- the Reviewer Board picker, instead of always requiring exactly 2 at once.
-- Needed now that a slot can already be filled by promoting one of the
-- Author's suggested reviewers (0088/0089) before the Editor opens the
-- Reviewer Board picker -- previously editor_select_reviewers() rejected
-- anything but exactly 2 new reviewer ids, so the picker had no way to
-- "top up" from 1 to 2.
-- ==========================================

create or replace function public.editor_select_reviewers(
  p_manuscript_id text,
  p_reviewer_ids uuid[]
) returns setof public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  rid uuid;
  reviewer public.profiles;
  inserted_id uuid;
  active_count int;
  remaining_slots int;
  n_ids int;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may select reviewers'; end if;
  if m.status is distinct from 'EDITOR_REVIEW' then raise exception 'Manuscript is not ready for reviewer selection (status=%)', m.status; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null or a.recommendation is distinct from 'ACCEPT' then
    raise exception 'Move this manuscript to the next stage before selecting reviewers';
  end if;

  select count(*) into active_count
  from public.manuscript_suggested_reviewers sr
  where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
    and not exists (
      select 1 from public.editor_reviewer_actions a2
      where a2.suggestion_id = sr.id and a2.action in ('DECLINED', 'REPLACED')
    );
  remaining_slots := 2 - active_count;
  if remaining_slots <= 0 then
    raise exception 'You have already selected 2 reviewers for this manuscript';
  end if;

  n_ids := coalesce(array_length(p_reviewer_ids, 1), 0);
  if n_ids is distinct from remaining_slots then
    raise exception 'Select exactly % more reviewer(s) to reach 2 total', remaining_slots;
  end if;
  if n_ids = 2 and p_reviewer_ids[1] = p_reviewer_ids[2] then
    raise exception 'Exactly 2 distinct reviewers are required';
  end if;

  foreach rid in array p_reviewer_ids loop
    select * into reviewer from public.profiles where id = rid and role = 'REVIEWER' and status = 'ACTIVE';
    if reviewer.id is null then raise exception 'Reviewer % is not an active reviewer account', rid; end if;
    if exists (
      select 1 from public.reviewer_assignments
      where manuscript_id = p_manuscript_id and reviewer_id = rid and status != 'DECLINED'
    ) then
      raise exception 'Reviewer % is already assigned to this manuscript', reviewer.name;
    end if;

    insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note)
    values (p_manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '')
    returning id into inserted_id;
  end loop;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', p_manuscript_id, 'Editor selected reviewers: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return query select * from public.manuscript_suggested_reviewers
    where manuscript_id = p_manuscript_id and suggested_by = 'EDITOR'
    order by created_at desc limit n_ids;
end;
$$;

revoke all on function public.editor_select_reviewers(text, uuid[]) from public;
grant execute on function public.editor_select_reviewers(text, uuid[]) to authenticated;
