-- ONE-OFF DATA FIX -- not a versioned migration, run manually once.
--
-- This manuscript's Editor Decision (Revision 1 -> MINOR_REVISION) was
-- submitted before migration 0020 was applied, so it already skipped past
-- the new Coordinator confirmation gate: manuscript_revisions row #2 was
-- auto-created (empty, AWAITING_AUTHOR_UPLOAD, no files) and manuscripts
-- .status jumped straight to REVISION_REQUESTED, instead of stopping at
-- AWAITING_DECISION for the Coordinator to click "Send Back to Author for
-- Revision 2". This undoes that premature advance so the Coordinator sees
-- the confirm button. Revision 1's editor_decision/editor_comments/
-- editor_checklist (already stamped) are left untouched.
--
-- Adjust the manuscript id below if needed. Safe to run only while
-- revision #2 is still empty (no files uploaded) -- check first if unsure.

delete from public.manuscript_revisions
where manuscript_id = 'JMS-2026-PL7LN' and revision_number = 2 and status = 'AWAITING_AUTHOR_UPLOAD'
  and not exists (select 1 from public.manuscript_files where revision_id = manuscript_revisions.id);

update public.manuscript_revisions
set status = 'COMPLETED'
where manuscript_id = 'JMS-2026-PL7LN' and revision_number = 1;

update public.manuscripts
set status = 'AWAITING_DECISION', updated_at = timezone('utc', now())
where id = 'JMS-2026-PL7LN' and status = 'REVISION_REQUESTED';
