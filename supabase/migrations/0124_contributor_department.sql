-- ==========================================
-- Optional "Department" for each manuscript contributor (author), captured
-- next to Institutional Affiliation in the submission wizard's author form.
-- ==========================================

alter table public.manuscript_contributors add column if not exists department text not null default '';
