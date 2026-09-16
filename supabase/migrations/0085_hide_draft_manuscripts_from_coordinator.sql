-- ==========================================
-- Module 85: Hide DRAFT manuscripts from Coordinators
--
-- manuscripts_select (0002_manuscripts_workflow.sql) granted coordinators
-- read access to every manuscript regardless of status, including DRAFT --
-- an author's own unsubmitted, in-progress submission (created as soon as
-- the author clicks "Save Draft", before they ever click Submit). That let
-- a Coordinator see a manuscript that hasn't actually entered the
-- editorial workflow yet. Coordinators should only see a manuscript once
-- its status has moved past DRAFT.
--
-- Safe to re-run.
-- ==========================================

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or (public.is_active_coordinator() and status != 'DRAFT')
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED'))
  );
