-- ==========================================
-- Module 66: publish_decision() never set `origin` on the new revision row
-- it creates for a MINOR/MAJOR_REVISION decision, so it always fell back to
-- the column's default of 'EDITOR_SCREENING' -- even when the round just
-- decided was itself a real peer-review round (reviewers already assigned
-- and reporting). That mislabeled the next revision, which then flows into
-- EditorRevisionReview.tsx's screening-origin branch (0043) instead of the
-- peer-review-origin one: "Accept Submission" there stays at EDITOR_REVIEW
-- to open reviewer *selection* (submit_editor_recommendation's is_revision_
-- loop_round branch, 0043) rather than moving to AWAITING_DECISION for the
-- Coordinator's Move-to-Production confirm -- so the Coordinator's Decision
-- tab never saw anything to act on for an already-peer-reviewed manuscript's
-- next revision cycle.
--
-- Fix: set the new revision's origin to 'PEER_REVIEW' whenever this
-- manuscript already has any reviewer_assignments (a peer-review round has
-- happened at some point), otherwise leave it 'EDITOR_SCREENING' (the
-- correct default for a revision requested before peer review ever starts).
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
    rev_origin := case
      when exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id)
        then 'PEER_REVIEW'
      else 'EDITOR_SCREENING'
    end;
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status, origin)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD', rev_origin);
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);

  if p_decision = 'ACCEPT' then
    perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Manuscript Accepted',
      'Your manuscript has been accepted for publication. It will now proceed to the production and proofreading stage.');
  else
    perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

revoke all on function public.publish_decision(text, text, text) from public;
grant execute on function public.publish_decision(text, text, text) to authenticated;

-- One-off backfill: any revision after the first that the Coordinator
-- hasn't finalized yet (no coordinator_decision recorded) and that's
-- mislabeled EDITOR_SCREENING despite the manuscript already having
-- reviewer_assignments -- corrects in-flight data created before this fix
-- (including a round the Editor already decided but the Coordinator hasn't
-- confirmed), without touching history that's already fully closed out.
update public.manuscript_revisions r
set origin = 'PEER_REVIEW'
where r.origin = 'EDITOR_SCREENING'
  and r.revision_number > 1
  and r.coordinator_decision is null
  and exists (select 1 from public.reviewer_assignments ra where ra.manuscript_id = r.manuscript_id);

-- Consequence of the same bug: submit_editor_recommendation() (0043) only
-- advances a revision-loop ACCEPT to AWAITING_DECISION when the revision's
-- origin is 'PEER_REVIEW' -- with origin wrongly EDITOR_SCREENING at the
-- time, an already-accepted revision left its manuscript stuck at
-- EDITOR_REVIEW instead of reaching the Coordinator's Decision tab. Catch
-- exactly that: latest revision is COMPLETED+ACCEPT and (after the backfill
-- above) correctly PEER_REVIEW-origin, but the manuscript never advanced.
-- No manuscript_status_history/audit_log row is written here (unlike the
-- RPCs above) since this runs outside a request, with no auth.uid() to
-- attribute it to -- this is a one-time data correction, not a workflow step.
update public.manuscripts m
set status = 'AWAITING_DECISION', updated_at = timezone('utc', now())
where m.status = 'EDITOR_REVIEW'
  and exists (
    select 1 from public.manuscript_revisions r
    where r.manuscript_id = m.id
      and r.status = 'COMPLETED'
      and r.editor_decision = 'ACCEPT'
      and r.origin = 'PEER_REVIEW'
      and r.revision_number = (
        select max(r2.revision_number) from public.manuscript_revisions r2 where r2.manuscript_id = m.id
      )
  );
