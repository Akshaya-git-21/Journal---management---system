-- ==========================================
-- Optional "Department" for author-suggested reviewers, captured in the
-- "Add Peer Recommendation Row" form of the submission wizard.
-- ==========================================

alter table public.manuscript_suggested_reviewers add column if not exists department text not null default '';
