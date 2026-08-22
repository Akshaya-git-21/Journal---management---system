-- ==========================================
-- Migration 0021: Publisher read access to editorial history
--
-- The Publisher workspace's post-publication screen shows the manuscript's
-- editor assignments, reviewer assignments, and revision history so a
-- Publisher can see the full editorial trail behind an article they just
-- published. None of these tables previously granted Publishers SELECT
-- access (only the author, the assigned editor, or a Coordinator could read
-- them), so those sections would silently return zero rows for a Publisher.
--
-- This grants read-only access, scoped to manuscripts already visible to
-- Publishers under manuscripts_select (status ACCEPTED/PUBLISHED and
-- production_stage set -- i.e. only after a Coordinator has handed the
-- manuscript to Publishers). Depends on: 0002_manuscripts_workflow.sql,
-- 0011_publisher_and_reasons.sql. Safe to re-run.
-- ==========================================

drop policy if exists "editor_assignments_select" on public.editor_assignments;
create policy "editor_assignments_select" on public.editor_assignments
  for select using (
    editor_id = auth.uid()
    or public.is_active_coordinator()
    or (public.is_active_publisher() and exists (
      select 1 from public.manuscripts m where m.id = manuscript_id
        and m.status in ('ACCEPTED', 'PUBLISHED') and m.production_stage is not null
    ))
  );

drop policy if exists "reviewer_assignments_select" on public.reviewer_assignments;
create policy "reviewer_assignments_select" on public.reviewer_assignments
  for select using (
    reviewer_id = auth.uid()
    or public.is_active_coordinator()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.assigned_editor_id = auth.uid())
    or (public.is_active_publisher() and exists (
      select 1 from public.manuscripts m where m.id = manuscript_id
        and m.status in ('ACCEPTED', 'PUBLISHED') and m.production_stage is not null
    ))
  );

drop policy if exists "revisions_select" on public.manuscript_revisions;
create policy "revisions_select" on public.manuscript_revisions
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
      or (public.is_active_publisher() and m.status in ('ACCEPTED', 'PUBLISHED') and m.production_stage is not null)
    ))
  );

drop policy if exists "status_history_select" on public.manuscript_status_history;
create policy "status_history_select" on public.manuscript_status_history
  for select using (
    exists (select 1 from public.manuscripts m where m.id = manuscript_id and (
      m.author_id = auth.uid() or m.assigned_editor_id = auth.uid() or public.is_active_coordinator()
      or (public.is_active_publisher() and m.status in ('ACCEPTED', 'PUBLISHED') and m.production_stage is not null)
    ))
  );
