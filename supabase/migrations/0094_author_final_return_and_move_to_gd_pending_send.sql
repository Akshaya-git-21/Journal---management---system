-- ==========================================
-- Module 94: Phase 3/4 -- both of the Editor's decisions on the Author's
-- Final Review correction request (Module 93) now land with the
-- Coordinator first, who must explicitly send them on, instead of routing
-- straight to their destination. Same Coordinator-mediated pattern as every
-- other handoff in this workflow.
--
-- Phase 3 (Return to Author): Editor "Return to Author" -> lands with the
-- Coordinator (AUTHOR_FINAL_RETURN_PENDING_SEND) -> Coordinator "Send to
-- Author" -> PROOF_SENT_TO_AUTHOR_FINAL (unchanged from Module 93 -- the
-- Author already sees the Editor's comment). Everything after that (Author
-- responds -> Coordinator -> Editor sees it again) already works via the
-- Module 93 loop.
--
-- Phase 4 (Move to GD): Editor "Move to GD" -> lands with the Coordinator
-- (AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND) -> Coordinator "Send to GD" ->
-- AUTHOR_FINAL_CORRECTIONS_REQUESTED (unchanged from Module 93 -- the GD
-- Member's existing upload panel already handles it, and uploading already
-- rejoins the Module 92 Editor-review loop).
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
    'AUTHOR_FINAL_RETURN_PENDING_SEND','AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND'
  ));

-- Editor's decision on the Author's Final Review correction request now
-- lands with the Coordinator either way, instead of routing straight to
-- its destination.
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

    -- Module 94: lands with the Coordinator now, not the Author directly.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_RETURN_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_RETURN_PENDING_SEND',
      'editor_review_author_corrections', p_comments);

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_RETURN_PENDING_SEND', p_manuscript_id,
      'Editor responded to the Author''s correction request: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  else
    if coalesce(trim(p_comments), '') <> '' then
      insert into public.manuscript_production_corrections (manuscript_id, proof_version, comments, correction_source)
      values (p_manuscript_id, p.current_proof_version, p_comments, 'EDITOR');
    end if;

    insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, correction_source, decided_by)
    values (p_manuscript_id, p.current_proof_version, 'EDITOR', 'CORRECTIONS_REQUESTED', coalesce(p_comments, ''), 'AUTHOR', auth.uid());

    -- Module 94: lands with the Coordinator now, not the GD Member directly.
    update public.manuscript_production
    set production_status = 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', pending_review_role = null, updated_at = timezone('utc', now())
    where manuscript_id = p_manuscript_id returning * into p;

    perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_CORRECTIONS_UNDER_EDITOR_REVIEW', 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND',
      'editor_review_author_corrections', 'Editor moved Author''s correction request toward the GD Member');

    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', p_manuscript_id,
      'Editor moved a correction request toward the GD Member: ' || coalesce(m.title, p_manuscript_id), p_comments
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
  end if;

  return p;
end;
$$;

revoke all on function public.editor_review_author_corrections(text, text, text) from public;
grant execute on function public.editor_review_author_corrections(text, text, text) to authenticated;

-- Coordinator-only: the explicit "Send to Author" click for Phase 3.
create or replace function public.coordinator_send_author_final_return(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this to the Author'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_RETURN_PENDING_SEND' then
    raise exception 'Nothing is awaiting send to the Author (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'PROOF_SENT_TO_AUTHOR_FINAL', pending_review_role = 'AUTHOR_FINAL', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_RETURN_PENDING_SEND', 'PROOF_SENT_TO_AUTHOR_FINAL',
    'coordinator_send_author_final_return', 'Proof v' || p.current_proof_version || ' -- Editor''s response sent to Author');

  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'The Editor has responded to your correction request: ' || coalesce(m.title, p_manuscript_id), '');

  return p;
end;
$$;

revoke all on function public.coordinator_send_author_final_return(text) from public;
grant execute on function public.coordinator_send_author_final_return(text) to authenticated;

-- Coordinator-only: the explicit "Send to GD" click for Phase 4.
create or replace function public.coordinator_send_author_final_corrections_to_gd(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send this to the GD Member'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND' then
    raise exception 'Nothing is awaiting send to the GD Member (status=%)', p.production_status;
  end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  update public.manuscript_production
  set production_status = 'AUTHOR_FINAL_CORRECTIONS_REQUESTED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_MOVE_TO_GD_PENDING_SEND', 'AUTHOR_FINAL_CORRECTIONS_REQUESTED',
    'coordinator_send_author_final_corrections_to_gd', 'Proof v' || p.current_proof_version || ' -- corrections sent to GD Member');

  perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
    'Corrections to action: ' || coalesce(m.title, p_manuscript_id), '');

  return p;
end;
$$;

revoke all on function public.coordinator_send_author_final_corrections_to_gd(text) from public;
grant execute on function public.coordinator_send_author_final_corrections_to_gd(text) to authenticated;
