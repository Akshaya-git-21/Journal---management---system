-- ==========================================
-- Module 37: let the Author read the Editor's screening comments and
-- Return to Author / Rejection reason for their own manuscript.
--
-- editor_assignments has no SELECT policy for the Author at all (see
-- editor_assignments_select in 0021_publisher_read_access.sql -- editor,
-- coordinator, and conditionally publisher only). Found live: the Author's
-- revision-request screen tried to fetch it directly and got a 403, so
-- "Editor Comments" / "Return to Author Reason" never rendered there.
--
-- Rather than opening the whole table via RLS (editor_assignments also
-- carries comments_to_coordinator -- an Editor-to-Coordinator private note,
-- plus internal screening scores/reasons never meant for the Author), this
-- adds one narrow, purpose-built RPC that returns only the two fields the
-- Author's revision screen actually needs. Same "coarse read path instead
-- of raw row access" pattern as display_status() in
-- 0036_standard_display_status.sql.
--
-- Depends on: 0002_manuscripts_workflow.sql (editor_assignments, manuscripts),
-- 0025_editor_screening_questionnaire.sql (screening_comments, action_reason).
-- Safe to re-run.
-- ==========================================

create or replace function public.get_author_editor_notes(p_manuscript_id text)
returns table (screening_comments text, action_reason text, recommendation text)
language sql
stable
security definer
set search_path = public
as $$
  select a.screening_comments, a.action_reason, a.recommendation
  from public.editor_assignments a
  join public.manuscripts m on m.id = a.manuscript_id
  where a.manuscript_id = p_manuscript_id
    and m.author_id = auth.uid()
  order by
    -- Prefer whichever assignment actually has screening data, same
    -- fallback EditorEvaluationTab.tsx already uses client-side.
    (case when a.action_reason is not null or a.screening_comments is not null then 0 else 1 end),
    a.assigned_at desc
  limit 1;
$$;

revoke all on function public.get_author_editor_notes(text) from public;
grant execute on function public.get_author_editor_notes(text) to authenticated;
