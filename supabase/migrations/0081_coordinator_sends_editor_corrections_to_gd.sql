-- ==========================================
-- Module 81: every other handoff in this workflow (Modules 75/76/78/79/80)
-- is a button on the Coordinator's Decision tab -- Module 77 was the one
-- exception, putting "Send to GD Member" on the Editor's own page instead.
-- Widen editor_send_corrections_to_gd() so the Coordinator can also click
-- it (the Editor still can too, unchanged), matching every other step.
-- ==========================================

create or replace function public.editor_send_corrections_to_gd(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not (public.is_invited_editor_of(p_manuscript_id) or public.is_active_coordinator()) then
    raise exception 'Only the assigned Editor or a Coordinator may send this to the GD Member';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'EDITOR_CORRECTIONS_PENDING_SEND' then
    raise exception 'No editorial corrections are pending to send (status=%)', p.production_status;
  end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  update public.manuscript_production
  set production_status = 'EDITOR_CORRECTIONS_REQUESTED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'EDITOR_CORRECTIONS_PENDING_SEND', 'EDITOR_CORRECTIONS_REQUESTED', 'editor_send_corrections_to_gd');

  perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
    'Editor requested corrections: ' || coalesce(m.title, p_manuscript_id), '');

  return p;
end;
$$;

revoke all on function public.editor_send_corrections_to_gd(text) from public;
grant execute on function public.editor_send_corrections_to_gd(text) to authenticated;
