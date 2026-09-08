-- ==========================================
-- Module 75: simplify the Author-facing proof loop to be Coordinator-
-- mediated, per exact spec:
--   GD uploads proof -> Coordinator sees it -> Coordinator clicks
--   "Send Proof to Author" -> Author Approves or Requests Corrections ->
--   (if corrections) GD Member updates & uploads a new version -> repeat.
--   When the Author Approves, the manuscript moves to Editor Final
--   Approval (unchanged -- author_approve_proof already does this).
--
-- Only gd_member_upload_proof_v2 changes: it no longer auto-sends the
-- initial proof to the Author, nor auto-routes a correction round to the
-- Editor. Every version now lands on PROOF_GENERATED for the Coordinator to
-- review and explicitly send via the existing send_proof_to_author() RPC
-- (unchanged, already Coordinator-only, already handles PROOF_GENERATED).
-- The separate Editor-stage correction loop (EDITOR_CORRECTIONS_REQUESTED /
-- AUTHOR_FINAL_CORRECTIONS_REQUESTED -> back to the Editor) is untouched.
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

  if prior_status in ('EDITOR_CORRECTIONS_REQUESTED', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED') then
    -- Editor-stage correction loop: unchanged, always back to the Editor.
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_SENT_TO_EDITOR', pending_review_role = 'EDITOR',
        sent_to_editor_at = timezone('utc', now()),
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_EDITOR', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; sent to Editor');
  else
    -- Author-facing loop (initial upload, or a correction the Author
    -- requested before ever reaching the Editor): lands with the
    -- Coordinator, who must explicitly send it on via send_proof_to_author().
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
