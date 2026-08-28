-- ==========================================
-- Module 46: a reviewer doing a re-review round (revision_number > 0,
-- ReviewerWorkspace.tsx's ReviewForm) now shows the revision's uploaded
-- files and the author's response note -- both fetched via getRevisions()
-- (manuscript_revisions) and getRevisionFiles() (manuscript_files). The
-- files_select policy already allows a reviewer (is_reviewer_of), but
-- revisions_select never did -- only author/assigned_editor/coordinator --
-- so getRevisions() silently returned zero rows for a reviewer session,
-- and the file lookup (which needs the revision row's id first) came up
-- empty even though the file exists.
--
-- Fix: extend revisions_select to also allow the manuscript's reviewers.
--
-- Depends on: 0002_manuscripts_workflow.sql.
-- Safe to re-run.
-- ==========================================

drop policy if exists "revisions_select" on public.manuscript_revisions;
create policy "revisions_select" on public.manuscript_revisions
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
  );
