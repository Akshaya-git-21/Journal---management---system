-- ==========================================
-- ONE-TIME, DESTRUCTIVE. Run this exactly once, before 0002_manuscripts_workflow.sql,
-- and only the first time you set up Module 2.
--
-- The old prototype's `manuscripts` table used a plain TEXT author_id
-- ("auth_ada", "guest_123", ...) that never referenced a real account, and
-- its rows are exclusively the app's own auto-seeded demo data
-- (INITIAL_MANUSCRIPTS) -- there is no way to carry that forward into the
-- new author_id uuid references profiles(id) column, so the table is
-- dropped and recreated clean by 0002_manuscripts_workflow.sql instead.
--
-- Do NOT run this again after Module 2 is set up -- it will delete real
-- manuscript data. It's a separate file from 0002 specifically so 0002 can
-- stay safely re-runnable without ever repeating this drop.
-- ==========================================

drop table if exists public.manuscripts cascade;
