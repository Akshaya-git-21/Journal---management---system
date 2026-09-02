-- ==========================================
-- Module 50: read-only Production access for GD Member.
--
-- Task 3 gives the GD Member role a Production-only sidebar (Production
-- Queue / Formatting / Proof Preparation / Corrections / Final Proof /
-- Ready for Publication / Published). For that to show real data, GD_MEMBER
-- needs SELECT on the manuscripts + Production-module tables it was
-- previously locked out of entirely (see 0049_gd_member_role.sql --
-- is_active_gd_member() existed but nothing read it yet).
--
-- Deliberately SELECT-only: every Production write still goes through the
-- RPCs in 0047_production_module.sql, every one of which still hard-checks
-- is_active_coordinator() and was NOT touched here -- a GD Member calling
-- start_production/advance_production_stage/etc. is still rejected
-- server-side. This migration only ever adds `or public.is_active_gd_member()`
-- to existing read policies -- no existing clause is removed or changed for
-- Coordinator/Author/Publisher, and no write grant is added anywhere.
--
-- Depends on: 0002_manuscripts_workflow.sql (manuscripts_select),
-- 0047_production_module.sql (manuscript_production* select policies),
-- 0049_gd_member_role.sql (is_active_gd_member()). Safe to re-run.
-- ==========================================

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED'))
    or (public.is_active_gd_member() and status in ('ACCEPTED','PUBLISHED'))
  );

drop policy if exists "manuscript_production_select" on public.manuscript_production;
create policy "manuscript_production_select" on public.manuscript_production
  for select using (
    public.is_active_coordinator()
    or public.is_active_gd_member()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_checklist_select" on public.manuscript_production_checklist;
create policy "manuscript_production_checklist_select" on public.manuscript_production_checklist
  for select using (
    public.is_active_coordinator()
    or public.is_active_gd_member()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or public.is_active_gd_member()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_corrections_select" on public.manuscript_production_corrections;
create policy "manuscript_production_corrections_select" on public.manuscript_production_corrections
  for select using (
    public.is_active_coordinator()
    or public.is_active_gd_member()
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );
