-- ==========================================
-- Fix ensure_author_profile().
--
-- 1. It failed on every call with: column reference "id" is ambiguous. The
--    function returns table(id, role, status), which makes plpgsql treat
--    id/role/status as variables that clash with the profiles columns used in
--    ON CONFLICT (id). '#variable_conflict use_column' makes every bare name
--    mean the table column.
-- 2. Even once it ran, the old ON CONFLICT ... DO UPDATE forced role='AUTHOR'
--    and status='ACTIVE' on an EXISTING profile -- it would have silently
--    demoted an Editor/Coordinator or re-activated an INACTIVE/DELETED user.
--    It now only creates the profile when it is missing and never changes an
--    existing one.
-- Same signature and return shape as before, so callers are unaffected.
-- ==========================================

create or replace function public.ensure_author_profile()
returns table(id uuid, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_user_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select email, raw_user_meta_data->>'full_name'
  into v_user_email, v_user_name
  from auth.users where auth.users.id = v_user_id;

  insert into public.profiles (id, email, name, role, requested_role, status, metadata)
  values (
    v_user_id,
    coalesce(v_user_email, ''),
    coalesce(v_user_name, split_part(coalesce(v_user_email, 'author'), '@', 1)),
    'AUTHOR',
    'AUTHOR',
    'ACTIVE',
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  return query select p.id, p.role, p.status from public.profiles p where p.id = v_user_id;
end;
$$;

grant execute on function public.ensure_author_profile() to authenticated;
