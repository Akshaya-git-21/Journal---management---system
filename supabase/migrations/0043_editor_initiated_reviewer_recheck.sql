-- ==========================================
-- Module 43: editor-initiated "send this revision to the reviewers"
-- (formerly the Coordinator's own call, made automatically for every
-- peer-review-origin revision the instant the Author resubmitted, with the
-- Editor never seeing it at all -- see OverviewTab.tsx's isPeerReviewRevision
-- split before this migration). Per explicit workflow correction: every
-- resubmitted revision goes to the Editor first; the Editor decides whether
-- it needs another look from the reviewers, and the Coordinator (still the
-- one who actually executes every hand-off) carries that out.
--
-- Two changes:
--
-- 1. submit_editor_recommendation()'s is_revision_loop_round branch: the
--    new ADDITIONAL_REVIEW recommendation (already a valid-but-unused enum
--    member since 0002) now takes the same "hand off to Coordinator" path as
--    REJECT/MINOR_REVISION/MAJOR_REVISION. Also, ACCEPT on a PEER_REVIEW-
--    origin revision now takes that same path -- 0042 made ACCEPT stay at
--    EDITOR_REVIEW so the reviewer-*selection* screen unlocks, which is
--    correct for a screening-origin revision (no reviewers exist yet) but
--    wrong for a peer-review-origin one (reviewers were already selected;
--    "Accept" here means the manuscript is done, not "go pick reviewers
--    again") -- it needs to reach the Coordinator's final Accept/Reject
--    confirm instead.
--
-- 2. coordinator_send_revision_to_reviewers(): previously only callable
--    immediately after Author resubmission (manuscript AWAITING revision
--    decision, revision REVISION_SUBMITTED). Now also callable after the
--    Editor has reviewed the resubmission and recommended ADDITIONAL_REVIEW
--    (manuscript AWAITING_DECISION, revision COMPLETED with that decision
--    stamped) -- the actual new entry point, now that the Coordinator no
--    longer calls this unprompted at resubmission time (OverviewTab.tsx's
--    "Send to Reviewers for Re-review" button is removed as part of this
--    same change). The original direct-from-author precondition is kept so
--    the function isn't a breaking change for any other caller.
--
-- Depends on: 0002_manuscripts_workflow.sql (ADDITIONAL_REVIEW enum member),
-- 0041_coordinator_releases_reviews_to_editor.sql, 0042_fix_revision_loop_accept_status.sql.
-- Safe to re-run.
-- ==========================================

-- manuscript_revisions.editor_decision has a check constraint (0019) that
-- never included ADDITIONAL_REVIEW -- widen it so submit_editor_recommendation
-- can actually stamp that value on the revision row below.
alter table public.manuscript_revisions drop constraint if exists manuscript_revisions_editor_decision_check;
alter table public.manuscript_revisions add constraint manuscript_revisions_editor_decision_check
  check (editor_decision is null or editor_decision in ('ACCEPT','MINOR_REVISION','MAJOR_REVISION','REJECT','ADDITIONAL_REVIEW'));

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

    -- Hand off to the Coordinator for REJECT/MINOR/MAJOR (as before),
    -- ADDITIONAL_REVIEW (Editor wants the reviewers to re-check this
    -- revision), and ACCEPT on a peer-review-origin revision (nothing left
    -- to pick reviewers for -- this needs the Coordinator's final
    -- Accept/Reject confirm, not another trip through reviewer selection).
    -- Only ACCEPT on a screening-origin revision still stays at
    -- EDITOR_REVIEW, unlocking reviewer *selection* as 0042 intended.
    if p_recommendation in ('REJECT','MINOR_REVISION','MAJOR_REVISION','ADDITIONAL_REVIEW')
       or (p_recommendation = 'ACCEPT' and latest_rev.origin = 'PEER_REVIEW') then
      update public.manuscripts set status = 'AWAITING_DECISION', updated_at = timezone('utc', now()) where id = p_manuscript_id;
      perform public._record_transition(p_manuscript_id, from_status, 'AWAITING_DECISION', 'submit_editor_recommendation');
    else
      perform public._record_transition(p_manuscript_id, from_status, from_status, 'submit_editor_recommendation');
    end if;

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

-- Step 2: coordinator_send_revision_to_reviewers() now also accepts the
-- editor-initiated entry point (AWAITING_DECISION + COMPLETED revision with
-- editor_decision = ADDITIONAL_REVIEW), alongside the original
-- direct-from-author one (REVISION_REQUESTED + REVISION_SUBMITTED).
create or replace function public.coordinator_send_revision_to_reviewers(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  rev public.manuscript_revisions;
  prior_round int;
  ra public.reviewer_assignments;
  invited_count int := 0;
  from_status text;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send a revision to the reviewers';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  from_status := m.status;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;
  if rev.id is null then raise exception 'No revision found for this manuscript'; end if;
  if rev.origin is distinct from 'PEER_REVIEW' then
    raise exception 'This revision did not originate from a peer-review decision -- send it to the Editor instead';
  end if;

  if m.status = 'REVISION_REQUESTED' and rev.status = 'REVISION_SUBMITTED' then
    -- direct-from-author entry point (kept for compatibility)
    null;
  elsif m.status = 'AWAITING_DECISION' and rev.status = 'COMPLETED' and rev.editor_decision = 'ADDITIONAL_REVIEW' then
    -- editor-initiated entry point: Editor reviewed the resubmission and
    -- asked for another look from the reviewers
    null;
  else
    raise exception 'No revision is ready to send to the reviewers (status=%, revision status=%)', m.status, rev.status;
  end if;

  select coalesce(max(revision_number), 0) into prior_round
  from public.reviewer_assignments where manuscript_id = p_manuscript_id and revision_number < rev.revision_number;

  for ra in
    select * from public.reviewer_assignments
    where manuscript_id = p_manuscript_id and revision_number = prior_round and status != 'DECLINED'
  loop
    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at, revision_number)
    values (p_manuscript_id, ra.reviewer_id, auth.uid(), 'INVITED', timezone('utc', now()), rev.revision_number);
    perform public._notify(
      ra.reviewer_id, 'REVISION_READY_FOR_REVIEW', p_manuscript_id,
      'Revision ' || rev.revision_number || ' is ready for your re-review: ' || m.title
    );
    invited_count := invited_count + 1;
  end loop;

  if invited_count = 0 then
    raise exception 'No prior reviewers are available to re-invite -- assign replacements first';
  end if;

  update public.manuscript_revisions set status = 'UNDER_REVIEW' where id = rev.id;
  update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()), reviews_released_at = null
  where id = p_manuscript_id returning * into m;

  perform public._record_transition(p_manuscript_id, from_status, 'UNDER_REVIEW', 'coordinator_send_revision_to_reviewers');

  return m;
end;
$$;

revoke all on function public.coordinator_send_revision_to_reviewers(text) from public;
grant execute on function public.coordinator_send_revision_to_reviewers(text) to authenticated;
