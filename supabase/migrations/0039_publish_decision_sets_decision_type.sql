-- ==========================================
-- Module 39: publish_decision() never stamped decision_type onto the
-- revision row it creates -- found while live-testing the peer-review
-- re-review loop (0031/0032): after the Coordinator confirms the Editor's
-- MINOR_REVISION/MAJOR_REVISION peer-review call, the new revision's
-- decision_type is null, so DecisionTab.tsx's "First Submission Decision"
-- pill (and getRevisionDecisionLabel's dynamic "Minor Revision N+1"
-- wording elsewhere) has nothing to read and falls back to "Pending".
--
-- Fix: stamp decision_type = p_decision on insert, same as decision_letter
-- already is. Everything else in publish_decision is unchanged from 0029.
--
-- Depends on: 0029_editor_peer_review_decision_gate.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rec text; next_status text; rev_count int; rev_origin text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish a decision'; end if;
  if p_decision not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Manuscript is not awaiting a decision (status=%)', m.status; end if;

  select recommendation into rec from public.editor_assignments
  where manuscript_id = p_manuscript_id and status = 'ACCEPTED' order by assigned_at desc limit 1;
  if rec is null then raise exception 'Editor has not submitted a recommendation yet'; end if;

  next_status := case p_decision
    when 'ACCEPT' then 'ACCEPTED'
    when 'REJECT' then 'REJECTED'
    else 'REVISION_REQUESTED'
  end;

  update public.manuscripts set status = next_status, updated_at = timezone('utc', now()) where id = p_manuscript_id;

  if next_status = 'REVISION_REQUESTED' then
    select count(*) into rev_count from public.manuscript_revisions where manuscript_id = p_manuscript_id;
    rev_origin := case when exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id)
      then 'PEER_REVIEW' else 'EDITOR_SCREENING' end;
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status, origin, decision_type)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD', rev_origin, p_decision);
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

revoke all on function public.publish_decision(text, text, text) from public;
grant execute on function public.publish_decision(text, text, text) to authenticated;

-- No backfill: existing PEER_REVIEW-origin rows with decision_type still
-- null have no reliable source to recover MINOR vs MAJOR from (the
-- decision that created them isn't retained anywhere else once
-- editor_decision on the same row gets reused for the *next* cycle's
-- decision) -- DecisionTab.tsx's 'Pending' fallback (see decisionUtils.ts)
-- displays those honestly rather than guessing. Only new rows created after
-- this migration are affected.
