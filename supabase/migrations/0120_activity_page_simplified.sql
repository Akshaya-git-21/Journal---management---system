-- ==========================================
-- Module 120: Simplify the Activity page
--
-- Two changes, both scoped to the Activity page only (nothing about the
-- Access page's own behavior changes):
--
-- 1. admin_activity_search() now always excludes the 'access_control'
--    category (permission changes made from the Access page) -- the Admin
--    asked for the Activity page to stay about people and what they did, not
--    about permission bookkeeping.
-- 2. A new admin_user_activity_summary() RPC gives one row per person with
--    their last sign-in and last activity timestamp, so the page can show
--    "last login" and an "Active now" indicator without the person having to
--    build that up from the raw log themselves.
--
-- Depends on: 0117 (activity_log, admin_activity_search), 0116 (is_active_admin).
-- Safe to re-run.
-- ==========================================

create or replace function public.admin_activity_search(
  p_role text default null,
  p_category text default null,
  p_action text default null,
  p_person text default null,
  p_manuscript text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_q text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns setof public.activity_log
language sql
stable
security invoker
set search_path = public
as $$
  select a.*
  from public.activity_log a
  where public.is_active_admin()
    and a.category is distinct from 'access_control'
    and (nullif(p_role, '') is null or a.actor_role = p_role)
    and (nullif(p_category, '') is null or a.category = p_category)
    and (nullif(p_action, '') is null or a.action = p_action)
    and (nullif(p_person, '') is null
         or a.actor_name ilike public._like_pattern(p_person) or a.actor_email ilike public._like_pattern(p_person)
         or a.target_name ilike public._like_pattern(p_person) or a.target_email ilike public._like_pattern(p_person))
    and (nullif(p_manuscript, '') is null
         or a.manuscript_id ilike public._like_pattern(p_manuscript) or a.manuscript_title ilike public._like_pattern(p_manuscript))
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at < p_to)
    and (nullif(p_q, '') is null
         or (coalesce(a.action, '') || ' ' || coalesce(a.actor_name, '') || ' ' || coalesce(a.actor_email, '') || ' ' ||
             coalesce(a.target_name, '') || ' ' || coalesce(a.target_email, '') || ' ' || coalesce(a.manuscript_id, '') || ' ' ||
             coalesce(a.manuscript_title, '') || ' ' || a.details::text) ilike public._like_pattern(p_q))
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_activity_search(text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.admin_activity_search(text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;

-- Postgres won't let CREATE OR REPLACE change a function's return columns,
-- and an earlier run of this file created a narrower version -- drop it first.
drop function if exists public.admin_user_activity_summary();

create or replace function public.admin_user_activity_summary()
returns table(
  user_id uuid, name text, email text, role text, status text,
  last_sign_in_at timestamptz, last_activity_at timestamptz,
  last_action text, last_category text, last_target_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, coalesce(p.role, p.requested_role), p.status,
    si.created_at, la.created_at, la.action, la.category, la.target_role
  from public.profiles p
  left join lateral (
    select created_at from public.activity_log a
    where a.actor_id = p.id and a.action = 'sign_in'
    order by created_at desc limit 1
  ) si on true
  left join lateral (
    select created_at, action, category, target_role from public.activity_log a
    where a.actor_id = p.id and a.category is distinct from 'access_control'
    order by created_at desc limit 1
  ) la on true
  where public.is_active_admin() and p.status in ('ACTIVE', 'INACTIVE')
  order by p.name;
$$;

revoke all on function public.admin_user_activity_summary() from public;
grant execute on function public.admin_user_activity_summary() to authenticated;

notify pgrst, 'reload schema';
