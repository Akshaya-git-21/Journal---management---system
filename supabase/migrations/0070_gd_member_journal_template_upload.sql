-- ==========================================
-- Module 70: allow the GD Member (not just the Coordinator) to
-- upload/replace/delete the journal-wide PDF template (0058). The
-- Coordinator's own access is unchanged; this only widens the same four
-- policies to also accept an active GD Member.
-- ==========================================

drop policy if exists "journal_templates_insert" on public.journal_templates;
create policy "journal_templates_insert" on public.journal_templates
  for insert with check (
    (public.is_active_coordinator() or public.is_active_gd_member()) and uploaded_by = auth.uid()
  );

drop policy if exists "journal_templates_delete" on public.journal_templates;
create policy "journal_templates_delete" on public.journal_templates
  for delete using (public.is_active_coordinator() or public.is_active_gd_member());

drop policy if exists "journal_templates_storage_write" on storage.objects;
create policy "journal_templates_storage_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = 'templates'
    and (public.is_active_coordinator() or public.is_active_gd_member())
  );

drop policy if exists "journal_templates_storage_delete" on storage.objects;
create policy "journal_templates_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = 'templates'
    and (public.is_active_coordinator() or public.is_active_gd_member())
  );
