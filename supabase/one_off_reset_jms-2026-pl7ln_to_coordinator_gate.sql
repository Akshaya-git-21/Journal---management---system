-- ONE-OFF DATA FIX -- not a versioned migration, run manually once.
--
-- This specific manuscript's Revision 1 was submitted before migration
-- 0018 was applied, so it already skipped past the new Coordinator gate
-- (manuscripts.status went straight to EDITOR_REVIEW instead of stopping at
-- REVISION_REQUESTED with the revision marked REVISION_SUBMITTED). This
-- resets it back to the correct "awaiting coordinator review" state purely
-- so the new "Send to Editor for Revision Review" button can be exercised.
--
-- Adjust the manuscript id below if needed.

update public.manuscript_revisions
set status = 'REVISION_SUBMITTED'
where manuscript_id = 'JMS-2026-PL7LN' and revision_number = 1 and status = 'REVISION_SUBMITTED';

update public.manuscripts
set status = 'REVISION_REQUESTED', updated_at = timezone('utc', now())
where id = 'JMS-2026-PL7LN' and status = 'EDITOR_REVIEW';
