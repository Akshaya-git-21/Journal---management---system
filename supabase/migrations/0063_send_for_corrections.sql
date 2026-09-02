-- ==========================================
-- Module 63: Task 14 -- Coordinator consolidates Author comments + Editor
-- comments + current proof and sends the manuscript back to the GD Member
-- for corrections. New explicit status (CORRECTIONS_IN_PROGRESS) so the GD
-- Member's "Corrections" queue reflects "the Coordinator handed this back
-- to me" distinctly from the Author/Editor review states that precede it.
-- ==========================================

alter table public.manuscript_production drop constraint if exists manuscript_production_status_check;
alter table public.manuscript_production add constraint manuscript_production_status_check
  check (production_status in (
    'NOT_STARTED','IN_PRODUCTION','COPYEDITING','FORMATTING','TYPESETTING',
    'PROOF_GENERATED','PROOF_SENT_TO_AUTHOR','AUTHOR_PROOF_REVIEW',
    'CORRECTIONS_SUBMITTED','PRODUCTION_REVIEW','PROOF_UPDATED',
    'CLARIFICATION_REQUESTED','AUTHOR_APPROVED','READY_FOR_PUBLICATION','PUBLISHED',
    'CORRECTIONS_IN_PROGRESS'
  ));

create or replace function public.coordinator_send_for_corrections(p_manuscript_id text, p_correction_id uuid, p_note text default null)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; c public.manuscript_production_corrections; prev_status text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send a manuscript for corrections'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select * into c from public.manuscript_production_corrections where id = p_correction_id and manuscript_id = p_manuscript_id;
  if c.id is null then raise exception 'Correction not found for this manuscript'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.assigned_to is null then raise exception 'No GD Member is assigned to this manuscript'; end if;

  prev_status := p.production_status;

  update public.manuscript_production
  set production_status = 'CORRECTIONS_IN_PROGRESS', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id
  returning * into p;

  perform public._record_transition(p_manuscript_id, prev_status, 'CORRECTIONS_IN_PROGRESS', 'coordinator_send_for_corrections', p_note);
  perform public._notify(p.assigned_to, 'CORRECTIONS_PACKAGE_READY', p_manuscript_id,
    'Corrections package ready: ' || m.title,
    'Author + Editor comments are ready for you to action in the Corrections queue.');

  return p;
end;
$$;

revoke all on function public.coordinator_send_for_corrections(text, uuid, text) from public;
grant execute on function public.coordinator_send_for_corrections(text, uuid, text) to authenticated;
