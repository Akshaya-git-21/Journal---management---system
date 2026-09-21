-- ==========================================
-- Module 113: INACTIVE and DELETED profile statuses
--
-- INACTIVE: a Coordinator switched the member off in the Edit form. They
--           cannot sign in ("Account is deactivated") until set Active again.
-- DELETED:  a member the Coordinator deleted but who has workflow history
--           (manuscripts, assignments...) and so cannot be erased from the
--           database. They cannot sign in ("Account not exists").
--
-- Safe to re-run.
-- ==========================================

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('ACTIVE','PENDING_APPROVAL','REJECTED','INACTIVE','DELETED'));

notify pgrst, 'reload schema';
