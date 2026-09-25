-- ==========================================
-- Store the full submission-wizard snapshot (every step's answers plus the
-- uploaded-file references) on the DRAFT manuscript row, so "Save Draft"
-- survives a cleared browser / different device and Resume restores steps
-- 1..N exactly as the author left them, files included. Previously this
-- lived only in the browser's localStorage.
-- ==========================================

alter table public.manuscripts add column if not exists draft_state jsonb;

revoke update on public.manuscripts from authenticated;
grant update (title, subtitle, abstract, "references", is_double_blind, cover_letter, language, manuscript_type, draft_state, submission_step, editors_notes)
  on public.manuscripts to authenticated;
