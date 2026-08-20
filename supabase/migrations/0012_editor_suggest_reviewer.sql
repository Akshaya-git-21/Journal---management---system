-- ==========================================
-- Module 12: Standalone editor reviewer suggestion.
--
-- The Editor Evaluation form already lets an editor bundle suggested
-- reviewers with submit_editor_assessment(), but the separate "Suggestions"
-- tab in the Editor workspace let an editor add reviewers to local React
-- state only -- nothing was ever persisted, so those suggestions never
-- reached the Coordinator. manuscript_suggested_reviewers only had an
-- INSERT policy for AUTHOR (see 0002_manuscripts_workflow.sql), so a direct
-- client-side insert from an editor was rejected by RLS regardless.
--
-- add_suggested_reviewer() lets the manuscript's accepted editor persist a
-- suggestion at any time (not just at evaluation submission), independent
-- of submit_editor_assessment.
--
-- Depends on: 0002_manuscripts_workflow.sql. Safe to re-run.
-- ==========================================

create or replace function public.add_suggested_reviewer(
  p_manuscript_id text,
  p_name text,
  p_email text,
  p_note text default ''
) returns public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare row public.manuscript_suggested_reviewers;
begin
  if not exists (
    select 1 from public.editor_assignments
    where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  ) then
    raise exception 'Only the accepted editor for this manuscript can suggest reviewers';
  end if;

  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Reviewer name and email are required';
  end if;

  insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note)
  values (p_manuscript_id, 'EDITOR', auth.uid(), trim(p_name), trim(p_email), coalesce(trim(p_note), ''))
  returning * into row;

  return row;
end;
$$;

revoke all on function public.add_suggested_reviewer(text, text, text, text) from public;
grant execute on function public.add_suggested_reviewer(text, text, text, text) to authenticated;
