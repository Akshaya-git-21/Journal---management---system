-- ==========================================
-- Module 30: Bug fix -- respond_to_review_invite()'s accept-gated transition
-- to UNDER_REVIEW (Peer Review) only counted reviewer_assignments rows with
-- status = 'ACCEPTED', missing rows that already progressed to 'SUBMITTED'.
--
-- Found via Phase 2 Checkpoint B testing: if one reviewer accepts and
-- submits their review before the second reviewer even responds, the second
-- reviewer's accept never sees accepted_count >= 2 (the first reviewer is
-- now 'SUBMITTED', not 'ACCEPTED'), so the manuscript never transitions to
-- UNDER_REVIEW -- and since submit_peer_review()'s own "last reviewer in"
-- completion check requires m.status = 'UNDER_REVIEW', the manuscript gets
-- permanently stuck at EDITOR_REVIEW even though both reviews are in.
--
-- Fix: "committed" (didn't decline) reviewers who count toward the 2-of-2
-- gate are those with status in ('ACCEPTED','SUBMITTED'), not just
-- 'ACCEPTED'. Everything else in this function is unchanged from
-- 0028_reviewer_peer_review_questionnaire.sql.
--
-- Depends on: 0028_reviewer_peer_review_questionnaire.sql.
-- Safe to re-run.
-- ==========================================

create or replace function public.respond_to_review_invite(p_assignment_id uuid, p_accept boolean, p_reason text default null)
returns public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  a public.reviewer_assignments;
  m public.manuscripts;
  active_count int;
  accepted_count int;
begin
  select * into a from public.reviewer_assignments where id = p_assignment_id for update;
  if a.id is null then raise exception 'Invitation not found'; end if;
  if a.reviewer_id is distinct from auth.uid() then raise exception 'Not your invitation'; end if;
  if a.status is distinct from 'INVITED' then raise exception 'Invitation already responded to'; end if;
  if not p_accept and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to decline this invitation';
  end if;

  update public.reviewer_assignments
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end, responded_at = timezone('utc', now()),
      decline_reason = case when p_accept then decline_reason else p_reason end
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  if p_accept then
    select count(*) into active_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status != 'DECLINED';
    -- A reviewer who already submitted has, by definition, also accepted --
    -- count both statuses so a fast reviewer submitting before the other
    -- even responds doesn't stall this gate forever.
    select count(*) into accepted_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status in ('ACCEPTED', 'SUBMITTED');

    if m.status = 'EDITOR_REVIEW' and active_count >= 2 and accepted_count >= 2 then
      update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()) where id = a.manuscript_id;
      perform public._record_transition(a.manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'respond_to_review_invite', 'Both reviewers accepted');
      if m.assigned_editor_id is not null then
        perform public._notify(m.assigned_editor_id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title);
      end if;
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

      -- The manuscript may already have every reviewer at SUBMITTED by the
      -- time this fires (the exact scenario this migration fixes) -- in
      -- that case the transition straight to AWAITING_DECISION happens
      -- here, since submit_peer_review()'s own completion check already
      -- ran earlier while m.status was still EDITOR_REVIEW and so no-opped.
      if active_count = accepted_count and not exists (
        select 1 from public.reviewer_assignments
        where manuscript_id = a.manuscript_id and status in ('INVITED', 'ACCEPTED')
      ) then
        update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = a.manuscript_id;
        perform public._record_transition(a.manuscript_id, 'UNDER_REVIEW', 'AWAITING_DECISION', 'all_reviews_submitted');
        if m.assigned_editor_id is not null then
          perform public._notify(m.assigned_editor_id, 'REVIEWS_COMPLETE', a.manuscript_id, 'All reviews are in for: ' || m.title);
        end if;
      end if;
    else
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'REVIEWER_ACCEPTED', a.manuscript_id, 'A reviewer accepted: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    end if;
  else
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, may need a replacement', coalesce(p_reason, '')
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, please select a replacement: ' || m.title, coalesce(p_reason, ''));
    end if;
  end if;

  return a;
end;
$$;

revoke all on function public.respond_to_review_invite(uuid, boolean, text) from public;
grant execute on function public.respond_to_review_invite(uuid, boolean, text) to authenticated;
