-- ==========================================
-- Module 54: track when a GD Member was assigned, for Task 5's Production
-- Queue "Assigned date" column.
--
-- manuscript_production.updated_at is bumped by every later production
-- action (checklist updates, proof generation, ...), so it can't be reused
-- as "when was this GD Member assigned" -- that needs its own column, set
-- only by assign_gd_member().
-- ==========================================

alter table public.manuscript_production add column if not exists assigned_at timestamptz;

create or replace function public.assign_gd_member(p_manuscript_id text, p_gd_member_id uuid)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; target public.profiles; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may assign a GD Member'; end if;

  select * into target from public.profiles where id = p_gd_member_id;
  if target.id is null or target.role is distinct from 'GD_MEMBER' or target.status is distinct from 'ACTIVE' then
    raise exception 'Target is not an active GD Member';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production
  set assigned_to = p_gd_member_id, assigned_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;

  perform public._record_transition(p_manuscript_id, p.production_status, p.production_status, 'assign_gd_member',
    'Assigned GD Member: ' || target.name);
  perform public._notify(p_gd_member_id, 'GD_MEMBER_ASSIGNED', p_manuscript_id,
    'You were assigned to a manuscript in production: ' || coalesce(m.title, p_manuscript_id), '');

  return p;
end;
$$;

revoke all on function public.assign_gd_member(text, uuid) from public;
grant execute on function public.assign_gd_member(text, uuid) to authenticated;
