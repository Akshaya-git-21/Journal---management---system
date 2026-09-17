-- ==========================================
-- Module 93: Phase 2 -- Author's Final Review corrections now go through
-- the Coordinator and Editor before reaching the GD Member, instead of
-- routing straight to the GD Member.
--
-- New sub-flow (only for a correction requested on PROOF_SENT_TO_AUTHOR_FINAL):
--   Author requests corrections -> lands with the Coordinator
--   (AUTHOR_FINAL_CORRECTIONS_SUBMITTED) -> Coordinator explicitly sends to
--   the Editor (AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW) -> Editor sees
--   the Author's request plus a comment box and exactly two actions:
--     - Move to GD: forwards to the GD Member, reusing the existing
--       AUTHOR_FINAL_CORRECTIONS_REQUESTED status (already wired end-to-end
--       -- the GD Member's upload panel already handles it, and uploading
--       already re-enters the Module 92 Editor-review loop via
--       gd_member_upload_proof_v2). If the Editor left a comment, it's
--       recorded as a separate GD-facing correction entry (correction_source
--       'EDITOR'), alongside the Author's own, reusing the GD Member's
--       existing Corrections list UI (already differentiates by source).
--     - Return to Author: goes back to PROOF_SENT_TO_AUTHOR_FINAL so the
--       Author sees Accept/Corrections Required again on the same proof.
--       Requires a comment, shown to the Author as the reason.
--
-- Nothing else in this workflow changes -- editor_review_proof (the proof
-- itself), coordinator_send_to_editor, editor_send_corrections_to_gd, etc.
-- are all untouched.
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
    'EDITOR_CORRECTIONS_PENDING_SEND','PROOF_READY_FOR_EDITOR',
    'EDITOR_APPROVED',
    'AUTHOR_FINAL_CORRECTIONS_SUBMITTED','AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW'
  ));

alter table public.manuscript_proof_reviews drop constraint if exists manuscript_proof_reviews_decision_check;
alter table public.manuscript_proof_reviews add constraint manuscript_proof_reviews_decision_check
  check (decision in ('APPROVED','CORRECTIONS_REQUESTED','OVERRIDE','RETURNED_TO_AUTHOR'));

-- Author's Final Review "Corrections Required" now lands with the
-- Coordinator instead of routing straight to the GD Member.
create or replace function public.author_final_review_proof(
  p_manuscript_id text, p_decision text, p_comments text default '',
  p_storage_path text default '', p_public_url text default '', p_file_name text default ''
) returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  if p_decision not in ('APPROVE','CORRECTIONS_REQUIRED') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SENT_TO_AUTHOR_FINAL' then
    raise exception 'No proof is currently awaiting your final review (status=%)', p.production_status;
  end if;

  if p_decision = 'CORRECTIONS_REQUIRED' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

    insert into public.manuscript_production_corrections
      (manuscript_id, proof_version, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, coalesce(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR')
    returning * into c;

    insert into public.manuscript_proof_reviews
      (manuscript_id, proof_version, reviewer_role, decision, comments, attachment_storage_path, attachment_public_url, attachment_file_name, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'CORRECTIONS_REQUESTED', p_comments,
      nullif(p_storage_path, ''), p_public_url, p_file_name, 'AUTHOR', auth.uid());

    if p.editor_approved_version is not null then
      update public.manuscript_proof_reviews
      set superseded_at = timezone('utc', now())
      where manuscript_id = p_manuscript_id and reviewer_role = 'EDITOR'
        and proof_version = p.editor_approved_version and superseded_at is null;
    end if;

    -- Module 93: lands with the Coordinator now, not the GD Member.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED',
      'author_final_review_proof', p_comments);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED', p_manuscript_id,
      'Author requested corrections on final review: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    if p.editor_approved_version is distinct from p.current_proof_version then
      raise exception 'Editor approval is not current for this proof version -- cannot give final approval';
    end if;

    update public.manuscript_proofs set approved_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id and version = p.current_proof_version;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    update public.manuscript_production
    set production_status = 'READY_FOR_PUBLICATION', pending_review_role = null,
        author_final_approved_version = current_proof_version, author_final_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'READY_FOR_PUBLICATION',
      'author_final_review_proof', 'Author gave final approval on Proof v' || p.current_proof_version);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'READY_FOR_PUBLICATION', p_manuscript_id,
        'Ready for publication: ' || coalesce(m.title, p_manuscript_id),
        'Both editorial and author final approval are in -- enter publication metadata and publish when ready.');
    end if;
  end if;

  return p;
end;
$$;

revoke all on function public.author_final_review_proof(text, text, text, text, text, text) from public;
grant execute on function public.author_final_review_proof(text, text, text, text, text, text) to authenticated;

-- Coordinator-only: the explicit "Send to Editor" click for the Author's
-- Final Review correction request.
create or replace function public.coordinator_send_author_corrections_to_editor(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; editor_row record;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this to the Editor'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED' then
    raise exception 'No Author correction request is awaiting send to the Editor (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', pending_review_role = 'EDITOR',
      sent_to_editor_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_SUBMITTED', 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW',
    'coordinator_send_author_corrections_to_editor', 'Proof v' || p.current_proof_version || ' -- Author''s correction request sent to Editor');

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Author requested corrections -- your review needed: ' || coalesce(m.title, p_manuscript_id), '');
  end loop;

  return p;
end;
$$;

revoke all on function public.coordinator_send_author_corrections_to_editor(text) from public;
grant execute on function public.coordinator_send_author_corrections_to_editor(text) to authenticated;

-- Editor-only: decides what to do with the Author's Final Review correction
-- request. Always exactly two actions.
create or replace function public.editor_review_author_corrections(p_manuscript_id text, p_decision text, p_comments text default '')
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if p_decision not in ('MOVE_TO_GD','RETURN_TO_AUTHOR') then raise exception 'Invalid decision'; end if;
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may review this'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW' then
    raise exception 'No Author correction request is currently awaiting your review (status=%)', p.production_status;
  end if;

  if p_decision = 'RETURN_TO_AUTHOR' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to return this to the Author'; end if;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'RETURNED_TO_AUTHOR', p_comments, auth.uid());

    update public.manuscript_production
    set production_status = 'PROOF_SENT_TO_AUTHOR_FINAL', pending_review_role = 'AUTHOR_FINAL', updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'PROOF_SENT_TO_AUTHOR_FINAL',
      'editor_review_author_corrections', p_comments);

    perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
      'The Editor has responded to your correction request: ' || coalesce(m.title, p_manuscript_id), p_comments);
  else
    if coalesce(trim(p_comments), '') <> '' then
      insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
      values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR');
    end if;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'CORRECTIONS_REQUESTED', coalesce(p_comments, ''), 'AUTHOR', auth.uid());

    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_CORRECTIONS_REQUESTED', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED',
      'editor_review_author_corrections', 'Editor moved Author''s correction request to the GD Member');

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
        'Corrections to action: ' || coalesce(m.title, p_manuscript_id), p_comments);
    end if;
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_author_corrections(text, text, text) from public;
grant execute on function public.editor_review_author_corrections(text, text, text) to authenticated;
