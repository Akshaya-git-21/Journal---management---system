-- ==========================================
-- Persist the "Subtitle (Optional)" field the author fills in on Step 3
-- of the submission wizard (NewSubmissionFlow.tsx) -- it was previously
-- only kept in the browser's local draft cache and never sent to the
-- server, so every downstream view (e.g. the Editor's "Editorial
-- Assignment" invite modal) always showed "Not provided".
-- ==========================================

alter table public.manuscripts add column if not exists subtitle text not null default '';

-- Extend the author's draft-editing column grant (see
-- 0002_manuscripts_workflow.sql) to include subtitle, same as title/abstract.
revoke update on public.manuscripts from authenticated;
grant update (title, subtitle, abstract, "references", is_double_blind, cover_letter, language, submission_step, editors_notes)
  on public.manuscripts to authenticated;
