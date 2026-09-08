-- ==========================================
-- Module 76: Author's approval no longer auto-routes to the Editor -- it
-- lands with the Coordinator (AUTHOR_APPROVED) who must explicitly click
-- "Send to Editor for Approval", same Coordinator-mediated pattern as
-- Module 75's GD -> Coordinator -> Author loop.
-- ==========================================

create or replace function public.author_approve_proof(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.author_id is distinct from auth.uid() then raise exception 'Not your manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('AUTHOR_PROOF_REVIEW','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No proof awaiting your approval (status=%)', p.production_status;
  end if;

  update public.manuscript_proofs set approved_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  insert into public.manuscript_proof_reviews (manuscript_id, proof_version, reviewer_role, decision, comments, decided_by)
  values (p_manuscript_id, p.current_proof_version, 'AUTHOR_FIRST', 'APPROVED', '', auth.uid());

  update public.manuscript_production
  set production_status = 'AUTHOR_APPROVED', pending_review_role = null, updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  perform public._record_transition(p_manuscript_id, 'AUTHOR_PROOF_REVIEW', 'AUTHOR_APPROVED', 'author_approve_proof',
    'Author approved Proof v' || p.current_proof_version);

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'PROOF_APPROVED', p_manuscript_id, 'Author approved the proof: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.author_approve_proof(text) from public;
grant execute on function public.author_approve_proof(text) to authenticated;

-- Coordinator-only: the explicit "Send to Editor for Approval" click.
create or replace function public.coordinator_send_to_editor(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; editor_row record;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Editor'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_APPROVED' then
    raise exception 'Proof is not yet approved by the Author (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'PROOF_SENT_TO_EDITOR', pending_review_role = 'EDITOR', sent_to_editor_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_APPROVED', 'PROOF_SENT_TO_EDITOR', 'coordinator_send_to_editor',
    'Proof v' || p.current_proof_version || ' sent to Editor for approval');

  for editor_row in
    select editor_id from public.editor_assignments where manuscript_id = p_manuscript_id and status = 'ACCEPTED'
  loop
    perform public._notify(editor_row.editor_id, 'PRODUCTION_CORRECTIONS_FOR_VERIFICATION', p_manuscript_id,
      'Author-approved proof ready for your review: ' || coalesce(m.title, p_manuscript_id), '');
  end loop;

  return p;
end;
$$;

revoke all on function public.coordinator_send_to_editor(text) from public;
grant execute on function public.coordinator_send_to_editor(text) to authenticated;
