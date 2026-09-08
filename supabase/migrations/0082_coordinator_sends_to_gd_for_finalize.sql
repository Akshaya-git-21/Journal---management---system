-- ==========================================
-- Module 82: same explicit-handoff pattern as every other step in this
-- workflow (Modules 75/76/77/78/79/80/81) -- Author's final approval
-- (AUTHOR_FINAL_APPROVED) must not put the "Move to Publish" button in
-- front of the GD Member automatically. The Coordinator must explicitly
-- click "Send to GD for Finalize" first.
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
    'EDITOR_APPROVED','AUTHOR_FINAL_APPROVED','SENT_TO_GD_FOR_FINALIZE'
  ));

-- Coordinator-only: explicit "Send to GD for Finalize" click once the
-- Author has given final approval (AUTHOR_FINAL_APPROVED).
create or replace function public.coordinator_send_to_gd_for_finalize(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send this to the GD Member';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'AUTHOR_FINAL_APPROVED' then
    raise exception 'No author-approved proof is pending to send to the GD Member (status=%)', p.production_status;
  end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  update public.manuscript_production
  set production_status = 'SENT_TO_GD_FOR_FINALIZE', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'AUTHOR_FINAL_APPROVED', 'SENT_TO_GD_FOR_FINALIZE', 'coordinator_send_to_gd_for_finalize');

  perform public._notify(p.assigned_to, 'READY_FOR_PUBLICATION', p_manuscript_id,
    'Ready to finalize and publish: ' || coalesce(m.title, p_manuscript_id),
    'Both editorial and author final approval are in -- move this to publish when ready.');

  return p;
end;
$$;

revoke all on function public.coordinator_send_to_gd_for_finalize(text) from public;
grant execute on function public.coordinator_send_to_gd_for_finalize(text) to authenticated;

-- GD Member's "Move to Publish" now requires the Coordinator to have sent
-- it on first, instead of firing directly off AUTHOR_FINAL_APPROVED.
create or replace function public.gd_member_move_to_publish(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_gd_member() or not public.is_gd_member_assigned_to(p_manuscript_id) then
    raise exception 'Only the GD Member assigned to this manuscript may move it to publish';
  end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'SENT_TO_GD_FOR_FINALIZE' then
    raise exception 'Manuscript is not ready to move to publish (status=%)', p.production_status;
  end if;

  update public.manuscript_production
  set production_status = 'READY_FOR_PUBLICATION', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'SENT_TO_GD_FOR_FINALIZE', 'READY_FOR_PUBLICATION', 'gd_member_move_to_publish');

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'READY_FOR_PUBLICATION', p_manuscript_id, 'Ready for publication: ' || coalesce(m.title, p_manuscript_id), ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return p;
end;
$$;

revoke all on function public.gd_member_move_to_publish(text) from public;
grant execute on function public.gd_member_move_to_publish(text) to authenticated;
