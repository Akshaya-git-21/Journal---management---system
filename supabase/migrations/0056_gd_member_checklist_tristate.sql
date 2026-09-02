-- ==========================================
-- Module 56: restore the 3-state (PENDING / IN_PROGRESS / COMPLETED)
-- checklist cycle for the GD Member's own toggle.
--
-- 0055_gd_member_production_checklist.sql's gd_member_set_checklist_item()
-- only ever set PENDING or COMPLETED (a plain checkbox), which lost the
-- Coordinator's ability to see partial progress ("GD Member has started
-- this item but not finished it") -- the Coordinator's own
-- update_checklist_item() (0047) always supported all three states. This
-- replaces the boolean p_checked param with the same p_status text used by
-- the Coordinator's RPC, so both roles drive the exact same state machine;
-- only the permission check differs (is_gd_member_assigned_to() here vs
-- is_active_coordinator() there).
--
-- gd_member_complete_checklist()'s "every item must be COMPLETED" gate is
-- unchanged -- IN_PROGRESS still blocks it, same as before.
-- ==========================================

drop function if exists public.gd_member_set_checklist_item(text, text, boolean);

create or replace function public.gd_member_set_checklist_item(p_manuscript_id text, p_item_key text, p_status text)
returns public.manuscript_production_checklist language plpgsql security definer set search_path = public as $$
declare item public.manuscript_production_checklist; p public.manuscript_production;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may update its checklist';
  end if;
  if p_status not in ('PENDING','IN_PROGRESS','COMPLETED') then raise exception 'Invalid status'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  update public.manuscript_production_checklist
  set status = p_status, updated_by = auth.uid(), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and item_key = p_item_key
  returning * into item;
  if item.id is null then raise exception 'Checklist item not found'; end if;

  if p.production_status = 'IN_PRODUCTION' and p_status <> 'PENDING' then
    update public.manuscript_production set production_status = 'COPYEDITING', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, 'IN_PRODUCTION', 'COPYEDITING', 'gd_member_set_checklist_item');
  end if;

  return item;
end;
$$;

revoke all on function public.gd_member_set_checklist_item(text, text, text) from public;
grant execute on function public.gd_member_set_checklist_item(text, text, text) to authenticated;
