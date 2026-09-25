-- ==========================================
-- Persist the "Article Type" the author picks in Step 1 of the submission
-- wizard (NewSubmissionFlow.tsx) so every role (Author, Coordinator, Editor,
-- Reviewer, Publisher, Admin) reads the same value from manuscripts.
-- ==========================================

alter table public.manuscripts add column if not exists manuscript_type text not null default '';

-- Extend the author's draft-editing column grant (see 0086) to include it.
revoke update on public.manuscripts from authenticated;
grant update (title, subtitle, abstract, "references", is_double_blind, cover_letter, language, manuscript_type, submission_step, editors_notes)
  on public.manuscripts to authenticated;
