-- ==========================================
-- Module 74: a Coordinator-facing "Send Correction to <GD Member>" nudge
-- button. Under Module 69, author_submit_corrections()/editor_review_proof()
-- already route a correction to the assigned GD Member automatically (no
-- Coordinator step required) -- this RPC does not change any routing or
-- production_status, it just re-sends the notification, for cases like "the
-- GD Member says they never saw it."
-- ==========================================

create or replace function public.coordinator_notify_gd_member(p_manuscript_id text, p_note text default null)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may notify the GD Member'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;

  perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
    'Corrections are waiting for you: ' || coalesce(m.title, p_manuscript_id), coalesce(p_note, ''));

  return p;
end;
$$;

revoke all on function public.coordinator_notify_gd_member(text, text) from public;
grant execute on function public.coordinator_notify_gd_member(text, text) to authenticated;
