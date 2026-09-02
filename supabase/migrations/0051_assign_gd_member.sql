-- ==========================================
-- Module 51: Assign GD Member to a manuscript's production.
--
-- Task 4: the Coordinator picks one GD Member to own a manuscript's
-- production work. Reuses manuscript_production.assigned_to (already
-- present since 0047_production_module.sql, previously just auto-set to
-- whichever Coordinator called start_production) -- this migration adds the
-- actual assignment RPC and, critically, narrows GD Member visibility from
-- "every manuscript in production" (0050_gd_member_production_read_access.sql)
-- down to "only manuscripts assigned to me" per Task 4's requirement ("GD
-- Member sees only manuscripts assigned to them").
--
-- Depends on: 0047_production_module.sql, 0049_gd_member_role.sql,
-- 0050_gd_member_production_read_access.sql. Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 0. start_production() no longer auto-assigns manuscript_production.
--    assigned_to to the calling Coordinator's own id -- that field now means
--    "the GD Member handling this manuscript" (assign_gd_member() below),
--    not "who started production" (which is already captured in
--    manuscript_status_history/audit_log via _record_transition's actor_id).
--    Leaving it null until a Coordinator explicitly assigns someone also
--    keeps the new GD Member visibility RLS correct: a manuscript is
--    invisible to every GD Member until assigned, never accidentally
--    "visible to whichever Coordinator happened to click Move to Production".
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
    (p_manuscript_id, 'grammar_spelling', 'Grammar & Spelling'),
    (p_manuscript_id, 'language_corrections', 'Language Corrections'),
    (p_manuscript_id, 'formatting', 'Formatting'),
    (p_manuscript_id, 'journal_template_formatting', 'Journal Template Formatting'),
    (p_manuscript_id, 'references_checking', 'References Checking'),
    (p_manuscript_id, 'figures_placement', 'Figures Placement'),
    (p_manuscript_id, 'tables_placement', 'Tables Placement'),
    (p_manuscript_id, 'captions_legends', 'Captions / Legends'),
    (p_manuscript_id, 'author_names_affiliations', 'Author Names & Affiliations'),
    (p_manuscript_id, 'metadata_verification', 'Metadata Verification'),
    (p_manuscript_id, 'doi_metadata_prep', 'DOI / Article Metadata Preparation')
  on conflict (manuscript_id, item_key) do nothing;

  perform public._record_transition(p_manuscript_id, 'ACCEPTED', 'IN_PRODUCTION', 'start_production');
  return p;
end;
$$;

revoke all on function public.start_production(text) from public;
grant execute on function public.start_production(text) to authenticated;

-- ------------------------------------------
-- 1. RPC
-- ------------------------------------------

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
  set assigned_to = p_gd_member_id, updated_at = timezone('utc', now())
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

-- ------------------------------------------
-- 2. RLS -- narrow GD Member visibility to assigned manuscripts only.
--    (Coordinator/Author visibility is unchanged in every policy below.)
-- ------------------------------------------

drop policy if exists "manuscripts_select" on public.manuscripts;
create policy "manuscripts_select" on public.manuscripts
  for select using (
    author_id = auth.uid()
    or assigned_editor_id = auth.uid()
    or public.is_invited_editor_of(id)
    or public.is_reviewer_of(id)
    or public.is_active_coordinator()
    or (public.is_active_publisher() and status in ('ACCEPTED','PUBLISHED'))
    or (public.is_active_gd_member() and exists (
      select 1 from public.manuscript_production mp where mp.manuscript_id = manuscripts.id and mp.assigned_to = auth.uid()
    ))
  );

drop policy if exists "manuscript_production_select" on public.manuscript_production;
create policy "manuscript_production_select" on public.manuscript_production
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and assigned_to = auth.uid())
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_checklist_select" on public.manuscript_production_checklist;
create policy "manuscript_production_checklist_select" on public.manuscript_production_checklist
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and exists (
      select 1 from public.manuscript_production mp where mp.manuscript_id = manuscript_production_checklist.manuscript_id and mp.assigned_to = auth.uid()
    ))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_proofs_select" on public.manuscript_proofs;
create policy "manuscript_proofs_select" on public.manuscript_proofs
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and exists (
      select 1 from public.manuscript_production mp where mp.manuscript_id = manuscript_proofs.manuscript_id and mp.assigned_to = auth.uid()
    ))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );

drop policy if exists "manuscript_production_corrections_select" on public.manuscript_production_corrections;
create policy "manuscript_production_corrections_select" on public.manuscript_production_corrections
  for select using (
    public.is_active_coordinator()
    or (public.is_active_gd_member() and exists (
      select 1 from public.manuscript_production mp where mp.manuscript_id = manuscript_production_corrections.manuscript_id and mp.assigned_to = auth.uid()
    ))
    or exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.author_id = auth.uid())
  );
