-- ==========================================
-- Module 55: GD Member-editable Production Checklist (Task 6).
--
-- Replaces the 11 copyediting checklist items seeded by start_production()
-- (0047_production_module.sql) with the new item set from the spec, and
-- gives the assigned GD Member their own write path onto
-- manuscript_production_checklist -- previously SELECT-only for that role
-- (0050/0052_gd_member_production_read_access.sql) -- distinct from the
-- Coordinator's existing update_checklist_item() (3-state PENDING/
-- IN_PROGRESS/COMPLETED cycle, still Coordinator-only, untouched).
--
-- Also adds gd_member_complete_checklist(): the "mark completed" gate --
-- refuses to advance the manuscript out of copyediting until every
-- checklist item is checked, callable only by the GD Member actually
-- assigned to that manuscript (is_gd_member_assigned_to(), from
-- 0052_fix_gd_member_rls_recursion.sql).
--
-- Depends on: 0047_production_module.sql, 0049_gd_member_role.sql,
-- 0051_assign_gd_member.sql, 0052_fix_gd_member_rls_recursion.sql.
-- Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. New checklist item set -- replaces the old 11 items everywhere
--    (both future start_production() calls and any manuscript already in
--    production). This is a genuine redefinition of what the checklist
--    tracks, not a rename, so existing checked/pending state is reset
--    rather than guessed at across a 1:1 remap that wouldn't be accurate.
-- ------------------------------------------

create or replace function public.start_production(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; p public.manuscript_production;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may start production'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'ACCEPTED' then raise exception 'Manuscript is not accepted yet (status=%)', m.status; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is not null and p.production_status <> 'NOT_STARTED' then
    raise exception 'Production has already started for this manuscript';
  end if;

  if p.manuscript_id is null then
    insert into public.manuscript_production (manuscript_id, production_status)
    values (p_manuscript_id, 'IN_PRODUCTION')
    returning * into p;
  else
    update public.manuscript_production
    set production_status = 'IN_PRODUCTION', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id
    returning * into p;
  end if;

  insert into public.manuscript_production_checklist (manuscript_id, item_key, item_label)
  values
    (p_manuscript_id, 'manuscript_file_checked', 'Manuscript file checked'),
    (p_manuscript_id, 'author_details_checked', 'Author details checked'),
    (p_manuscript_id, 'title_checked', 'Title checked'),
    (p_manuscript_id, 'abstract_checked', 'Abstract checked'),
    (p_manuscript_id, 'headings_checked', 'Headings checked'),
    (p_manuscript_id, 'tables_checked', 'Tables checked'),
    (p_manuscript_id, 'figures_checked', 'Figures checked'),
    (p_manuscript_id, 'references_checked', 'References checked'),
    (p_manuscript_id, 'journal_template_applied', 'Journal template applied'),
    (p_manuscript_id, 'page_layout_checked', 'Page layout checked'),
    (p_manuscript_id, 'final_formatting_checked', 'Final formatting checked')
  on conflict (manuscript_id, item_key) do nothing;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'IN_PRODUCTION', 'start_production');
  return p;
end;
$$;

revoke all on function public.start_production(text) from public;
grant execute on function public.start_production(text) to authenticated;

-- Reseed checklist items for manuscripts already in production under the
-- old item set -- delete the old rows (any in-progress checking state on
-- them doesn't carry meaning under the new items) and insert the new ones
-- at PENDING, same as a fresh start_production() call would.
do $$
declare mp record;
begin
  for mp in select manuscript_id from public.manuscript_production loop
    delete from public.manuscript_production_checklist where manuscript_id = mp.manuscript_id;
    insert into public.manuscript_production_checklist (manuscript_id, item_key, item_label)
    values
      (mp.manuscript_id, 'manuscript_file_checked', 'Manuscript file checked'),
      (mp.manuscript_id, 'author_details_checked', 'Author details checked'),
      (mp.manuscript_id, 'title_checked', 'Title checked'),
      (mp.manuscript_id, 'abstract_checked', 'Abstract checked'),
      (mp.manuscript_id, 'headings_checked', 'Headings checked'),
      (mp.manuscript_id, 'tables_checked', 'Tables checked'),
      (mp.manuscript_id, 'figures_checked', 'Figures checked'),
      (mp.manuscript_id, 'references_checked', 'References checked'),
      (mp.manuscript_id, 'journal_template_applied', 'Journal template applied'),
      (mp.manuscript_id, 'page_layout_checked', 'Page layout checked'),
      (mp.manuscript_id, 'final_formatting_checked', 'Final formatting checked')
    on conflict (manuscript_id, item_key) do nothing;
  end loop;
end $$;

-- ------------------------------------------
-- 2. GD Member write path: check/uncheck one item.
-- ------------------------------------------

create or replace function public.gd_member_set_checklist_item(p_manuscript_id text, p_item_key text, p_checked boolean)
returns public.manuscript_production_checklist language plpgsql security definer set search_path = public as $$
declare item public.manuscript_production_checklist; p public.manuscript_production; new_status text;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may update its checklist';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  new_status := case when p_checked then 'COMPLETED' else 'PENDING' end;

  update public.manuscript_production_checklist
  set status = new_status, updated_by = auth.uid(), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and item_key = p_item_key
  returning * into item;
  if item.id is null then raise exception 'Checklist item not found'; end if;

  if p.production_status = 'IN_PRODUCTION' and p_checked then
    update public.manuscript_production set production_status = 'COPYEDITING', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, 'IN_PRODUCTION', 'COPYEDITING', 'gd_member_set_checklist_item');
  end if;

  return item;
end;
$$;

revoke all on function public.gd_member_set_checklist_item(text, text, boolean) from public;
grant execute on function public.gd_member_set_checklist_item(text, text, boolean) to authenticated;

-- ------------------------------------------
-- 3. GD Member "mark completed" gate -- refuses unless every checklist
--    item is checked. Mirrors advance_production_stage(..., 'FORMATTING')'s
--    completeness check (0047), but is its own function since that one is
--    Coordinator-only and this needs the GD Member (assigned) check instead.
-- ------------------------------------------

create or replace function public.gd_member_complete_checklist(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; incomplete int; total int;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may mark its checklist complete';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('IN_PRODUCTION', 'COPYEDITING') then
    raise exception 'Checklist is not in an active state (status=%)', p.production_status;
  end if;

  select count(*) into total from public.manuscript_production_checklist where manuscript_id = p_manuscript_id;
  select count(*) into incomplete from public.manuscript_production_checklist
  where manuscript_id = p_manuscript_id and status <> 'COMPLETED';
  if total = 0 or incomplete > 0 then
    raise exception 'All checklist items must be checked before marking the manuscript complete (% of % remaining)', incomplete, total;
  end if;

  update public.manuscript_production set production_status = 'FORMATTING', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'COPYEDITING', 'FORMATTING', 'gd_member_complete_checklist',
    'GD Member marked the production checklist complete');

  return p;
end;
$$;

revoke all on function public.gd_member_complete_checklist(text) from public;
grant execute on function public.gd_member_complete_checklist(text) to authenticated;
