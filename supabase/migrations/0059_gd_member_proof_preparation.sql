-- ==========================================
-- Module 59: GD Member Proof Preparation stage (Task 9).
--
-- Previously, generate_proof()/send_proof_to_author() (0047) were entirely
-- Coordinator-driven: Coordinator uploads a proof, Coordinator sends it to
-- the author, in one continuous flow. Task 9 inserts a GD-Member-owned
-- drafting step in between: once TYPESETTING is done, the assigned GD
-- Member uploads/replaces the proof PDF, adds notes, completes a Proof
-- Checklist (separate from the copyediting checklist, 0055/0056), and
-- explicitly submits it -- the manuscript then shows up in the
-- Coordinator's Production workspace as PROOF_SUBMITTED_TO_COORDINATOR,
-- who reviews and (unchanged) sends it on to the author.
--
-- Depends on: 0047_production_module.sql, 0051_assign_gd_member.sql,
-- 0052_fix_gd_member_rls_recursion.sql, 0055/0056 (checklist). Safe to re-run.
-- ==========================================

-- ------------------------------------------
-- 1. Schema: new production_status value, checklist stage, proof notes.
-- ------------------------------------------

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SUBMITTED_TO_COORDINATOR','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED'
  ));

-- Distinguishes the existing 11-item copyediting checklist (0055) from the
-- new proof checklist below -- same table, same RLS, same GD Member RPC
-- (gd_member_set_checklist_item doesn't care which stage an item belongs
-- to), just a tag so each UI section only shows its own items.
alter table public.manuscript_production_checklist add column if not exists stage text not null default 'COPYEDITING';
alter table public.manuscript_production_checklist drop constraint if exists manuscript_production_checklist_stage_check;
alter table public.manuscript_production_checklist add constraint manuscript_production_checklist_stage_check
  check (stage in ('COPYEDITING','PROOF'));

alter table public.manuscript_proofs add column if not exists gd_notes text not null default '';

-- ------------------------------------------
-- 2. Storage: the assigned GD Member may upload into
--    ${manuscript_id}/production/proofs/... (previously Coordinator-only,
--    see manuscript_files_production_module_write in 0047).
-- ------------------------------------------

drop policy if exists "gd_member_proof_upload" on storage.objects;
create policy "gd_member_proof_upload" on storage.objects
  for insert with check (
    bucket_id = 'manuscript-files'
    and name like '%/production/proofs/%'
    and public.is_active_gd_member()
    and public.is_gd_member_assigned_to(split_part(name, '/', 1))
  );

-- ------------------------------------------
-- 3. RPCs
-- ------------------------------------------

-- Upload or replace the proof PDF while drafting (status TYPESETTING or
-- already PROOF_GENERATED -- i.e. not yet submitted to the Coordinator).
create or replace function public.gd_member_upload_proof(p_manuscript_id text, p_storage_path text, p_public_url text, p_file_name text)
returns public.manuscript_proofs language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; proof public.manuscript_proofs; next_version int; prior_status text;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may upload its proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('TYPESETTING','PROOF_GENERATED') then
    raise exception 'Manuscript is not ready for proof preparation (status=%)', p.production_status;
  end if;
  prior_status := p.production_status;

  next_version := p.current_proof_version + 1;

  insert into public.manuscript_proofs (manuscript_id, version, file_name, storage_path, public_url, uploaded_by)
  values (p_manuscript_id, next_version, p_file_name, p_storage_path, p_public_url, auth.uid())
  returning * into proof;

  update public.manuscript_production
  set current_proof_version = next_version, production_status = 'PROOF_GENERATED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;

  -- Seed the Proof Checklist the first time a proof is drafted for this
  -- manuscript (mirrors start_production()'s copyediting checklist seed).
  insert into public.manuscript_production_checklist (manuscript_id, item_key, item_label, stage)
  values
    (p_manuscript_id, 'proof_matches_manuscript', 'Proof matches the approved manuscript', 'PROOF'),
    (p_manuscript_id, 'proof_page_numbering', 'Page numbering is correct', 'PROOF'),
    (p_manuscript_id, 'proof_headers_footers', 'Headers and footers are correct', 'PROOF'),
    (p_manuscript_id, 'proof_figures_tables', 'All figures and tables render correctly', 'PROOF'),
    (p_manuscript_id, 'proof_fonts_embedded', 'Fonts are embedded correctly', 'PROOF'),
    (p_manuscript_id, 'proof_no_formatting_errors', 'No formatting errors remain', 'PROOF')
  on conflict (manuscript_id, item_key) do nothing;

  perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_GENERATED', 'gd_member_upload_proof',
    'GD Member uploaded Proof v' || next_version);

  return proof;
