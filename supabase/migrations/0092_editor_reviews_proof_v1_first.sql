-- ==========================================
-- Module 92: Proof v1 now goes to the Editor first, not the Author.
--
-- New Phase 1 (per exact spec):
--   GD uploads Proof v1 -> lands with the Coordinator, who sends it to the
--   Editor -> Editor Accepts or requests Corrections -> (if corrections)
--   Coordinator -> GD Member -> GD resubmits -> Coordinator sends the
--   corrected proof back to the Editor -> loop continues until the Editor
--   accepts -> Coordinator sends the accepted proof to the Author.
--
-- Only gd_member_upload_proof_v2 changes, and only for the very first
-- upload (current_proof_version = 0): it now lands on PROOF_READY_FOR_EDITOR
-- instead of PROOF_GENERATED -- the exact same status (and exact same
-- Coordinator "Send to Editor" button, coordinator_send_to_editor(), already
-- widened in 0078 to accept PROOF_READY_FOR_EDITOR) that the existing
-- Editor-correction loop already uses. Every other branch, and every other
-- RPC in this workflow (author_approve_proof, author_submit_corrections,
-- editor_review_proof, coordinator_send_to_editor,
-- editor_send_corrections_to_gd, coordinator_send_to_author_final, ...) is
-- untouched -- they simply go unused by new manuscripts for the
-- now-skipped Author-first round, exactly as instructed.
-- ==========================================

create or replace function public.gd_member_upload_proof_v2(
  p_manuscript_id text, p_storage_path text, p_public_url text, p_file_name text, p_notes text default ''
) returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare
  p public.manuscript_production;
  proof public.manuscript_proofs;
  next_version int;
  prior_status text;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may upload its proof';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;

  if p.current_proof_version = 0 then
    if p.production_status not in ('TYPESETTING','PROOF_GENERATED') then
      raise exception 'Manuscript is not ready for proof preparation (status=%)', p.production_status;
    end if;
  else
    if p.production_status not in ('CORRECTIONS_IN_PROGRESS','EDITOR_CORRECTIONS_REQUESTED','AUTHOR_FINAL_CORRECTIONS_REQUESTED') then
      raise exception 'Manuscript is not awaiting a corrected proof (status=%)', p.production_status;
    end if;
  end if;
  prior_status := p.production_status;
  next_version := p.current_proof_version + 1;

  insert into public.manuscript_proofs (manuscript_id, version, file_name, storage_path, public_url, uploaded_by, gd_notes)
  values (p_manuscript_id, next_version, p_file_name, p_storage_path, p_public_url, auth.uid(), coalesce(p_notes, ''))
  returning * into proof;

  -- Rule 6: a fresh upload always invalidates any standing approval.
  if p.editor_approved_version is not null then
    update public.manuscript_proof_reviews
    set superseded_at = timezone('utc', now()), superseded_by_version = next_version
    where manuscript_id = p_manuscript_id and reviewer_role = 'EDITOR'
      and proof_version = p.editor_approved_version and superseded_at is null;
  end if;
  if p.author_final_approved_version is not null then
    update public.manuscript_proof_reviews
    set superseded_at = timezone('utc', now()), superseded_by_version = next_version
    where manuscript_id = p_manuscript_id and reviewer_role = 'AUTHOR_FINAL'
      and proof_version = p.author_final_approved_version and superseded_at is null;
  end if;

  -- Module 92: Proof v1 (next_version = 1) now joins the same
  -- Coordinator-sends-to-Editor branch as the Editor-stage correction loop,
  -- instead of the old Author-facing PROOF_GENERATED branch below.
  if next_version = 1 or prior_status in ('EDITOR_CORRECTIONS_REQUESTED', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED') then
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_READY_FOR_EDITOR', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_READY_FOR_EDITOR', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; awaiting Coordinator review before Editor');
  else
    -- Legacy Author-facing branch: only reachable via CORRECTIONS_IN_PROGRESS,
    -- which requires author_submit_corrections() to have run -- itself only
    -- reachable from PROOF_SENT_TO_AUTHOR/AUTHOR_PROOF_REVIEW, a status no
    -- new manuscript reaches anymore now that v1 always goes to the Editor
    -- first. Left in place as a safety net for any manuscript already
    -- mid-flight on the old path.
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_GENERATED', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_GENERATED', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; awaiting Coordinator review');
  end if;

  return p;
end;
$$;

revoke all on function public.gd_member_upload_proof_v2(text, text, text, text, text) from public;
grant execute on function public.gd_member_upload_proof_v2(text, text, text, text, text) to authenticated;
