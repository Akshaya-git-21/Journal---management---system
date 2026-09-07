-- ==========================================
-- Module 67: send_proof_to_author() (0047/0065) rejected the one case a
-- Coordinator actually wants a "Send Proof to Author" button for while the
-- manuscript is already in PROOFREADING -- the current proof is already
-- with the Author, awaiting their response, and the Coordinator wants to
-- resend/re-notify (e.g. the Author says they never got the notification,
-- or the Coordinator just wants to nudge them). Widen the allowed prior
-- statuses to include PROOF_SENT_TO_AUTHOR itself, so re-sending the exact
-- same current proof version is just a re-notify, not an error.
-- ==========================================

create or replace function public.send_proof_to_author(p_manuscript_id text)
returns public.manuscript_production language plpgsql security definer set search_path = public as $$
declare p public.manuscript_production; m public.manuscripts; prior_status text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may send the proof to the Author'; end if;

  select * into p from public.manuscript_production where manuscript_id = p_manuscript_id for update;
  if p.manuscript_id is null then raise exception 'Production has not started for this manuscript'; end if;
  if p.production_status not in ('PROOF_GENERATED','PROOF_UPDATED','PROOF_SUBMITTED_TO_COORDINATOR','FINAL_PROOF_READY','PROOF_SENT_TO_AUTHOR') then
    raise exception 'No new proof to send (status=%)', p.production_status;
  end if;
  prior_status := p.production_status;

  update public.manuscript_proofs set sent_to_author_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id and version = p.current_proof_version;

  update public.manuscript_production set production_status = 'PROOF_SENT_TO_AUTHOR', updated_at = timezone('utc', now())
  where manuscript_id = p_manuscript_id returning * into p;

  select * into m from public.manuscripts where id = p_manuscript_id;
  -- Only record a status-history/audit transition when the status actually
  -- changed -- a resend from PROOF_SENT_TO_AUTHOR back to itself would
  -- otherwise log a no-op "PROOF_SENT_TO_AUTHOR -> PROOF_SENT_TO_AUTHOR" row.
  if prior_status is distinct from 'PROOF_SENT_TO_AUTHOR' then
    perform public._record_transition(p_manuscript_id, prior_status, 'PROOF_SENT_TO_AUTHOR', 'send_proof_to_author',
      'Proof v' || p.current_proof_version || ' sent to author');
  end if;
  perform public._notify(m.author_id, 'PROOF_SENT', p_manuscript_id,
    'Your final proof is ready: ' || m.title, 'Proof v' || p.current_proof_version || ' is ready for your review.');

  return p;
end;
$$;

revoke all on function public.send_proof_to_author(text) from public;
grant execute on function public.send_proof_to_author(text) to authenticated;
