-- ==========================================
-- Module 80: Author's final approval no longer auto-lands on
-- READY_FOR_PUBLICATION -- it lands on AUTHOR_FINAL_APPROVED, and the GD
-- Member must explicitly click "Move to Publish" (gd_member_move_to_publish)
-- to advance it into READY_FOR_PUBLICATION, which is what the Coordinator's
-- Decision tab treats as the "ready for publish" stage. Same
-- explicit-handoff pattern as every other step in this workflow (Modules
-- 75/76/77/78/79).
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
    'EDITOR_APPROVED','AUTHOR_FINAL_APPROVED'
  ));

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
    set production_status = 'AUTHOR_FINAL_CORRECTIONS_REQUESTED', pending_review_role = null,
        editor_approved_version = null, editor_approved_at = null, editor_approved_by = null,
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED',
      'author_final_review_proof', p_comments);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
        'Author requested corrections on final review: ' || coalesce(m.title, p_manuscript_id), p_comments);
    end if;
  else
    if p.editor_approved_version is distinct from p.current_proof_version then
      raise exception 'Editor approval is not current for this proof version -- cannot give final approval';
    end if;

    update public.manuscript_proofs set approved_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id and version = p.current_proof_version;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FINAL', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    -- Module 80: recorded as approved, but the GD Member must explicitly
    -- click "Move to Publish" before this reaches the Coordinator's
    -- Ready-for-Publish stage.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_APPROVED', pending_review_role = null,
        author_final_approved_version = current_proof_version, author_final_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_AUTHOR_FINAL', 'AUTHOR_FINAL_APPROVED',
      'author_final_review_proof', 'Author gave final approval on Proof v' || p.current_proof_version);

    if p.assigned_to is not null then
      perform public._notify(p.assigned_to, 'READY_FOR_PUBLICATION', p_manuscript_id,
        'Author gave final approval: ' || coalesce(m.title, p_manuscript_id),
        'Both editorial and author final approval are in -- move this to publish when ready.');
    end if;
  end if;

  return p;
end;
$$;

revoke all on function public.author_final_review_proof(text, text, text, text, text, text) from public;
grant execute on function public.author_final_review_proof(text, text, text, text, text, text) to authenticated;

-- GD Member-only: the explicit "Move to Publish" click.
create or replace function public.gd_member_move_to_publish(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may move it to publish';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_APPROVED' then
    raise exception 'Manuscript is not ready to move to publish (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'READY_FOR_PUBLICATION', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_APPROVED', 'READY_FOR_PUBLICATION', 'gd_member_move_to_publish');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'READY_FOR_PUBLICATION', p_manuscript_id, 'Ready for publication: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.gd_member_move_to_publish(text) from public;
grant execute on function public.gd_member_move_to_publish(text) to authenticated;
