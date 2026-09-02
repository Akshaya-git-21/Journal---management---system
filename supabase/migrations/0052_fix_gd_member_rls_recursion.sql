-- ==========================================
-- Module 52: fix infinite RLS recursion introduced by 0051.
--
-- 0051_assign_gd_member.sql's manuscripts_select clause for GD Member did a
-- raw `exists (select 1 from manuscript_production ...)` subquery. A plain
-- subquery inside a policy runs AS THE QUERYING ROLE, so it re-triggers
-- manuscript_production's own RLS -- which in turn does
-- `exists (select 1 from manuscripts ...)` for the Author clause, which
-- re-triggers manuscripts_select again: manuscripts -> manuscript_production
-- -> manuscripts -> ... infinite recursion (confirmed live: both tables
-- errored with "infinite recursion detected in policy for relation ...").
--
-- Fix: match the codebase's existing pattern for every other cross-table RLS
-- check (is_reviewer_of, is_invited_editor_of, is_active_coordinator, ...:
-- all SECURITY DEFINER). A SECURITY DEFINER function's internal queries run
-- as the function owner, which bypasses RLS on the tables it touches --
-- calling it from inside a policy does NOT re-trigger that table's own
-- policies, breaking the cycle.
-- ==========================================

create or replace function public.is_gd_member_assigned_to(p_manuscript_id text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.manuscript_production
    where manuscript_id = p_manuscript_id and assigned_to = auth.uid()
  );
$$;

revoke all on function public.is_gd_member_assigned_to(text) from public;
grant execute on function public.is_gd_member_assigned_to(text) to authenticated;

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED'))
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(id))
  );

drop policy if exists "manuscript_production_checklist_select" on public.manuscript_production_checklist;
create policy "manuscript_production_checklist_select" on public.manuscript_production_checklist
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_corrections_select" on public.manuscript_production_corrections;
create policy "manuscript_production_corrections_select" on public.manuscript_production_corrections
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );
