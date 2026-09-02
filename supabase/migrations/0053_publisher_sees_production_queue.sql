-- ==========================================
-- Module 53: Publisher visibility into the Production module.
--
-- New requirement: once a Coordinator assigns a GD Member (moving a
-- manuscript into the new Production module -- see
-- 0051_assign_gd_member.sql), it should immediately show up in the
-- Publisher's own Production Queue. Publisher already has full read access
-- to every ACCEPTED/PUBLISHED manuscript row (manuscripts_select, 0002) --
-- this just extends that same read-only visibility to the production
-- status/assignment metadata for those same rows, so the frontend can tell
-- "has a GD Member been assigned" without a new capability boundary (the
-- manuscript itself was already visible).
--
-- Deliberately SELECT-only, same as the GD Member grant in
-- 0050/0051/0052 -- Publisher gets no new write access anywhere.
-- ==========================================

drop policy if exists "manuscript_production_select" on public.manuscript_production;
create policy "manuscript_production_select" on public.manuscript_production
  for select using (
    public.is_active_coordinator()
    or public.is_active_publisher()
    or (public.is_active_gd_member() and assigned_to = auth.uid())
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );
