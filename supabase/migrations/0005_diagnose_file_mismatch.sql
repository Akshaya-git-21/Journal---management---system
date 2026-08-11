-- ==========================================
-- Diagnostic query to identify file mismatches
-- ==========================================

-- Check manuscript_files for JMS-2026-T8BC9
SELECT
  id,
  manuscript_id,
  file_name,
  file_type,
  file_size,
  storage_path,
  public_url,
  uploaded_at
FROM public.manuscript_files
WHERE manuscript_id = 'JMS-2026-T8BC9'
ORDER BY uploaded_at ASC;

-- This query will show:
-- 1. What files are stored for this manuscript
-- 2. Their storage paths
-- 3. Their public URLs
-- 4. The order they were uploaded
--
-- EXPECTED vs ACTUAL ANALYSIS:
-- If file_name, file_type, file_size don't match the public_url content,
-- it means the public_url is pointing to the wrong file in storage.
--
-- ROOT CAUSE: Either:
-- - The public_url was synced with wrong value
-- - The storage_path doesn't match public_url
-- - Files were mixed up during upload
