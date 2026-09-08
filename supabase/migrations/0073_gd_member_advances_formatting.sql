-- ==========================================
-- Module 73: the assigned GD Member (not just the Coordinator) may advance
-- COPYEDITING -> FORMATTING -> TYPESETTING. Everything else in this
-- workflow (accept assignment, choose template, checklist, proof upload)
-- is already the GD Member's own self-service action -- Formatting was the
-- one remaining Coordinator-only gate blocking them from ever reaching
-- Typesetting (and therefore Proof Preparation) on their own.
-- ==========================================

create or replace function public.advance_production_stage(p_manuscript_id text, p_to_stage text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; incomplete int;
begin
  if not (public.is_active_coordinator() or (public.is_active_gd_member() and public.is_gd_member_assigned_to(p_manuscript_id))) then
    raise exception 'Only a Coordinator or the assigned GD Member may advance the production stage';
  end if;
  if p_to_stage not in ('FORMATTING','TYPESETTING') then raise exception 'Invalid target stage'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p_to_stage = 'FORMATTING' then
    if p.production_status <> 'COPYEDITING' then raise exception 'Manuscript is not in Copyediting (status=%)', p.production_status; end if;
    select count(*) into incomplete from public.manuscript_production_checklist
    where manuscript_id = p_manuscript_id and status <> 'COMPLETED';
    if incomplete > 0 then raise exception 'All copyediting checklist items must be completed first'; end if;
  elsif p_to_stage = 'TYPESETTING' then
    if p.production_status <> 'FORMATTING' then raise exception 'Manuscript is not in Formatting (status=%)', p.production_status; end if;
  end if;

  update public.manuscript_production set production_status = p_to_stage, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, p.production_status, p_to_stage, 'advance_production_stage');
  return p;
end;
$$;

revoke all on function public.advance_production_stage(text, text) from public;
grant execute on function public.advance_production_stage(text, text) to authenticated;
