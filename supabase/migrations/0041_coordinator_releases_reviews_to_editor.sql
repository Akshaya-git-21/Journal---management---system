-- ==========================================
-- Module 41: explicit Coordinator -> Editor handoff for peer reviews.
--
-- Previously the Editor could see and decide on peer reviews the instant
-- both reviewers submitted (direct RLS access to reviewer_assignments, no
-- Coordinator step in between). Per explicit request, the Coordinator must
-- now release the completed reviews to the Editor before the Editor's
-- decision screen unlocks -- matching the diagram:
--   Reviewers -> Coordinator -> Editor -> ... -> Coordinator -> Author
--
-- manuscripts.reviews_released_at tracks this per round: set by
-- coordinator_send_reviews_to_editor(), cleared whenever a fresh round of
-- reviews starts being collected (both-reviewers-accept transition to
-- UNDER_REVIEW, and the re-review invite in coordinator_send_revision_to_
-- reviewers) so a stale release from an earlier round can't leak through.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0026_editor_reviewer_selection.sql,
-- 0031_reviewer_revision_loop.sql.
-- Safe to re-run.
-- ==========================================

alter table public.manuscripts add column if not exists reviews_released_at timestamptz;

-- Step: Coordinator forwards the completed review round to the Editor.
create or replace function public.coordinator_send_reviews_to_editor(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  active_count int;
  submitted_count int;
  editor_id uuid;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send reviews to the editor';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'AWAITING_DECISION' then
    raise exception 'Manuscript is not awaiting a decision (status=%)', m.status;
  end if;

  select count(*) into active_count from public.reviewer_assignments
  where manuscript_id = p_manuscript_id and status != 'DECLINED';
  select count(*) into submitted_count from public.reviewer_assignments
  where manuscript_id = p_manuscript_id and status = 'SUBMITTED';
  if active_count = 0 or active_count != submitted_count then
    raise exception 'Not all reviewers have submitted their reviews yet';
  end if;

  update public.manuscripts set reviews_released_at = timezone('utc', now())
  where id = p_manuscript_id returning * into m;

  select assigned_editor_id into editor_id from public.manuscripts where id = p_manuscript_id;
  if editor_id is not null then
    perform public._notify(editor_id, 'REVIEWS_READY_FOR_DECISION', p_manuscript_id, 'Reviews are ready for your decision: ' || m.title);
  end if;

  return m;
end;
$$;

revoke all on function public.coordinator_send_reviews_to_editor(text) from public;
grant execute on function public.coordinator_send_reviews_to_editor(text) to authenticated;

-- Clear the flag whenever a fresh round of reviews starts being collected,
-- so a stale release from a prior round never lets the Editor skip ahead.
create or replace function public.respond_to_review_invite(p_assignment_id uuid, p_accept boolean)
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

  update public.reviewer_assignments
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end, responded_at = timezone('utc', now())
  where id = p_assignment_id returning * into a;

  select * into m from public.manuscripts where id = a.manuscript_id for update;

  if p_accept then
    select count(*) into active_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status != 'DECLINED';
    select count(*) into accepted_count from public.reviewer_assignments
    where manuscript_id = a.manuscript_id and status = 'ACCEPTED';

    if m.status = 'EDITOR_REVIEW' and active_count >= 2 and accepted_count >= 2 then
      update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()), reviews_released_at = null
      where id = a.manuscript_id;
      perform public._record_transition(a.manuscript_id, 'EDITOR_REVIEW', 'UNDER_REVIEW', 'respond_to_review_invite', 'Both reviewers accepted');
      if m.assigned_editor_id is not null then
        perform public._notify(m.assigned_editor_id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title);
      end if;
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'PEER_REVIEW_STARTED', a.manuscript_id, 'Both reviewers accepted, peer review started: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    else
      insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
      select id, 'REVIEWER_ACCEPTED', a.manuscript_id, 'A reviewer accepted: ' || m.title, ''
      from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    end if;
  else
    insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
    select id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, may need a replacement', ''
    from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';
    if m.assigned_editor_id is not null then
      perform public._notify(m.assigned_editor_id, 'REVIEWER_DECLINED', a.manuscript_id, 'A reviewer declined, please select a replacement: ' || m.title);
    end if;
  end if;

  return a;
end;
$$;

revoke all on function public.respond_to_review_invite(uuid, boolean) from public;
grant execute on function public.respond_to_review_invite(uuid, boolean) to authenticated;

-- Re-review invite (0031): also clear the flag so the re-review round
-- requires its own fresh release.
create or replace function public.coordinator_send_revision_to_reviewers(p_manuscript_id text)
returns public.manuscripts language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  rev public.manuscript_revisions;
  prior_round int;
  ra public.reviewer_assignments;
  invited_count int := 0;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send a revision to the reviewers';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.status is distinct from 'REVISION_REQUESTED' then
    raise exception 'Manuscript is not awaiting a revision decision (status=%)', m.status;
  end if;

  select * into rev from public.manuscript_revisions
  where manuscript_id = p_manuscript_id order by revision_number desc limit 1;
  if rev.id is null or rev.status is distinct from 'REVISION_SUBMITTED' then
    raise exception 'No submitted revision is ready to send to the reviewers';
  end if;
  if rev.origin is distinct from 'PEER_REVIEW' then
    raise exception 'This revision did not originate from a peer-review decision -- send it to the Editor instead';
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

  perform public._record_transition(p_manuscript_id, 'REVISION_REQUESTED', 'UNDER_REVIEW', 'coordinator_send_revision_to_reviewers');

  return m;
end;
$$;

revoke all on function public.coordinator_send_revision_to_reviewers(text) from public;
grant execute on function public.coordinator_send_revision_to_reviewers(text) to authenticated;
