-- ==========================================
-- Module 64: Task 15 -- GD Member performs the actual corrections work.
--
-- Once the Coordinator hands a manuscript back via
-- coordinator_send_for_corrections() (0063, production_status =
-- CORRECTIONS_IN_PROGRESS), the GD Member uploads a corrected proof PDF,
-- can replace it and add notes while drafting, works through a dedicated
-- Correction Checklist, then explicitly submits --
-- CORRECTIONS_IN_PROGRESS -> FINAL_PROOF_READY. Mirrors the Proof
-- Preparation stage (0059/Task 9) shape exactly, just scoped to the
-- corrections stage instead of the original proof draft.
-- ==========================================

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED',
    'CORRECTIONS_IN_PROGRESS','PROOF_SUBMITTED_TO_COORDINATOR','FINAL_PROOF_READY'
  ));

alter table public.manuscript_production_checklist drop constraint if exists manuscript_production_checklist_stage_check;
alter table public.manuscript_production_checklist add constraint manuscript_production_checklist_stage_check
  check (stage in ('COPYEDITING','PROOF','CORRECTION'));

-- Upload or replace the corrected proof PDF while drafting (status
-- CORRECTIONS_IN_PROGRESS only -- once submitted this becomes read-only,
-- same convention as gd_member_upload_proof()).
create or replace function public.gd_member_upload_corrected_proof(p_manuscript_id text, p_storage_path text, p_public_url text, p_file_name text)
returns public.manuscript_proofs language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; proof public.manuscript_proofs; next_version int;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may upload a corrected proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'CORRECTIONS_IN_PROGRESS' then
    raise exception 'Manuscript is not awaiting corrections (status=%)', p.production_status;
  end if;

  next_version := p.current_proof_version + 1;

  insert into public.manuscript_proofs (manuscript_id, version, file_name, storage_path, public_url, uploaded_by)
  values (p_manuscript_id, next_version, p_file_name, p_storage_path, p_public_url, auth.uid())
  returning * into proof;

  update public.manuscript_production
  set current_proof_version = next_version, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id;

  -- Seed the Correction Checklist the first time a corrected proof is
  -- drafted for this manuscript (mirrors the Proof Checklist seed in 0059).
  insert into public.manuscript_production_checklist (manuscript_id, item_key, item_label, stage)
  values
    (p_manuscript_id, 'correction_author_comments_addressed', 'Author comments addressed', 'CORRECTION'),
    (p_manuscript_id, 'correction_editor_comments_addressed', 'Editor comments addressed', 'CORRECTION'),
    (p_manuscript_id, 'correction_all_changes_applied', 'All requested corrections applied', 'CORRECTION'),
    (p_manuscript_id, 'correction_formatting_intact', 'Formatting still intact after edits', 'CORRECTION'),
    (p_manuscript_id, 'correction_no_new_errors', 'Proof re-checked for new errors', 'CORRECTION')
  on conflict (manuscript_id, item_key) do nothing;

  perform public._record_transition(p_manuscript_id, 'CORRECTIONS_IN_PROGRESS', 'CORRECTIONS_IN_PROGRESS', 'gd_member_upload_corrected_proof',
    'GD Member uploaded corrected Proof v' || next_version);

  return proof;
end;
$$;

revoke all on function public.gd_member_upload_corrected_proof(text, text, text, text) from public;
grant execute on function public.gd_member_upload_corrected_proof(text, text, text, text) to authenticated;

-- "Submit Corrected Proof" -- refuses unless a corrected proof was uploaded
-- and every Correction Checklist item is completed (same gate style as
-- gd_member_submit_proof() in 0059). CORRECTIONS_IN_PROGRESS -> FINAL_PROOF_READY.
create or replace function public.gd_member_submit_corrected_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; incomplete int; total int; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may submit the corrected proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'CORRECTIONS_IN_PROGRESS' then
    raise exception 'No corrections in progress to submit (status=%)', p.production_status;
  end if;

  select count(*) into total from public.manuscript_production_checklist where manuscript_id = p_manuscript_id and stage = 'CORRECTION';
  select count(*) into incomplete from public.manuscript_production_checklist where manuscript_id = p_manuscript_id and stage = 'CORRECTION' and status <> 'COMPLETED';
  if total = 0 or incomplete > 0 then
    raise exception 'Upload a corrected proof and check off every correction checklist item before submitting (% of % remaining)', incomplete, total;
  end if;

  update public.manuscript_production set production_status = 'FINAL_PROOF_READY', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'CORRECTIONS_IN_PROGRESS', 'FINAL_PROOF_READY', 'gd_member_submit_corrected_proof',
    'GD Member submitted corrected Proof v' || p.current_proof_version);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'FINAL_PROOF_READY', p_manuscript_id, 'Final proof ready for review: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.gd_member_submit_corrected_proof(text) from public;
grant execute on function public.gd_member_submit_corrected_proof(text) to authenticated;