end;
$$;

revoke all on function public.gd_member_upload_proof(text, text, text, text) from public;
grant execute on function public.gd_member_upload_proof(text, text, text, text) to authenticated;

-- Draft notes on the current proof version. "Save Draft" in the UI.
create or replace function public.gd_member_set_proof_notes(p_manuscript_id text, p_notes text)
returns public.manuscript_proofs language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; proof public.manuscript_proofs;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may edit its proof notes';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id;
  if p.manuscript_id is null or p.current_proof_version = 0 then
    raise exception 'Upload a proof PDF before adding notes';
  end if;

  update public.manuscript_proofs
  set gd_notes = p_notes
  where manuscript_id = p_manuscript_id and version = p.current_proof_version
  returning * into proof;

  return proof;
end;
$$;

revoke all on function public.gd_member_set_proof_notes(text, text) from public;
grant execute on function public.gd_member_set_proof_notes(text, text) to authenticated;

-- "Submit Proof to Coordinator" -- refuses unless a proof exists and every
-- Proof Checklist item is checked (same gate style as
-- gd_member_complete_checklist() in 0055).
create or replace function public.gd_member_submit_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; incomplete int; total int; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may submit its proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_GENERATED' then
    raise exception 'No prepared proof to submit (status=%)', p.production_status;
  end if;
  if p.current_proof_version = 0 then raise exception 'Upload a proof PDF before submitting'; end if;

  select count(*) into total from public.manuscript_production_checklist where manuscript_id = p_manuscript_id and stage = 'PROOF';
  select count(*) into incomplete from public.manuscript_production_checklist where manuscript_id = p_manuscript_id and stage = 'PROOF' and status <> 'COMPLETED';
  if total = 0 or incomplete > 0 then
    raise exception 'All proof checklist items must be checked before submitting (% of % remaining)', incomplete, total;
  end if;

  update public.manuscript_production set production_status = 'PROOF_SUBMITTED_TO_COORDINATOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'PROOF_GENERATED', 'PROOF_SUBMITTED_TO_COORDINATOR', 'gd_member_submit_proof',
    'GD Member submitted Proof v' || p.current_proof_version || ' to the Coordinator');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'PROOF_SUBMITTED', p_manuscript_id, 'Proof submitted for review: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.gd_member_submit_proof(text) from public;
grant execute on function public.gd_member_submit_proof(text) to authenticated;

-- ------------------------------------------
-- 4. send_proof_to_author(): accept the new status too, so the
--    Coordinator's existing "send to author" action still works once a GD
--    Member has submitted a proof (previously only PROOF_GENERATED/
--    PROOF_UPDATED). No other behavior changed.
-- ------------------------------------------

create or replace function public.send_proof_to_author(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; prior_status text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Author'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('PROOF_GENERATED','PROOF_UPDATED','PROOF_SUBMITTED_TO_COORDINATOR') then
    raise exception 'No new proof to send (status=%)', p.production_status;
  end if;
  prior_status := p.production_status;

  update public.manuscript_proofs set sent_to_author_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'PROOF_SENT_TO_AUTHOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_AUTHOR', 'send_proof_to_author',
    'Proof v' || p.current_proof_version || ' sent to author');
  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'Your final proof is ready: ' || m.title, 'Proof v' || p.current_proof_version || ' is ready for your review.');

  return p;
end;
$$;

revoke all on function public.send_proof_to_author(text) from public;
grant execute on function public.send_proof_to_author(text) to authenticated;
