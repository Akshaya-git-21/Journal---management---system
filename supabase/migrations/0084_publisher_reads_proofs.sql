-- ==========================================
-- Module 84: the Publisher's Publication Queue is supposed to auto-pull the
-- editorially-approved final proof (see PublisherWorkspace.tsx) instead of
-- asking for a manual re-upload -- but manuscript_proofs_select never
-- granted the assigned Publisher SELECT access (only Coordinator, the
-- assigned GD Member, the Author, and an invited Editor could read it), so
-- getProofs() silently returned zero rows for every Publisher and the
-- wizard fell back to the manual upload step every time.
-- ==========================================

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and public.is_gd_member_assigned_to(manuscript_id))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
    or (public.is_invited_editor_of(manuscript_id) and exists (
      select 1 from public.manuscript_production p where p.manuscript_id = manuscript_proofs.manuscript_id and p.sent_to_editor_at is not null
    ))
    or (public.is_active_publisher() and exists (
      select 1 from public.manuscripts m where m.id = manuscript_proofs.manuscript_id and m.assigned_publisher_id = auth.uid()
    ))
  );
