-- ==========================================
-- Module 72: the GD Member's production page shows the "Final Accepted
-- Manuscript" file (the accepted revision's files, or the original
-- submission's files if there were no revisions) -- but manuscript_files
-- and manuscript_revisions SELECT policies never granted the GD Member
-- read access (only author/assigned editor/reviewer/coordinator), so
-- getRevisions()/getManuscriptFiles()/getRevisionFiles() silently returned
-- zero rows for a GD Member session (RLS filters, doesn't error), and the
-- card never rendered. Widen both policies the same way 0061/0059 already
-- widened production-table policies: GD Member access gated on actually
-- being assigned to that manuscript's production.
-- ==========================================

drop policy if exists "files_select" on public.manuscript_files;
create policy "files_select" on public.manuscript_files
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
  );

drop policy if exists "revisions_select" on public.manuscript_revisions;
create policy "revisions_select" on public.manuscript_revisions
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid()
      or public.is_reviewer_of(m.id) or public.is_active_coordinator()
    ))
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
  );
