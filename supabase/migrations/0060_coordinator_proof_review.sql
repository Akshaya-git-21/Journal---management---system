-- ==========================================
-- Module 60: Coordinator reviews the GD Member's submitted proof (Task 10).
--
-- The "Send Proof to Author" side of this review was already covered by
-- send_proof_to_author() accepting PROOF_SUBMITTED_TO_COORDINATOR (see
-- 0059_gd_member_proof_preparation.sql). This adds the other outcome:
-- returning the proof to the GD Member for another pass -- back to
-- PROOF_GENERATED, the same status the GD Member's Proof Preparation panel
-- already treats as editable (upload/replace/notes/checklist unlocked,
-- Submit button re-enabled once they re-satisfy the checklist gate).
-- ==========================================

create or replace function public.coordinator_return_proof_to_gd_member(p_manuscript_id text, p_note text default '')
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may return a proof to the GD Member'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status <> 'PROOF_SUBMITTED_TO_COORDINATOR' then
    raise exception 'No submitted proof to return (status=%)', p.production_status;
  end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  update public.manuscript_production set production_status = 'PROOF_GENERATED', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  perform public._record_transition(p_manuscript_id, 'PROOF_SUBMITTED_TO_COORDINATOR', 'PROOF_GENERATED', 'coordinator_return_proof_to_gd_member', p_note);
  perform public._notify(p.assigned_to, 'PROOF_RETURNED', p_manuscript_id,
    'Coordinator returned the proof for revisions: ' || coalesce(m.title, p_manuscript_id), p_note);

  return p;
end;
$$;

revoke all on function public.coordinator_return_proof_to_gd_member(text, text) from public;
grant execute on function public.coordinator_return_proof_to_gd_member(text, text) to authenticated;
