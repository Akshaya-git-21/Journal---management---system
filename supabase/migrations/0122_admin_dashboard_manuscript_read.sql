-- ==========================================
-- Module 122: Admin dashboard manuscript/reviewer read access
--
-- The Admin dashboard's "Pending Actions" and "Manuscript Workflow Overview"
-- widgets need to count manuscripts by status and reviewer_assignments by
-- status/due_date. Neither table has ever granted the Admin role read
-- access (manuscripts_select and reviewer_assignments_select only cover the
-- author/editor/reviewer/coordinator/publisher paths -- see 0085 and 0021),
-- so an Admin querying either table gets zero rows back under RLS. This adds
-- an additive "or is_active_admin()" read policy to both, mirroring how
-- 0116/0117 opened up profiles and activity_log for Admins. Nothing about
-- how any other role reads these tables changes.
--
-- Depends on: 0116 (is_active_admin), 0085 (manuscripts_select), 0021
-- (reviewer_assignments_select). Safe to re-run.
-- ==========================================

drop policy if exists "manuscripts_select_admin" on public.manuscripts;
create policy "manuscripts_select_admin" on public.manuscripts
  for select using (public.is_active_admin());

drop policy if exists "reviewer_assignments_select_admin" on public.reviewer_assignments;
create policy "reviewer_assignments_select_admin" on public.reviewer_assignments
  for select using (public.is_active_admin());

notify pgrst, 'reload schema';
