-- ==========================================
-- Module 58: Journal PDF Template (Task 7).
--
-- A single journal-wide file (not per-manuscript) that the Coordinator
-- uploads and both Coordinator and GD Member can view/download during
-- production. Stored in the existing manuscript-files bucket (already a
-- public-read bucket, see 0002_manuscripts_workflow.sql) under a new
-- `templates/` prefix, tracked in its own table rather than hard-coded --
-- uploading a replacement just becomes the new "current" template (most
-- recent row), with older ones kept for history/rollback.
-- ==========================================

create table if not exists public.journal_templates (id uuid primary key default gen_random_uuid());
alter table public.journal_templates add column if not exists file_name text not null default '';
alter table public.journal_templates add column if not exists storage_path text not null default '';
alter table public.journal_templates add column if not exists public_url text;
alter table public.journal_templates add column if not exists description text not null default '';
alter table public.journal_templates add column if not exists uploaded_by uuid references public.profiles(id);
alter table public.journal_templates add column if not exists uploaded_at timestamptz not null default timezone('utc', now());

create index if not exists idx_journal_templates_uploaded_at on public.journal_templates(uploaded_at desc);

alter table public.journal_templates enable row level security;

-- Coordinator and GD Member can both view/download every template
-- (current + history). No other role reads this table.
drop policy if exists "journal_templates_select" on public.journal_templates;
create policy "journal_templates_select" on public.journal_templates
  for select using (
    public.is_active_coordinator() or public.is_active_gd_member()
  );

-- Coordinator-only: uploading a new template is a journal-config action.
drop policy if exists "journal_templates_insert" on public.journal_templates;
create policy "journal_templates_insert" on public.journal_templates
  for insert with check (
    public.is_active_coordinator() and uploaded_by = auth.uid()
  );

drop policy if exists "journal_templates_delete" on public.journal_templates;
create policy "journal_templates_delete" on public.journal_templates
  for delete using (public.is_active_coordinator());

-- Storage: Coordinator may upload into manuscript-files under templates/...
-- (the bucket's existing public-read policy already covers downloads for
-- everyone, same as every other file in it -- see manuscript_files_public_read
-- in 0002_manuscripts_workflow.sql).
drop policy if exists "journal_templates_storage_write" on storage.objects;
create policy "journal_templates_storage_write" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = 'templates'
    and public.is_active_coordinator()
  );

drop policy if exists "journal_templates_storage_delete" on storage.objects;
create policy "journal_templates_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = 'templates'
    and public.is_active_coordinator()
  );
