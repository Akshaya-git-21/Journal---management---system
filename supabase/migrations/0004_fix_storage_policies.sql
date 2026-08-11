-- ==========================================
-- Module 4: Fix Storage Policies
-- Allow authors to upload files with user.id prefix, then sync to manuscript_files table
-- ==========================================

-- Drop the restrictive manuscript ID path policy
drop policy if exists "manuscript_files_owner_write" on storage.objects;

-- Create a new policy that allows authenticated users to upload to their own user folder
-- Files uploaded to ${user.id}/... can later be synced to the manuscript_files table
create policy "manuscript_files_author_upload" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- Update the management policy to also use user.id prefix
drop policy if exists "manuscript_files_owner_manage" on storage.objects;

create policy "manuscript_files_author_manage" on storage.objects
  for update using (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- Delete policy for cleanup
create policy "manuscript_files_author_delete" on storage.objects
  for delete using (
    bucket_id = 'manuscript-files'
    and split_part(name, '/', 1) = auth.uid()::text
  );
