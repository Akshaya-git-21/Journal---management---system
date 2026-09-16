-- ==========================================
-- Let the Editor "select" one of the Author's suggested reviewers
-- (manuscript_suggested_reviewers where suggested_by = 'AUTHOR') as their
-- own pick, instead of it being purely informational.
--
-- Reuses the existing EDITOR-suggestion pipeline end to end: selecting an
-- Author suggestion inserts a mirrored suggested_by='EDITOR' row (same
-- shape editor_select_reviewers() and submit_editor_assessment() already
-- produce), so it shows up in the Coordinator's existing "Suggested
-- Reviewers" card with the same Accept & Assign / Decline / Replace
-- actions (coordinator_accept_suggestion() etc., 0008/0026) -- no new
-- Coordinator UI or RPC needed.
-- ==========================================

alter table public.manuscript_suggested_reviewers add column if not exists promoted_from uuid references public.manuscript_suggested_reviewers(id);

create or replace function public.editor_select_author_suggestion(p_suggestion_id uuid)
returns public.manuscript_suggested_reviewers
language plpgsql security definer set search_path = public as $$
declare
  src public.manuscript_suggested_reviewers;
  m public.manuscripts;
  a public.editor_assignments;
  inserted public.manuscript_suggested_reviewers;
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

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note, promoted_from)
  values (src.manuscript_id, 'EDITOR', auth.uid(), src.name, src.email, src.note, p_suggestion_id)
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.editor_select_author_suggestion(uuid) from public;
grant execute on function public.editor_select_author_suggestion(uuid) to authenticated;
