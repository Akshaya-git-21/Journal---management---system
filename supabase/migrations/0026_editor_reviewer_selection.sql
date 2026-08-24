-- ==========================================
-- Module 26: Editor selects reviewers -> Coordinator sends invitations ->
-- manuscript only becomes Peer Review (UNDER_REVIEW) once BOTH selected
-- reviewers have accepted.
--
-- Reuses the existing manuscript_suggested_reviewers / editor_reviewer_actions
-- / reviewer_assignments tables from 0002/0008 -- no new tables. The Editor
-- "selecting" a reviewer is recorded exactly like an editor suggestion
-- already was; the Coordinator "sending invitations" does what
-- coordinator_accept_suggestion() (0008) already does per suggestion, just
-- batched into one action instead of one-at-a-time Accept clicks.
--
-- Key behavior change from 0008: neither coordinator_accept_suggestion() nor
-- this new invitation RPC ever moved manuscripts.status (only
-- finalize_reviewer_board()/assign_reviewers() did, by jumping straight to
-- UNDER_REVIEW once 2 reviewers were merely INVITED). The new UI path added
-- here never calls finalize_reviewer_board()/assign_reviewers() -- instead,
-- respond_to_review_invite() is extended below to make that transition only
-- once both required reviewers have actually ACCEPTED. finalize_reviewer_board
-- and assign_reviewers are left completely unmodified for any other caller.
--
-- Depends on: 0002_manuscripts_workflow.sql, 0008_reviewer_assignment_workflow.sql,
-- 0025_editor_screening_questionnaire.sql.
-- Safe to re-run.
-- ==========================================

-- Step: Editor selects reviewers from the existing Reviewer Board (active
-- REVIEWER profiles) after choosing "Move to Next Stage" (recommendation =
-- 'ACCEPT' on their screening). Records them the same way an editor
-- suggestion always has -- suggested_by = 'EDITOR' on
-- manuscript_suggested_reviewers -- so the Coordinator's existing Review
-- Board view keeps working unchanged for any other suggestion source.
create or replace function public.editor_select_reviewers(
  p_manuscript_id text,
  p_reviewer_ids uuid[]
) returns setof public.manuscript_suggested_reviewers language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  a public.editor_assignments;
  rid uuid;
  reviewer public.profiles;
  inserted_id uuid;
begin
  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;
  if m.assigned_editor_id is distinct from auth.uid() then raise exception 'Only the assigned editor may select reviewers'; end if;
  if m.status is distinct from 'EDITOR_REVIEW' then raise exception 'Manuscript is not ready for reviewer selection (status=%)', m.status; end if;

  select * into a from public.editor_assignments
  where manuscript_id = p_manuscript_id and editor_id = auth.uid() and status = 'ACCEPTED'
  order by assigned_at desc limit 1;
  if a.id is null or a.recommendation is distinct from 'ACCEPT' then
    raise exception 'Move this manuscript to the next stage before selecting reviewers';
  end if;

  if array_length(p_reviewer_ids, 1) is distinct from 2 or p_reviewer_ids[1] = p_reviewer_ids[2] then
    raise exception 'Exactly 2 distinct reviewers are required';
  end if;

  foreach rid in array p_reviewer_ids loop
    select * into reviewer from public.profiles where id = rid and role = 'REVIEWER' and status = 'ACTIVE';
    if reviewer.id is null then raise exception 'Reviewer % is not an active reviewer account', rid; end if;
    if exists (
      select 1 from public.reviewer_assignments
      where manuscript_id = p_manuscript_id and reviewer_id = rid and status != 'DECLINED'
    ) then
      raise exception 'Reviewer % is already assigned to this manuscript', reviewer.name;
    end if;

    insert into public.manuscript_suggested_reviewers (manuscript_id, suggested_by, suggested_by_user, name, email, note)
    values (p_manuscript_id, 'EDITOR', auth.uid(), reviewer.name, reviewer.email, '')
    returning id into inserted_id;
  end loop;

  insert into public.workflow_notifications (recipient_id, type, manuscript_id, title, body)
  select id, 'EDITOR_SELECTED_REVIEWERS', p_manuscript_id, 'Editor selected reviewers: ' || m.title, ''
  from public.profiles where role = 'COORDINATOR' and status = 'ACTIVE';

  return query select * from public.manuscript_suggested_reviewers
    where manuscript_id = p_manuscript_id and suggested_by = 'EDITOR'
    order by created_at desc limit array_length(p_reviewer_ids, 1);
