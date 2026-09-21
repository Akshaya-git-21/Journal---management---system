-- ==========================================
-- Module 115: Only Coordinators can permanently delete a manuscript
--
-- manuscripts has no DELETE policy, so Row Level Security already blocks a
-- direct DELETE from the API -- but it does so silently (0 rows affected) and
-- would stop protecting the table the moment someone adds a broad policy.
-- This removes the DELETE privilege itself from the API roles, so a direct
-- delete by an Author, Editor or Reviewer fails outright with "permission
-- denied".
--
-- The only way to delete a manuscript is public.coordinator_delete_manuscripts()
-- (0112): SECURITY DEFINER, and it raises unless the caller is an active
-- Coordinator. Its deletes (and the ON DELETE CASCADE clean-up of assignments,
-- reviews, revisions, notifications, files, production records...) run as the
-- table owner, so this REVOKE does not affect them.
--
-- Safe to re-run.
-- ==========================================

revoke delete on table public.manuscripts from anon, authenticated;

revoke all on function public.coordinator_delete_manuscripts(text[]) from public, anon;
grant execute on function public.coordinator_delete_manuscripts(text[]) to authenticated;

notify pgrst, 'reload schema';

-- Manual check (run in the SQL editor):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'manuscripts' and privilege_type = 'DELETE';
--   -> should return no rows for anon / authenticated.
