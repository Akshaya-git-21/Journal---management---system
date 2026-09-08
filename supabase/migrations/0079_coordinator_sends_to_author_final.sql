-- ==========================================
-- Module 79: Editor's Approve/Publish no longer auto-routes to the Author
-- for Final Review -- it lands with the Coordinator (EDITOR_APPROVED), who
-- must explicitly click "Send for Author Confirmation", same
-- Coordinator-mediated pattern as every other handoff (Modules 75/76/77/78).
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
    'EDITOR_APPROVED'
  ));

create or replace function public.editor_review_proof(p_manuscript_id text, p_decision text, p_comments text default '')
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections;
begin
  if p_decision not in ('APPROVE','CORRECTIONS_REQUIRED') then raise exception 'Invalid decision'; end if;
  if not public.is_invited_editor_of(p_manuscript_id) then raise exception 'Only the assigned Editor may review this proof'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SENT_TO_EDITOR' then
    raise exception 'No proof is currently awaiting your review (status=%)', p.production_status;
  end if;

  if p_decision = 'CORRECTIONS_REQUIRED' then
    if coalesce(trim(p_comments), '') = '' then raise exception 'Comments are required to request corrections'; end if;

    insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
    values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR')
    returning * into c;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'CORRECTIONS_REQUESTED', p_comments, 'EDITOR', auth.uid());

    update public.manuscript_production
    set production_status = 'EDITOR_CORRECTIONS_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_EDITOR', 'EDITOR_CORRECTIONS_PENDING_SEND', 'editor_review_proof', p_comments);
  else
    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'APPROVED', coalesce(p_comments, ''), auth.uid());

    -- Module 79: recorded as approved, but the Coordinator must explicitly
    -- send it on to the Author for final confirmation.
    update public.manuscript_production
    set production_status = 'EDITOR_APPROVED', pending_review_role = null,
        editor_approved_version = current_proof_version, editor_approved_by = auth.uid(), editor_approved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'PROOF_SENT_TO_EDITOR', 'EDITOR_APPROVED', 'editor_review_proof',
      'Editor approved Proof v' || p.current_proof_version);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_APPROVED_PROOF', p_manuscript_id, 'Editor approved the proof: ' || coalesce(m.title, p_manuscript_id), ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_proof(text, text, text) from public;
grant execute on function public.editor_review_proof(text, text, text) to authenticated;

-- Coordinator-only: the explicit "Send for Author Confirmation" click.
create or replace function public.coordinator_send_to_author_final(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Author for final confirmation'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'EDITOR_APPROVED' then
    raise exception 'Proof is not yet approved by the Editor (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'PROOF_SENT_TO_AUTHOR_FINAL', pending_review_role = 'AUTHOR_FINAL', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'EDITOR_APPROVED', 'PROOF_SENT_TO_AUTHOR_FINAL', 'coordinator_send_to_author_final',
    'Proof v' || p.current_proof_version || ' sent to Author for final confirmation');

  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'Editor-approved proof ready for your final review: ' || m.title,
    'Proof v' || p.current_proof_version || ' has been approved by the editorial team.');

  return p;
end;
$$;

revoke all on function public.coordinator_send_to_author_final(text) from public;
grant execute on function public.coordinator_send_to_author_final(text) to authenticated;