end;
$$;

revoke all on function public.editor_select_reviewers(text, uuid[]) from public;
grant execute on function public.editor_select_reviewers(text, uuid[]) to authenticated;

-- Step: Coordinator sends invitations for every still-pending EDITOR
-- suggestion on this manuscript in one action. Per-suggestion this is
-- exactly what coordinator_accept_suggestion() (0008) already does; batched
-- here so the Coordinator doesn't have to click Accept twice. Works for the
-- initial 2-reviewer selection and (0027) a later single-reviewer
-- replacement suggestion alike -- whatever is pending gets invited.
create or replace function public.coordinator_send_reviewer_invitations(p_manuscript_id text)
returns setof public.reviewer_assignments language plpgsql security definer set search_path = public as $$
declare
  m public.manuscripts;
  sug public.manuscript_suggested_reviewers;
  reviewer_profile public.profiles;
  pending_count int;
begin
  if not public.is_active_coordinator() then
    raise exception 'Only a Coordinator may send reviewer invitations';
  end if;

  select * into m from public.manuscripts where id = p_manuscript_id for update;
  if m.id is null then raise exception 'Manuscript not found'; end if;

  select count(*) into pending_count
  from public.manuscript_suggested_reviewers sr
  where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
    and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id);
  if pending_count = 0 then
    raise exception 'No pending reviewer selections to invite';
  end if;

  for sug in
    select * from public.manuscript_suggested_reviewers sr
    where sr.manuscript_id = p_manuscript_id and sr.suggested_by = 'EDITOR'
      and not exists (select 1 from public.editor_reviewer_actions a where a.suggestion_id = sr.id)
    order by sr.created_at
  loop
    select * into reviewer_profile from public.profiles
    where email = sug.email and role = 'REVIEWER' and status = 'ACTIVE';
    if reviewer_profile.id is null then
      raise exception 'Selected reviewer % is not an active reviewer account', sug.name;
    end if;

    if exists (
      select 1 from public.reviewer_assignments
      where manuscript_id = sug.manuscript_id and reviewer_id = reviewer_profile.id and status != 'DECLINED'
    ) then
      raise exception 'Reviewer % is already assigned to this manuscript', reviewer_profile.name;
    end if;

    insert into public.editor_reviewer_actions (manuscript_id, suggestion_id, action, coordinator_id)
    values (sug.manuscript_id, sug.id, 'ACCEPTED', auth.uid());

    insert into public.reviewer_assignments (manuscript_id, reviewer_id, assigned_by, status, invited_at)
    values (sug.manuscript_id, reviewer_profile.id, auth.uid(), 'INVITED', timezone('utc', now()));

    perform public._notify(
      reviewer_profile.id, 'REVIEW_INVITATION', sug.manuscript_id,
      'You are invited to review: ' || m.title,
      'The coordinator has sent your review invitation.'
    );
  end loop;

  return query select * from public.reviewer_assignments
    where manuscript_id = p_manuscript_id order by invited_at desc limit pending_count;
end;
$$;

revoke all on function public.coordinator_send_reviewer_invitations(text) from public;
grant execute on function public.coordinator_send_reviewer_invitations(text) to authenticated;

-- Step: reviewer accepts/declines. Extends respond_to_review_invite() (0002)
-- so that once BOTH required reviewers have accepted -- and only then --
-- the manuscript transitions EDITOR_REVIEW -> UNDER_REVIEW (Peer Review).
-- Declining leaves the manuscript at EDITOR_REVIEW (unchanged behavior,
-- restated here for clarity) and now also notifies the assigned Editor, not
-- just Coordinators.
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
      update public.manuscripts set status = 'UNDER_REVIEW', updated_at = timezone('utc', now()) where id = a.manuscript_id;
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
