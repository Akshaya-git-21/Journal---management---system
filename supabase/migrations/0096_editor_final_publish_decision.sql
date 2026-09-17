-- ==========================================
-- Module 96: Phase 4 -- Final Editor Approval.
--
-- Fixes a regression Module 93 introduced: author_final_review_proof's
-- APPROVE branch had been rewritten to jump straight to READY_FOR_PUBLICATION,
-- silently undoing Module 80's AUTHOR_FINAL_APPROVED gate. Restored here,
-- and built on: Author's final approval lands with the Coordinator
-- (AUTHOR_FINAL_APPROVED, unchanged target) -> Coordinator "Send to Editor"
-- (new, replaces the old "Send to GD for Finalize" action for this status)
-- -> Editor sees exactly two actions: Publish (-> READY_FOR_PUBLICATION,
-- reusing the Coordinator's existing "choose Publisher" gate) or Move to GD
-- (-> AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND, the exact same Module 94 GD
-- loop already built for Phase 4's correction round).
--
-- The old SENT_TO_GD_FOR_FINALIZE / gd_member_move_to_publish path (Modules
-- 80/82) is left installed, untouched, but no longer reached from this flow.
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
    'AUTHOR_FINAL_CORRECTIONS_SUBMITTED','AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW',
    'AUTHOR_FINAL_RETURN_PENDING_SEND','AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND',
    'AUTHOR_FINAL_APPROVED','SENT_TO_GD_FOR_FINALIZE',
    'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW'
  ));

-- Restores Module 80's AUTHOR_FINAL_APPROVED target on APPROVE (Module 93
-- had wrongly reverted this to READY_FOR_PUBLICATION directly). The
-- CORRECTIONS_REQUIRED branch is unchanged from Module 93.
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

    -- Module 96 (restoring Module 80): lands with the Coordinator, who must
    -- explicitly send it to the Editor for the final publish decision.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_APPROVED', pending_review_role = null,
        author_final_approved_version = current_proof_version, author_final_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_APPROVED',
      'author_final_review_proof', 'Author gave final approval on Proof v' || p.current_proof_version);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_APPROVED', p_manuscript_id, 'Author gave final approval: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.author_final_review_proof(text, text, text, text, text, text) from public;
grant execute on function public.author_final_review_proof(text, text, text, text, text, text) to authenticated;

-- Coordinator-only: the explicit "Send to Editor" click once the Author has
-- given final approval. Replaces coordinator_send_to_gd_for_finalize()
-- (Module 82) as the action for this status -- that RPC is left installed
-- but no longer called from here.
create or replace function public.coordinator_send_author_final_approval_to_editor(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; editor_row record;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this to the Editor'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_APPROVED' then
    raise exception 'Author has not yet given final approval (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW', pending_review_role = 'EDITOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_APPROVED', 'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW',
    'coordinator_send_author_final_approval_to_editor', 'Proof v' || p.current_proof_version || ' -- Author final approval sent to Editor');

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Author gave final approval -- your publish decision needed: ' || coalesce(m.title, p_manuscript_id), '');
  end loop;

  return p;
end;
$$;

revoke all on function public.coordinator_send_author_final_approval_to_editor(text) from public;
grant execute on function public.coordinator_send_author_final_approval_to_editor(text) to authenticated;

-- Editor-only: the final publish decision. Always exactly two actions.
create or replace function public.editor_review_author_final_approval(p_manuscript_id text, p_decision text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if p_decision not in ('PUBLISH','MOVE_TO_GD') then raise exception 'Invalid decision'; end if;
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may make this decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW' then
    raise exception 'No manuscript is currently awaiting your publish decision (status=%)', p.production_status;
  end if;

  if p_decision = 'PUBLISH' then
    update public.manuscript_production
    set production_status = 'READY_FOR_PUBLICATION', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW', 'READY_FOR_PUBLICATION',
      'editor_review_author_final_approval', 'Editor approved Proof v' || p.current_proof_version || ' for publication');

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'READY_FOR_PUBLICATION', p_manuscript_id,
      'Ready for publication: ' || coalesce(m.title, p_manuscript_id),
      'The Editor has approved this for publication -- choose a Publisher when ready.'
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_APPROVED_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND',
      'editor_review_author_final_approval', 'Editor moved this to the GD Member before publishing');

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', p_manuscript_id,
      'Editor moved a manuscript toward the GD Member: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_author_final_approval(text, text) from public;
grant execute on function public.editor_review_author_final_approval(text, text) to authenticated;
