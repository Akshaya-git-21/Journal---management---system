-- ==========================================
-- Module 78: when the GD Member uploads a corrected proof in response to
-- the Editor's own "Corrections Required" (or the Author's Final Review
-- corrections), it no longer auto-routes back to the Editor -- it lands
-- with the Coordinator, who must explicitly click "Send to Editor", same
-- pattern as every other handoff in this workflow now (Modules 75/76/77).
-- ==========================================

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SUBMITTED_TO_COORDINATOR','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED',
    'CORRECTIONS_IN_PROGRESS','FINAL_PROOF_READY',
    'PROOF_SENT_TO_EDITOR','EDITOR_CORRECTIONS_REQUESTED',
    'PROOF_SENT_TO_AUTHOR_FINAL','AUTHOR_FINAL_CORRECTIONS_REQUESTED',
    'EDITOR_CORRECTIONS_PENDING_SEND','PROOF_READY_FOR_EDITOR'
  ));

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
    -- Module 78: editor-stage correction loop now also waits on the
    -- Coordinator's explicit "Send to Editor" click instead of auto-routing.
    update public.manuscript_production
    set current_proof_version = next_version, production_status = 'PROOF_READY_FOR_EDITOR', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        author_final_approved_version = null, author_final_approved_at = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_READY_FOR_EDITOR', 'gd_member_upload_proof_v2',
      'GD Member uploaded Proof v' || next_version || '; awaiting Coordinator review before Editor');
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

-- Widen the Module 76 RPC to also accept the corrected-proof case.
create or replace function public.coordinator_send_to_editor(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; editor_row record; prior_status text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Editor'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_APPROVED', 'PROOF_READY_FOR_EDITOR') then
    raise exception 'Proof is not ready to send to the Editor (status=%)', p.production_status;
  end if;
  prior_status := p.production_status;

  update public.manuscript_production
  set production_status = 'PROOF_SENT_TO_EDITOR', pending_review_role = 'EDITOR', sent_to_editor_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_EDITOR', 'coordinator_send_to_editor',
    'Proof v' || p.current_proof_version || ' sent to Editor');

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Proof ready for your review: ' || coalesce(m.title, p_manuscript_id), '');
  end loop;

  return p;
end;
$$;

revoke all on function public.coordinator_send_to_editor(text) from public;
grant execute on function public.coordinator_send_to_editor(text) to authenticated;
