-- ==========================================
-- Module 33 (Phase 2, Checkpoint C bug fix): reviewer_assignments has a
-- unique constraint named "unique_manuscript_reviewer" (added directly on
-- the live database at some point, not present in any migration file here)
-- that appears to be unique on (manuscript_id, reviewer_id) alone. That
-- blocked coordinator_send_revision_to_reviewers() (0031) from inserting a
-- second row for the same reviewer on the same manuscript for a later
-- revision_number -- found live while verifying Checkpoint C end-to-end.
--
-- Fix: scope the uniqueness to a round (manuscript_id, reviewer_id,
-- revision_number) instead -- still prevents two simultaneous assignments
-- for the same reviewer within one round, while allowing the same reviewer
-- to be re-invited for a later re-review round, which is exactly what the
-- reviewer re-review loop needs.
--
-- Depends on: 0031_reviewer_revision_loop.sql (adds revision_number).
-- Safe to re-run.
-- ==========================================

alter table public.reviewer_assignments drop constraint if exists unique_manuscript_reviewer;
alter table public.reviewer_assignments drop constraint if exists reviewer_assignments_manuscript_id_reviewer_id_key;
alter table public.reviewer_assignments drop constraint if exists unique_manuscript_reviewer_per_round;
alter table public.reviewer_assignments add constraint unique_manuscript_reviewer_per_round
  unique (manuscript_id, reviewer_id, revision_number);
