-- ==========================================
-- Module 15: Fix author revision-file upload/delete, which was silently
-- broken by RLS.
--
-- Bug: uploadRevisionFile() (src/lib/workflow.ts) inserts a manuscript_files
-- row with only revision_id/file_name/file_type/file_size/storage_path --
-- it never sets manuscript_id or uploaded_by. The existing insert policy
-- "files_insert_author" requires both:
--   uploaded_by = auth.uid()
--   exists (select 1 from manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
-- With manuscript_id left NULL, `m.id = NULL` never matches, so every
-- revision-file upload from the Author's revision UI has always been
-- rejected by RLS. There was also no DELETE policy at all, so a "Remove
-- file" action could never work either.
--
-- Fix: broaden the insert policy to also accept files identified purely by
-- revision_id (checked via manuscript_revisions -> manuscripts, since the
-- client now sets manuscript_id explicitly going forward but this covers
-- both cases), and add an author-scoped delete policy limited to files on
-- a revision that hasn't been submitted yet.
--
-- Depends on: 0002_manuscripts_workflow.sql. Safe to re-run.
-- ==========================================

drop policy if exists "files_insert_author" on public.manuscript_files;
create policy "files_insert_author" on public.manuscript_files
  for insert with check (
    uploaded_by = auth.uid()
    and (
      exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
      or exists (
        select 1 from public.manuscript_revisions r
        join public.manuscripts m on m.id = r.manuscript_id
        where r.id = revision_id and m.author_id = auth.uid()
      )
    )
  );

drop policy if exists "files_delete_author" on public.manuscript_files;
create policy "files_delete_author" on public.manuscript_files
  for delete using (
    uploaded_by = auth.uid()
    and (
      revision_id is null
      or exists (
        select 1 from public.manuscript_revisions r
        where r.id = revision_id and r.status = 'AWAITING_AUTHOR_UPLOAD'
      )
    )
  );
