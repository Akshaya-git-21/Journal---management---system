-- ==========================================
-- Fix: Clean up corrupted file records
-- ==========================================
--
-- This migration removes file records where the public_url
-- doesn't match the actual storage content, allowing for
-- clean re-upload and re-sync.
--

-- Delete manuscript_files records for the affected manuscript
-- This will NOT delete the files from storage, only the database records
-- The files can then be re-uploaded and synced with correct public_urls
DELETE FROM public.manuscript_files
WHERE manuscript_id = 'JMS-2026-T8BC9'
AND revision_id IS NULL;

-- Verify deletion
-- SELECT COUNT(*) FROM public.manuscript_files WHERE manuscript_id = 'JMS-2026-T8BC9';
-- Should return 0 if deletion was successful

-- NEXT STEPS:
-- 1. In the application, the user should see "FILES 0 Uploaded"
-- 2. User can click "Upload" button to re-upload files
-- 3. Files will be uploaded to storage and synced with CORRECT public_urls
-- 4. File preview modal will then show CORRECT files
--
-- WHY THIS FIXES IT:
-- - Removes stale/corrupted public_url values
-- - Forces fresh upload/sync cycle
-- - Ensures public_url matches actual storage file
-- - Database will be in consistent state
