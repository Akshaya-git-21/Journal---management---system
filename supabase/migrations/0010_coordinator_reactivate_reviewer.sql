-- ==========================================
-- Module 10: Let a Coordinator resolve a pre-existing (but not currently
-- active REVIEWER) auth account into an active reviewer, for the case
-- where "Accept & Assign" on an editor suggestion hits an email that
-- already has an auth.users row -- e.g. from an earlier REJECTED
-- approval, or a stale/incomplete prior attempt -- so the normal signup
-- (which would fail with "already registered") can't be used, and
-- approve_user_role() intentionally only touches PENDING_APPROVAL rows.
--
-- This is deliberately narrower than approve_user_role(): it only ever
-- activates a profile whose *original requested_role* was REVIEWER, so it
-- cannot be used to silently promote an unrelated account (e.g. an
-- EDITOR or COORDINATOR signup) into a reviewer.
--
-- Depends on: 0001_profiles_rbac.sql, 0009_reviewer_account_on_accept.sql
-- Safe to re-run.
-- ==========================================

create or replace function public.coordinator_reactivate_reviewer(p_profile_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  updated public.profiles;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may activate reviewer accounts';
  end if;

  update public.profiles
  set
    role = 'REVIEWER',
    status = 'ACTIVE',
    approved_by = auth.uid(),
    approved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_profile_id and requested_role = 'REVIEWER'
  returning * into updated;

  if updated.id is null then
    raise exception 'No reviewer account request found for this profile';
  end if;

  return updated;
end;
$$;

revoke all on function public.coordinator_reactivate_reviewer(uuid) from public;
grant execute on function public.coordinator_reactivate_reviewer(uuid) to authenticated;
