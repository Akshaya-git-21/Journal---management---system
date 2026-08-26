-- ==========================================
-- Module 40: Editor's peer-review-round comments were never surfaced to
-- the Coordinator or Author -- found during live E2E testing of the full
-- revision loop.
--
-- Root cause: submit_editor_recommendation()'s is_peer_review_round branch
-- (0032) only writes p_comments into manuscript_status_history.note (an
-- audit log entry, never rendered as "editor comments" anywhere in the
-- UI). The revision row that eventually carries editor_comments to the
-- Coordinator's confirm screen and the Author's revision-request screen
-- doesn't exist yet at that point -- publish_decision() creates it later,
-- with no way to recover what the Editor typed.
--
-- Fix: stash the Editor's comment on editor_assignments (mirroring how
-- action_reason/screening_comments already work for the screening round),
-- then have publish_decision() copy it onto the new revision's
-- editor_comments column when the round being closed out is the ORIGINAL
-- peer-review round (rev_count = 0, rev_origin = 'PEER_REVIEW' -- the
-- revision-loop-round case already stamps editor_comments directly onto
-- the existing revision row in submit_editor_recommendation, so this only
-- ever needs to backfill the very first cycle).
--
-- Depends on: 0029_editor_peer_review_decision_gate.sql,
-- 0032_peer_review_rereview_decision.sql.
-- Safe to re-run.
-- ==========================================

alter table public.editor_assignments add column if not exists peer_review_comments text;

create or replace function public.submit_editor_recommendation(
  p_manuscript_id text,
  p_recommendation text,
  p_comments text default null,
  p_checklist jsonb default '[]'::jsonb,
  p_reason text default null
)
returns public.editor_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  latest_rev public.manuscript_revisions;
  is_revision_loop_round boolean;
  is_peer_review_round boolean;
  from_status text;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may recommend'; end if;
  from_status := m.status;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null then raise exception 'No active editor assignment found'; end if;

  select * into latest_rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;

  is_revision_loop_round := latest_rev.id is not null and latest_rev.status = 'UNDER_REVIEW' and (
    m.status = 'EDITOR_REVIEW'
    or (m.status = 'AWAITING_DECISION' and latest_rev.origin = 'PEER_REVIEW')
  );
  is_peer_review_round := not is_revision_loop_round and m.status = 'AWAITING_DECISION'
    and exists (select 1 from public.reviewer_assignments where manuscript_id = p_manuscript_id);

  if not is_revision_loop_round and not is_peer_review_round and a.assessment_status is distinct from 'SUBMITTED' then
    raise exception 'You must submit the screening questionnaire before making a recommendation';
  end if;

  if p_recommendation not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW') then
    raise exception 'Invalid recommendation';
  end if;

  if not is_revision_loop_round and not is_peer_review_round
     and p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reject or return this manuscript to the author';
  end if;

  update public.editor_assignments
  set recommendation = p_recommendation, recommendation_submitted_at = timezone('utc', now()),
      action_reason = case when not is_revision_loop_round and not is_peer_review_round then p_reason else action_reason end,
      -- New: stash the peer-review-round comment where publish_decision()
      -- can find it once the Coordinator confirms and the revision row
      -- actually gets created (see below).
      peer_review_comments = case when is_peer_review_round then p_comments else peer_review_comments end
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  returning * into a;

  if a.id is null then raise exception 'No active editor assignment found'; end if;

  if is_revision_loop_round then
    update public.manuscript_revisions
    set editor_comments = coalesce(p_comments, editor_comments),
        editor_checklist = coalesce(p_checklist, editor_checklist),
        editor_decision = p_recommendation,
        editor_decision_at = timezone('utc', now()),
        status = 'COMPLETED'
    where id = latest_rev.id;

    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;

    perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation');
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if is_peer_review_round then
    perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation', p_comments);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor decided on peer review: ' || m.title, coalesce(p_comments, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION') then
    update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
    perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation', p_reason);
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id,
      case when p_recommendation = 'REJECT' then 'Editor recommends rejection: ' else 'Editor requests revision: ' end || m.title,
      coalesce(p_reason, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    return a;
  end if;

  perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_RECOMMENDATION_READY', p_manuscript_id, 'Editor recommendation ready: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return a;
end;
$$;

revoke all on function public.submit_editor_recommendation(text, text, text, jsonb, text) from public;
grant execute on function public.submit_editor_recommendation(text, text, text, jsonb, text) to authenticated;

-- publish_decision(): copy the Editor's stashed peer-review comment onto
-- the new revision row when this is the first peer-review round closing
-- out (rev_count = 0 before insert, rev_origin = 'PEER_REVIEW'). Everything
-- else unchanged from 0039.
create or replace function public.publish_decision(p_manuscript_id text, p_decision text, p_decision_letter text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts; rec text; next_status text; rev_count int; rev_origin text;
  editor_note text;
begin
  if not public.is_active_coordinator() then raise exception 'Only a Coordinator may publish a decision'; end if;
  if p_decision not in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT') then raise exception 'Invalid decision'; end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then raise exception 'Manuscript is not awaiting a decision (status=%)', m.status; end if;

  select recommendation, peer_review_comments into rec, editor_note from public.editor_assignments
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
    insert into public.manuscript_revisions (manuscript_id, revision_number, requested_by, decision_letter, status, origin, decision_type, editor_comments)
    values (
      p_manuscript_id, rev_count + 1, auth.uid(), p_decision_letter, 'AWAITING_AUTHOR_UPLOAD', rev_origin, p_decision,
      case when rev_count = 0 and rev_origin = 'PEER_REVIEW' then editor_note else null end
    );
  end if;

  perform public._record_transition(p_manuscript_id, 'AWAITING_DECISION', next_status, 'publish_decision', p_decision_letter);
  perform public._notify(m.author_id, 'DECISION_PUBLISHED', p_manuscript_id, 'Decision on your manuscript: ' || m.title, p_decision_letter);

  select * into m from public.manuscripts where id = p_manuscript_id;
  return m;
end;
$$;

revoke all on function public.publish_decision(text, text, text) from public;
grant execute on function public.publish_decision(text, text, text) to authenticated;
