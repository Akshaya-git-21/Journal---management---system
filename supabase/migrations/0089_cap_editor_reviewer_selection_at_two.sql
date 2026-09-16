-- ==========================================
-- Cap the Editor at exactly 2 selected reviewers total per manuscript,
-- across BOTH selection paths (editor_select_reviewers() picking from the
-- Reviewer Board, and editor_select_author_suggestion() promoting one of
-- the Author's suggested names, 0088). Previously each path only checked
-- itself in isolation, so an Editor could end up with 3+ active
-- suggested_by='EDITOR' rows (e.g. 2 from the Reviewer Board plus 1
-- promoted Author suggestion).
--
-- "Active" = not yet superseded by a DECLINED/REPLACED coordinator action
-- (editor_reviewer_actions) -- a freed-up slot from a declined/replaced
-- suggestion should not count against the cap.
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

  if array_length(p_reviewer_ids, 1) is distinct from 2 or p_reviewer_ids[1] = p_reviewer_ids[2] then
    raise exception 'Exactly 2 distinct reviewers are required';
  end if;

  select count(*) into active_count
  from public.manuscript_suggested_reviewers sr
  where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
    and not exists (
      select 1 from public.editor_reviewer_actions a2
      where a2.suggestion_id = sr.id and a2.action in ('DECLINED', 'REPLACED')
    );
  if active_count > 0 then
    raise exception 'You have already selected % reviewer(s) for this manuscript -- only 2 total are allowed', active_count;
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
    order by created_at desc limit array_length(p_reviewer_ids, 1);
end;
$$;

revoke all on function public.editor_select_reviewers(text, uuid[]) from public;
grant execute on function public.editor_select_reviewers(text, uuid[]) to authenticated;

create or replace function public.editor_select_author_suggestion(p_suggestion_id uuid)
returns public.manuscript_suggested_reviewers
language plpgsql security definer set search_path = public as $$
declare
  src public.manuscript_suggested_reviewers;
  m public.manuscripts;
  a public.editor_assignments;
  inserted public.manuscript_suggested_reviewers;
  active_count int;
begin
  select * into src from public.manuscript_suggested_reviewers where id = p_suggestion_id;
  if src.id is null then raise exception 'Suggestion not found'; end if;
  if src.suggested_by is distinct from 'AUTHOR' then raise exception 'Only an author-suggested reviewer can be selected this way'; end if;

  select * into m from public.manuscripts where id = src.manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may select reviewers'; end if;
  if m.status is distinct from 'EDITOR_REVIEW' then raise exception 'Manuscript is not ready for reviewer selection (status=%)', m.status; end if;

  select * into a from public.editor_assignments
  where manuscript_id = m.id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null or a.recommendation is distinct from 'ACCEPT' then
    raise exception 'Move this manuscript to the next stage before selecting reviewers';
  end if;

  if exists (select 1 from public.manuscript_suggested_reviewers where promoted_from = p_suggestion_id) then
    raise exception 'This author suggestion has already been selected';
  end if;

  select count(*) into active_count
  from public.manuscript_suggested_reviewers sr
  where sr.manuscript_id = m.id and sr.suggested_by = 'EDITOR'
    and not exists (
      select 1 from public.editor_reviewer_actions a2
      where a2.suggestion_id = sr.id and a2.action in ('DECLINED', 'REPLACED')
    );
  if active_count >= 2 then
    raise exception 'You have already selected 2 reviewers for this manuscript -- only 2 total are allowed';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note, promoted_from)
  values (src.manuscript_id, 'EDITOR', auth.uid(), src.name, src.email, src.note, p_suggestion_id)
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.editor_select_author_suggestion(uuid) from public;
grant execute on function public.editor_select_author_suggestion(uuid) to authenticated;
