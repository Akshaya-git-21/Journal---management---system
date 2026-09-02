-- ==========================================
-- Module 48: Standard notification copy for an ACCEPT decision.
--
-- publish_decision() previously sent every decision type (ACCEPT / REJECT /
-- MINOR_REVISION / MAJOR_REVISION) through the same generic notification --
-- "Decision on your manuscript: <title>" with the coordinator's typed
-- decision letter as the body. For ACCEPT specifically, the Author should
-- get a fixed, predictable message telling them what happens next (into
-- production/proofreading) rather than whatever the Coordinator happened to
-- type. This only changes the ACCEPT branch's notification; REJECT and the
-- two revision decisions keep sending the decision letter as before.
-- ==========================================

create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare m public.manuscripts; rec text; next_status text; rev_count int;
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
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status)
    values (p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD');
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
